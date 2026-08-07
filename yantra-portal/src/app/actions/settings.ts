"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import {
  SETTING_KEYS,
  setSystemSettings,
  parseEngineSequence,
  serializeEngineSequence,
  type SettingKey,
} from "@/lib/system-settings";
import { RESUME_LAYOUTS, resolveLayoutId } from "@/lib/resume/templates";
import {
  parseResumeEnginePolicy,
  serializeResumeEnginePolicy,
  tryRegExp,
} from "@/lib/resume/resume-engine-policy";

const LAYOUT_IDS = new Set(RESUME_LAYOUTS.map((l) => l.id));

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export async function saveSystemSettings(formData: FormData): Promise<SettingsActionResult> {
  const admin = await requireAdmin();

  const companyName = String(formData.get("companyName") || "").trim();
  const supportEmail = String(formData.get("supportEmail") || "").trim();
  const dailyCap = Number(formData.get("dailyAiCostCapUsd"));
  const defaultLayoutId = String(
    formData.get("defaultLayoutId") || "signal_classic"
  );
  const defaultExportFormat = String(formData.get("defaultExportFormat") || "DOCX");
  const allowSelf = formData.get("allowEmployeeSelfChains") === "on" || formData.get("allowEmployeeSelfChains") === "true";
  const policyJson = String(formData.get("resumeEnginePolicyJson") || "").trim();
  const engineSeqRaw = String(formData.get("resumeEngineSequence") || "").trim();
  const llmProviderRaw = String(formData.get("llmProvider") || "openai")
    .trim()
    .toLowerCase();
  const llmModelOverride = String(formData.get("llmModelOverride") || "")
    .trim()
    .slice(0, 120);

  if (!companyName) return { ok: false, error: "Company name is required." };
  if (!supportEmail || !supportEmail.includes("@")) {
    return { ok: false, error: "A valid support email is required." };
  }
  if (!Number.isFinite(dailyCap) || dailyCap < 0) {
    return { ok: false, error: "Daily AI cost cap must be a non-negative number." };
  }
  const resolvedDefaultLayout = resolveLayoutId(defaultLayoutId);
  if (!LAYOUT_IDS.has(resolvedDefaultLayout as never)) {
    return { ok: false, error: "Invalid default layout." };
  }
  if (defaultExportFormat !== "DOCX" && defaultExportFormat !== "DOCX_PDF") {
    return { ok: false, error: "Invalid export format." };
  }
  const llmProvider =
    llmProviderRaw === "anthropic" || llmProviderRaw === "claude"
      ? "anthropic"
      : llmProviderRaw === "openai"
        ? "openai"
        : null;
  if (!llmProvider) {
    return {
      ok: false,
      error: "LLM provider must be openai or anthropic (Claude).",
    };
  }

  let resumePolicySerialized = "";
  if (policyJson) {
    try {
      JSON.parse(policyJson);
    } catch {
      return { ok: false, error: "Resume engine policy must be valid JSON." };
    }
    const policy = parseResumeEnginePolicy(policyJson);
    // Validate regex sources early so admin gets a clear error
    for (const rule of policy.domainRules) {
      for (const p of rule.patterns) {
        if (!tryRegExp(p, "i")) {
          return {
            ok: false,
            error: `Invalid domain pattern regex for "${rule.id}": ${p}`,
          };
        }
      }
    }
    for (const rule of policy.offDomainRules) {
      if (!tryRegExp(rule.banPattern, "i")) {
        return {
          ok: false,
          error: `Invalid off-domain banPattern: ${rule.banPattern}`,
        };
      }
    }
    for (const p of policy.criticalPhrasePatterns) {
      if (!tryRegExp(p, "i")) {
        return { ok: false, error: `Invalid critical phrase regex: ${p}` };
      }
    }
    resumePolicySerialized = serializeResumeEnginePolicy(policy);
  }

  const engineSeq = parseEngineSequence(
    engineSeqRaw || "ai-tailor,progressive-rules"
  );

  const pairs: Partial<Record<SettingKey, string>> = {
    [SETTING_KEYS.COMPANY_NAME]: companyName,
    [SETTING_KEYS.SUPPORT_EMAIL]: supportEmail,
    [SETTING_KEYS.DAILY_AI_COST_CAP_USD]: String(dailyCap),
    [SETTING_KEYS.DEFAULT_LAYOUT_ID]: resolvedDefaultLayout,
    [SETTING_KEYS.DEFAULT_EXPORT_FORMAT]: defaultExportFormat,
    [SETTING_KEYS.ALLOW_EMPLOYEE_SELF_CHAINS]: allowSelf ? "true" : "false",
    [SETTING_KEYS.RESUME_ENGINE_SEQUENCE]: serializeEngineSequence(engineSeq),
    [SETTING_KEYS.LLM_PROVIDER]: llmProvider,
    [SETTING_KEYS.LLM_MODEL_OVERRIDE]: llmModelOverride,
  };
  if (resumePolicySerialized) {
    pairs[SETTING_KEYS.RESUME_ENGINE_POLICY] = resumePolicySerialized;
  }

  await setSystemSettings(pairs);
  await audit("settings.update", admin.id, {
    ...pairs,
    [SETTING_KEYS.RESUME_ENGINE_POLICY]: resumePolicySerialized
      ? "(updated)"
      : undefined,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/admin/candidates");
  return { ok: true };
}
