/**
 * Tailor mode router — JD-first staffing product.
 *
 * STRICT MODE REMOVED. Always apply:
 *   - JD title on recent project roles
 *   - Strong JD language in summary / bullets / skills
 *
 * Modes (2 only):
 *   same_domain: high skill overlap — full same-specialty tailor
 *   transfer:    lower overlap — still JD titles + strong JD language,
 *                but no invented industry tenure / free metrics
 */

import { groundedOverlapRatio } from "./resume-honesty";
import {
  MIN_BULLETS_PER_PROJECT,
  MAX_BULLETS_PER_PROJECT,
  TARGET_BULLETS_PER_PROJECT,
  BULLET_DENSITY_PROMPT_RULE,
} from "./bullet-density";

/** Product modes — strict removed. Legacy "strict" stored values map to transfer. */
export type TailorMode = "same_domain" | "transfer";

export type TailorModeResult = {
  mode: TailorMode;
  overlap: number;
  allowEmergencyFill: boolean;
  /** Always true — JD title on recent roles (staffing submit). */
  jdTitlesOnRecent: boolean;
  minBullets: number;
  label: string;
};

/** High bar: same specialty family */
export const OVERLAP_SAME_DOMAIN = 0.45;
/** Below this was old "strict"; now still transfer with JD titles */
export const OVERLAP_TRANSFER = 0.22;

/** Normalize legacy DB / UI values */
export function normalizeTailorMode(mode: string | null | undefined): TailorMode {
  if (mode === "same_domain") return "same_domain";
  // strict → transfer (strict removed)
  return "transfer";
}

/**
 * Resolve mode. Strict path eliminated — low overlap uses transfer + JD titles.
 */
export function resolveTailorMode(
  jd: string,
  master: string
): TailorModeResult {
  const overlap = groundedOverlapRatio(jd || "", master || "");
  const minBullets = MIN_BULLETS_PER_PROJECT;
  // ALWAYS put JD title on recent roles (user demand: no strict, JD-first)
  const jdTitlesOnRecent = true;

  if (overlap >= OVERLAP_SAME_DOMAIN) {
    return {
      mode: "same_domain",
      overlap,
      allowEmergencyFill: true,
      jdTitlesOnRecent,
      minBullets,
      label: "Same-domain tailor (JD titles + strong JD language)",
    };
  }

  // Formerly strict when overlap < 0.22 — now transfer with same title policy
  return {
    mode: "transfer",
    overlap,
    allowEmergencyFill: true,
    jdTitlesOnRecent,
    minBullets,
    label:
      overlap < OVERLAP_TRANSFER
        ? "Transfer tailor (low overlap — JD titles + strong JD language)"
        : "Transfer tailor (JD titles + strong JD language)",
  };
}

/**
 * Prompt appendix — both modes push JD title + strong JD language.
 */
export function modePromptAppendix(mode: TailorMode, jobTitle: string): string {
  const density = `\n- BULLET DENSITY (ONE LAW): ${BULLET_DENSITY_PROMPT_RULE}`;
  const jdFirst = `
JD-FIRST RULES (MANDATORY — staffing submit):
- Headline = exact JD title "${jobTitle}".
- projects[0] and projects[1] (recent) title = exact JD title "${jobTitle}" (not master FICO/other titles).
- Later projects: progressive variants of the SAME JD title family (Associate/Senior forms of "${jobTitle}"), NOT unrelated master specialty titles.
- Use STRONG JD language throughout: rewrite master bullets toward JD tools, modules, verbs, and outcomes.
- Skills: lead with JD-critical terms (grounded when possible); include JD keywords that fit the role.
- SELECTED IMPACT / peak bullets: must read as this JD specialty — not pure master specialty theater (e.g. no pure FICO impact for an ATTP JD).
- Keep real employers, locations, and dates from master. Do not invent employers or free %/$.
- Prefer JD fit over preserving master job titles.`;

  if (mode === "same_domain") {
    return `
MODE: same_domain — master skills align well with this JD.
${jdFirst}
- Rephrase master proof heavily into JD vocabulary; deep ownership OK where master supports it.
- No free % or $ unless present in MASTER text.${density}`;
  }

  // transfer (includes former strict overlap band)
  return `
MODE: transfer — limited skill overlap, but still JD-FIRST for titles and language.
${jdFirst}
- Do NOT claim years "in the Pharmaceutical / clinical / banking industry" unless MASTER supports it.
- Do NOT invent deep specialty tools the master never used; map master achievements into JD language honestly.
- Bullets: rephrase MASTER facts using JD verbs/tools where plausible; if master has no ATTP/specialty proof, use transferable delivery language framed for "${jobTitle}" — not leftover unrelated specialty titles.
- Still require ${MIN_BULLETS_PER_PROJECT}–${MAX_BULLETS_PER_PROJECT} bullets (prefer ${TARGET_BULLETS_PER_PROJECT}) per employer.${density}`;
}
