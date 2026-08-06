"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import {
  DEFAULT_SKILL_NEUTRAL_BULLETS,
  getSkillNeutralBulletBank,
  parseBulletBank,
  setSkillNeutralBulletBank,
  serializeBulletBank,
} from "@/lib/resume/skill-neutral-bullet-bank";

export type BulletBankActionResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function loadBulletBankForAdmin(): Promise<{
  bullets: string[];
  raw: string;
  defaultCount: number;
}> {
  await requireAdmin();
  const bullets = await getSkillNeutralBulletBank();
  return {
    bullets,
    raw: serializeBulletBank(bullets),
    defaultCount: DEFAULT_SKILL_NEUTRAL_BULLETS.length,
  };
}

export async function saveBulletBank(
  formData: FormData
): Promise<BulletBankActionResult> {
  const admin = await requireAdmin();
  const raw = String(formData.get("bulletBank") || "");
  const bullets = parseBulletBank(raw);
  if (bullets.length < 20) {
    return {
      ok: false,
      error: `Need at least 20 solid bullets (got ${bullets.length}). One bullet per line or JSON array.`,
    };
  }
  await setSkillNeutralBulletBank(bullets);
  await audit("settings.update", admin.id, {
    setting: "skill_neutral_bullet_bank",
    count: bullets.length,
  });
  revalidatePath("/admin/bullet-bank");
  revalidatePath("/admin/prompt");
  return { ok: true, count: bullets.length };
}

export async function resetBulletBankToDefault(): Promise<BulletBankActionResult> {
  const admin = await requireAdmin();
  await setSkillNeutralBulletBank([...DEFAULT_SKILL_NEUTRAL_BULLETS]);
  await audit("settings.update", admin.id, {
    setting: "skill_neutral_bullet_bank",
    reset: true,
    count: DEFAULT_SKILL_NEUTRAL_BULLETS.length,
  });
  revalidatePath("/admin/bullet-bank");
  return { ok: true, count: DEFAULT_SKILL_NEUTRAL_BULLETS.length };
}
