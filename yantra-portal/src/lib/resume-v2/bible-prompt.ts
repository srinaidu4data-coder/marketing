/**
 * System prompt resolution — Admin ACTIVE PromptVersion is the ONLY writing SOT.
 * There is no dual code BIBLE_PROMPT override at runtime.
 */

import { prisma } from "@/lib/db";
import { ADMIN_PROMPT_SEED } from "./admin-prompt-seed";

/** Full JD rewrite only for these indices (0 = most recent). Code structural constant. */
export const JD_REWRITE_MAX_INDEX = 2;

/** Compact schema reminder for repair waves (structural, not product law). */
export const JSON_SHAPE_REMINDER = `JSON only: header (name locked), professionalSummary.bullets[6-8], techSkills, education, certifications from master only, projects[] with exact employerOrClient+duration. JD rewrite ONLY projects[0..2] (i<3); projects[i≥3] stay neutral/era-true — do not invent free fields. techStack/environment = noun tools only, different lists. Min 8 bullets per project. No markdown.`;

export type ActiveSystemPrompt = {
  content: string;
  versionId: string;
  /** true when we just inserted ADMIN_PROMPT_SEED because DB had no ACTIVE */
  bootstrapped: boolean;
};

/**
 * Load the Admin ACTIVE prompt (sole system message for generation).
 * If none exists, seed ADMIN_PROMPT_SEED once as ACTIVE so production never has dual SOT.
 */
export async function getActiveSystemPrompt(): Promise<ActiveSystemPrompt> {
  const active = await prisma.promptVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  const body = (active?.content || "").trim();
  if (active && body.length >= 80) {
    return {
      content: body,
      versionId: active.id,
      bootstrapped: false,
    };
  }

  // No usable ACTIVE — bootstrap seed into DB as the one admin source
  if (active && body.length < 80) {
    await prisma.promptVersion.update({
      where: { id: active.id },
      data: { content: ADMIN_PROMPT_SEED, tested: true },
    });
    return {
      content: ADMIN_PROMPT_SEED.trim(),
      versionId: active.id,
      bootstrapped: true,
    };
  }

  await prisma.promptVersion.updateMany({
    where: { status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
  const created = await prisma.promptVersion.create({
    data: {
      content: ADMIN_PROMPT_SEED,
      status: "ACTIVE",
      tested: true,
    },
  });
  return {
    content: ADMIN_PROMPT_SEED.trim(),
    versionId: created.id,
    bootstrapped: true,
  };
}

/**
 * Resolve system prompt string for a generation call.
 * Prefer explicit `candidate` only when it is a non-empty admin/test override (≥80 chars).
 * Otherwise load ACTIVE from DB.
 */
export async function resolveSystemPrompt(
  candidate?: string | null
): Promise<string> {
  const p = (candidate || "").trim();
  if (p.length >= 80) return p;
  const active = await getActiveSystemPrompt();
  return active.content;
}
