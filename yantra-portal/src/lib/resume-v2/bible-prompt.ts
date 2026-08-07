/**
 * System prompt resolution — Admin ACTIVE PromptVersion is the ONLY writing SOT.
 * There is no dual code BIBLE_PROMPT override at runtime.
 *
 * Best practice:
 * - First install / local seed: prisma seed or Admin → "Install default seed"
 * - Runtime generation: read ACTIVE only — never silently re-write the DB
 * - Missing / unusable ACTIVE: fail closed with NO_ACTIVE_PROMPT (admin must set it)
 */

import { prisma } from "@/lib/db";
import { ADMIN_PROMPT_SEED } from "./admin-prompt-seed";

/** Full JD rewrite only for these indices (0 = most recent). Code structural constant. */
export const JD_REWRITE_MAX_INDEX = 2;

/** Compact schema reminder for repair waves (structural, not product law). */
export const JSON_SHAPE_REMINDER = `JSON only: header (name locked), professionalSummary.bullets[6-8] imperative voice, techSkills as string OR string[] OR {Group:string[]} NEVER [{name:…}] objects, education+certs master only, projects[] exact employerOrClient+duration. Progressive roles (not same senior title every row). Unique era-true techStack/environment per project (no clone ATTP/RISE on 1999–2012). JD rewrite ONLY projects[0..2]. Zero stack/env token overlap. No markdown.`;

/** Thrown / returned when Admin has no usable ACTIVE prompt. */
export const NO_ACTIVE_PROMPT_MESSAGE =
  "NO_ACTIVE_PROMPT: set Admin → Prompt, Save & make ACTIVE (or Install default seed).";

/** Minimum body length treated as a usable system prompt. */
export const MIN_ACTIVE_PROMPT_CHARS = 80;

export type ActiveSystemPrompt = {
  content: string;
  versionId: string;
};

/**
 * Load the Admin ACTIVE prompt (read-only).
 * Returns null when there is no ACTIVE row or content is too short to use.
 * Does NOT write to the database — deletions and empty ACTIVE stay empty.
 */
export async function getActiveSystemPrompt(): Promise<ActiveSystemPrompt | null> {
  const active = await prisma.promptVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  const body = (active?.content || "").trim();
  if (!active || body.length < MIN_ACTIVE_PROMPT_CHARS) {
    return null;
  }
  return {
    content: body,
    versionId: active.id,
  };
}

/**
 * Require a usable ACTIVE prompt or throw NO_ACTIVE_PROMPT.
 */
export async function requireActiveSystemPrompt(): Promise<ActiveSystemPrompt> {
  const active = await getActiveSystemPrompt();
  if (!active) {
    throw new Error(NO_ACTIVE_PROMPT_MESSAGE);
  }
  return active;
}

/**
 * Explicit admin/bootstrap install: create (or replace short ACTIVE) with ADMIN_PROMPT_SEED.
 * Call only from Admin action or deploy scripts — never from generation page loads.
 */
export async function installDefaultActivePrompt(): Promise<ActiveSystemPrompt> {
  const seed = ADMIN_PROMPT_SEED.trim();
  const existing = await prisma.promptVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  if (existing && (existing.content || "").trim().length < MIN_ACTIVE_PROMPT_CHARS) {
    await prisma.promptVersion.update({
      where: { id: existing.id },
      data: { content: ADMIN_PROMPT_SEED, tested: true },
    });
    return { content: seed, versionId: existing.id };
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
  return { content: seed, versionId: created.id };
}

/**
 * Resolve system prompt string for a generation call.
 * Prefer explicit `candidate` only when it is a non-empty admin/test override (≥80 chars).
 * Otherwise load ACTIVE from DB (read-only). Throws if missing.
 */
export async function resolveSystemPrompt(
  candidate?: string | null
): Promise<string> {
  const p = (candidate || "").trim();
  if (p.length >= MIN_ACTIVE_PROMPT_CHARS) return p;
  const active = await requireActiveSystemPrompt();
  return active.content;
}
