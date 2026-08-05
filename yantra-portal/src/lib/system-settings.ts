import { prisma } from "@/lib/db";
import { RESUME_LAYOUTS } from "@/lib/resume/templates";
import {
  DEFAULT_RESUME_ENGINE_POLICY,
  parseResumeEnginePolicy,
  RESUME_POLICY_SETTING_KEY,
  serializeResumeEnginePolicy,
  type ResumeEnginePolicy,
} from "@/lib/resume/resume-engine-policy";
import {
  buildActiveLlmConfig,
  parseLlmProvider,
  resolveProviderSelection,
  type ActiveLlmConfig,
  type LlmProvider,
} from "@/lib/resume/llm-config";

export const SETTING_KEYS = {
  COMPANY_NAME: "company_name",
  SUPPORT_EMAIL: "support_email",
  DAILY_AI_COST_CAP_USD: "daily_ai_cost_cap_usd",
  DEFAULT_LAYOUT_ID: "default_layout_id",
  DEFAULT_EXPORT_FORMAT: "default_export_format",
  ALLOW_EMPLOYEE_SELF_CHAINS: "allow_employee_self_chains",
  RESUME_ENGINE_POLICY: RESUME_POLICY_SETTING_KEY,
  /** Comma-separated engine order, e.g. ai-tailor,progressive-rules */
  RESUME_ENGINE_SEQUENCE: "resume_engine_sequence",
  /** openai | anthropic (Claude) — API keys stay in env */
  LLM_PROVIDER: "llm_provider",
  /** Optional model override for active provider (empty = env default) */
  LLM_MODEL_OVERRIDE: "llm_model_override",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Production engines admin can sequence */
export type ResumeEngineId = "ai-tailor" | "progressive-rules";

export const RESUME_ENGINE_OPTIONS: {
  id: ResumeEngineId;
  label: string;
  description: string;
}[] = [
  {
    id: "ai-tailor",
    label: "AI Tailor (LLM)",
    description: "Primary: full AI JSON pack via OpenAI or Claude (Admin → LLM provider)",
  },
  {
    id: "progressive-rules",
    label: "Progressive Rules (backup)",
    description: "Rules engine: same assembly, no LLM — master + policy soft-fill",
  },
];

export const DEFAULT_ENGINE_SEQUENCE: ResumeEngineId[] = [
  "ai-tailor",
  "progressive-rules",
];

export function parseEngineSequence(raw: string | null | undefined): ResumeEngineId[] {
  if (!raw || !raw.trim()) return [...DEFAULT_ENGINE_SEQUENCE];
  const allowed = new Set<string>(["ai-tailor", "progressive-rules"]);
  const parts = raw
    .split(/[,|;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => allowed.has(s)) as ResumeEngineId[];
  // Dedupe preserve order
  const out: ResumeEngineId[] = [];
  for (const p of parts) {
    if (!out.includes(p)) out.push(p);
  }
  return out.length ? out : [...DEFAULT_ENGINE_SEQUENCE];
}

export function serializeEngineSequence(seq: ResumeEngineId[]): string {
  return (seq.length ? seq : DEFAULT_ENGINE_SEQUENCE).join(",");
}

export type SystemConfig = {
  companyName: string;
  supportEmail: string;
  dailyAiCostCapUsd: number;
  defaultLayoutId: string;
  defaultExportFormat: "DOCX" | "DOCX_PDF";
  allowEmployeeSelfChains: boolean;
  /** Admin-maintained resume engine policy (domain rules, caps, templates) */
  resumeEnginePolicy: ResumeEnginePolicy;
  /** Pretty JSON for admin textarea */
  resumeEnginePolicyJson: string;
  /** Ordered engines: try first, then backup on failure */
  resumeEngineSequence: ResumeEngineId[];
  resumeEngineSequenceRaw: string;
  /** Admin-selected LLM: openai | anthropic */
  llmProvider: LlmProvider;
  /** Optional model id override for active provider */
  llmModelOverride: string;
};

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  companyName: "SR SOFT LLC",
  supportEmail: "admin@srsoft.com",
  dailyAiCostCapUsd: 25,
  defaultLayoutId: "ats_classic",
  defaultExportFormat: "DOCX",
  allowEmployeeSelfChains: true,
  resumeEnginePolicy: DEFAULT_RESUME_ENGINE_POLICY,
  resumeEnginePolicyJson: serializeResumeEnginePolicy(DEFAULT_RESUME_ENGINE_POLICY),
  resumeEngineSequence: [...DEFAULT_ENGINE_SEQUENCE],
  resumeEngineSequenceRaw: serializeEngineSequence(DEFAULT_ENGINE_SEQUENCE),
  llmProvider: "openai",
  llmModelOverride: "",
};

const LAYOUT_IDS = new Set(RESUME_LAYOUTS.map((l) => l.id));

export async function getSystemConfig(): Promise<SystemConfig> {
  const rows = await prisma.systemSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const layout = map.get(SETTING_KEYS.DEFAULT_LAYOUT_ID) || DEFAULT_SYSTEM_CONFIG.defaultLayoutId;
  const exportFmt =
    map.get(SETTING_KEYS.DEFAULT_EXPORT_FORMAT) || DEFAULT_SYSTEM_CONFIG.defaultExportFormat;
  const capRaw = map.get(SETTING_KEYS.DAILY_AI_COST_CAP_USD);
  const cap = capRaw != null ? Number(capRaw) : DEFAULT_SYSTEM_CONFIG.dailyAiCostCapUsd;
  const policyRaw = map.get(SETTING_KEYS.RESUME_ENGINE_POLICY);
  const resumeEnginePolicy = parseResumeEnginePolicy(policyRaw);
  const seqRaw =
    map.get(SETTING_KEYS.RESUME_ENGINE_SEQUENCE) ||
    DEFAULT_SYSTEM_CONFIG.resumeEngineSequenceRaw;
  const resumeEngineSequence = parseEngineSequence(seqRaw);
  const llmProvider = parseLlmProvider(
    map.get(SETTING_KEYS.LLM_PROVIDER) || DEFAULT_SYSTEM_CONFIG.llmProvider
  );
  const llmModelOverride = (
    map.get(SETTING_KEYS.LLM_MODEL_OVERRIDE) || ""
  ).trim();

  return {
    companyName: map.get(SETTING_KEYS.COMPANY_NAME) || DEFAULT_SYSTEM_CONFIG.companyName,
    supportEmail: map.get(SETTING_KEYS.SUPPORT_EMAIL) || DEFAULT_SYSTEM_CONFIG.supportEmail,
    dailyAiCostCapUsd: Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_SYSTEM_CONFIG.dailyAiCostCapUsd,
    defaultLayoutId: LAYOUT_IDS.has(layout as never) ? layout : DEFAULT_SYSTEM_CONFIG.defaultLayoutId,
    defaultExportFormat: exportFmt === "DOCX_PDF" ? "DOCX_PDF" : "DOCX",
    allowEmployeeSelfChains:
      (map.get(SETTING_KEYS.ALLOW_EMPLOYEE_SELF_CHAINS) ?? "true") !== "false",
    resumeEnginePolicy,
    resumeEnginePolicyJson: policyRaw?.trim()
      ? serializeResumeEnginePolicy(resumeEnginePolicy)
      : serializeResumeEnginePolicy(DEFAULT_RESUME_ENGINE_POLICY),
    resumeEngineSequence,
    resumeEngineSequenceRaw: serializeEngineSequence(resumeEngineSequence),
    llmProvider,
    llmModelOverride,
  };
}

/**
 * Resolve active LLM (OpenAI or Claude) from admin selection + env keys.
 * Env LLM_PROVIDER overrides admin when set.
 * Optional forceProvider wins for tests (OpenAI vs Claude matrix tabs).
 */
export async function getActiveLlmConfig(
  forceProvider?: LlmProvider | null
): Promise<ActiveLlmConfig> {
  try {
    const cfg = await getSystemConfig();
    const selected = forceProvider
      ? forceProvider
      : resolveProviderSelection(cfg.llmProvider);
    // When forcing a provider for tests, ignore model override for the other vendor
    const modelOverride = forceProvider ? "" : cfg.llmModelOverride;
    return buildActiveLlmConfig({
      selectedProvider: selected,
      modelOverride,
    });
  } catch {
    return buildActiveLlmConfig({
      selectedProvider: forceProvider || resolveProviderSelection("openai"),
      modelOverride: "",
    });
  }
}

/** Ordered engines for tailorResume failover (defaults if DB down) */
export async function getResumeEngineSequence(): Promise<ResumeEngineId[]> {
  try {
    const cfg = await getSystemConfig();
    return cfg.resumeEngineSequence;
  } catch {
    return [...DEFAULT_ENGINE_SEQUENCE];
  }
}

/** Convenience for resume generation paths (defaults if DB down) */
export async function getResumeEnginePolicy(): Promise<ResumeEnginePolicy> {
  try {
    const cfg = await getSystemConfig();
    return cfg.resumeEnginePolicy;
  } catch {
    return DEFAULT_RESUME_ENGINE_POLICY;
  }
}

export async function setSystemSettings(
  pairs: Partial<Record<SettingKey, string>>
): Promise<void> {
  const entries = Object.entries(pairs).filter(
    ([, v]) => v !== undefined && v !== null
  ) as [string, string][];
  for (const [key, value] of entries) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
