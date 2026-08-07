"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import {
  DEFAULT_STACK_ENV_BANK,
  defaultBankStats,
  getStackEnvBank,
  parseStackEnvBank,
  serializeStackEnvBankJson,
  serializeStackEnvBankSectioned,
  setStackEnvBank,
  bankStats,
} from "@/lib/resume-v2/stack-env";

export type ToolBankActionResult =
  | { ok: true; stats: ReturnType<typeof bankStats> }
  | { ok: false; error: string };

export async function loadToolBankForAdmin(): Promise<{
  sectioned: string;
  json: string;
  stats: ReturnType<typeof bankStats>;
  defaultStats: ReturnType<typeof bankStats>;
}> {
  await requireAdmin();
  const doc = await getStackEnvBank();
  return {
    sectioned: serializeStackEnvBankSectioned(doc),
    json: serializeStackEnvBankJson(doc),
    stats: bankStats(doc),
    defaultStats: defaultBankStats(),
  };
}

export async function saveToolBank(
  formData: FormData
): Promise<ToolBankActionResult> {
  const admin = await requireAdmin();
  const raw = String(formData.get("toolBank") || "");
  const doc = parseStackEnvBank(raw);
  if (doc.catalog.length < 30) {
    return {
      ok: false,
      error: `Need at least 30 catalog terms after parse (got ${doc.catalog.length}). Use [tools]/[platforms]/[processes]/[compliance]/[regulations] sections or full JSON.`,
    };
  }
  // Enforce no cross-kind duplicates
  const seen = new Map<string, string>();
  for (const e of doc.catalog) {
    const k = e.term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(k) && seen.get(k) !== e.kind) {
      return {
        ok: false,
        error: `Overlap: "${e.term}" appears in both ${seen.get(k)} and ${e.kind}. Each term must live in exactly one section.`,
      };
    }
    seen.set(k, e.kind);
  }
  await setStackEnvBank(doc);
  const stats = bankStats(doc);
  await audit("settings.update", admin.id, {
    setting: "stack_env_tool_bank",
    stats,
  });
  revalidatePath("/admin/tool-bank");
  revalidatePath("/admin/bullet-bank");
  return { ok: true, stats };
}

export async function resetToolBankToDefault(): Promise<ToolBankActionResult> {
  const admin = await requireAdmin();
  await setStackEnvBank({ ...DEFAULT_STACK_ENV_BANK });
  const stats = defaultBankStats();
  await audit("settings.update", admin.id, {
    setting: "stack_env_tool_bank",
    reset: true,
    stats,
  });
  revalidatePath("/admin/tool-bank");
  return { ok: true, stats };
}
