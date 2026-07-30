import { prisma } from "@/lib/db";
import { RESUME_LAYOUTS } from "@/lib/resume/templates";

export const SETTING_KEYS = {
  COMPANY_NAME: "company_name",
  SUPPORT_EMAIL: "support_email",
  DAILY_AI_COST_CAP_USD: "daily_ai_cost_cap_usd",
  DEFAULT_LAYOUT_ID: "default_layout_id",
  DEFAULT_EXPORT_FORMAT: "default_export_format",
  ALLOW_EMPLOYEE_SELF_CHAINS: "allow_employee_self_chains",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export type SystemConfig = {
  companyName: string;
  supportEmail: string;
  dailyAiCostCapUsd: number;
  defaultLayoutId: string;
  defaultExportFormat: "DOCX" | "DOCX_PDF";
  allowEmployeeSelfChains: boolean;
};

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  companyName: "SR SOFT LLC",
  supportEmail: "admin@srsoft.com",
  dailyAiCostCapUsd: 25,
  defaultLayoutId: "ats_classic",
  defaultExportFormat: "DOCX",
  allowEmployeeSelfChains: true,
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

  return {
    companyName: map.get(SETTING_KEYS.COMPANY_NAME) || DEFAULT_SYSTEM_CONFIG.companyName,
    supportEmail: map.get(SETTING_KEYS.SUPPORT_EMAIL) || DEFAULT_SYSTEM_CONFIG.supportEmail,
    dailyAiCostCapUsd: Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_SYSTEM_CONFIG.dailyAiCostCapUsd,
    defaultLayoutId: LAYOUT_IDS.has(layout as never) ? layout : DEFAULT_SYSTEM_CONFIG.defaultLayoutId,
    defaultExportFormat: exportFmt === "DOCX_PDF" ? "DOCX_PDF" : "DOCX",
    allowEmployeeSelfChains:
      (map.get(SETTING_KEYS.ALLOW_EMPLOYEE_SELF_CHAINS) ?? "true") !== "false",
  };
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
