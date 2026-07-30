"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import {
  SETTING_KEYS,
  setSystemSettings,
  type SettingKey,
} from "@/lib/system-settings";
import { RESUME_LAYOUTS } from "@/lib/resume/templates";

const LAYOUT_IDS = new Set(RESUME_LAYOUTS.map((l) => l.id));

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export async function saveSystemSettings(formData: FormData): Promise<SettingsActionResult> {
  const admin = await requireAdmin();

  const companyName = String(formData.get("companyName") || "").trim();
  const supportEmail = String(formData.get("supportEmail") || "").trim();
  const dailyCap = Number(formData.get("dailyAiCostCapUsd"));
  const defaultLayoutId = String(formData.get("defaultLayoutId") || "ats_classic");
  const defaultExportFormat = String(formData.get("defaultExportFormat") || "DOCX");
  const allowSelf = formData.get("allowEmployeeSelfChains") === "on" || formData.get("allowEmployeeSelfChains") === "true";

  if (!companyName) return { ok: false, error: "Company name is required." };
  if (!supportEmail || !supportEmail.includes("@")) {
    return { ok: false, error: "A valid support email is required." };
  }
  if (!Number.isFinite(dailyCap) || dailyCap < 0) {
    return { ok: false, error: "Daily AI cost cap must be a non-negative number." };
  }
  if (!LAYOUT_IDS.has(defaultLayoutId as never)) {
    return { ok: false, error: "Invalid default layout." };
  }
  if (defaultExportFormat !== "DOCX" && defaultExportFormat !== "DOCX_PDF") {
    return { ok: false, error: "Invalid export format." };
  }

  const pairs: Partial<Record<SettingKey, string>> = {
    [SETTING_KEYS.COMPANY_NAME]: companyName,
    [SETTING_KEYS.SUPPORT_EMAIL]: supportEmail,
    [SETTING_KEYS.DAILY_AI_COST_CAP_USD]: String(dailyCap),
    [SETTING_KEYS.DEFAULT_LAYOUT_ID]: defaultLayoutId,
    [SETTING_KEYS.DEFAULT_EXPORT_FORMAT]: defaultExportFormat,
    [SETTING_KEYS.ALLOW_EMPLOYEE_SELF_CHAINS]: allowSelf ? "true" : "false",
  };

  await setSystemSettings(pairs);
  await audit("settings.update", admin.id, pairs);

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/admin/candidates");
  return { ok: true };
}
