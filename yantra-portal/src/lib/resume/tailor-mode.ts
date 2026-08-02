/**
 * Tailor mode router — JD∩master overlap decides titles / honesty framing only.
 *
 * same_domain: high overlap — JD titles on recent roles OK; rephrase master toward JD
 * transfer:    mid/low — headline may use JD; no industry tenure cosplay; master titles preferred
 * strict:      very low — transferable framing only; no specialty ownership claims
 *
 * Bullet density is NOT mode-specific. ONE LAW: min 8 / max 12 (bullet-density.ts).
 */

import { groundedOverlapRatio } from "./resume-honesty";
import {
  MIN_BULLETS_PER_PROJECT,
  MAX_BULLETS_PER_PROJECT,
  TARGET_BULLETS_PER_PROJECT,
  BULLET_DENSITY_PROMPT_RULE,
} from "./bullet-density";

export type TailorMode = "same_domain" | "transfer" | "strict";

export type TailorModeResult = {
  mode: TailorMode;
  overlap: number;
  /** Soft-fill templates allowed? Never for transfer/strict. */
  allowEmergencyFill: boolean;
  /** Recent N roles may use exact JD title */
  jdTitlesOnRecent: boolean;
  /**
   * Always MIN_BULLETS_PER_PROJECT (8). Kept on the type for API stability;
   * mode must never lower density.
   */
  minBullets: number;
  label: string;
};

/** High bar: same specialty family */
export const OVERLAP_SAME_DOMAIN = 0.45;
/** Below this → strict transferable only (matches isLowOverlap default ~0.22) */
export const OVERLAP_TRANSFER = 0.22;

export function resolveTailorMode(
  jd: string,
  master: string
): TailorModeResult {
  const overlap = groundedOverlapRatio(jd || "", master || "");
  // Density law is global — modes only change titles/honesty framing.
  const minBullets = MIN_BULLETS_PER_PROJECT;
  if (overlap >= OVERLAP_SAME_DOMAIN) {
    return {
      mode: "same_domain",
      overlap,
      allowEmergencyFill: false, // still no invent — master/AI only
      jdTitlesOnRecent: true,
      minBullets,
      label: "Same-domain tailor",
    };
  }
  if (overlap >= OVERLAP_TRANSFER) {
    return {
      mode: "transfer",
      overlap,
      allowEmergencyFill: false,
      jdTitlesOnRecent: false,
      minBullets,
      label: "Transfer tailor",
    };
  }
  return {
    mode: "strict",
    overlap,
    allowEmergencyFill: false,
    jdTitlesOnRecent: false,
    minBullets,
    label: "Strict truth",
  };
}

export function modePromptAppendix(mode: TailorMode, jobTitle: string): string {
  const density = `\n- BULLET DENSITY (ONE LAW, all modes): ${BULLET_DENSITY_PROMPT_RULE}`;
  if (mode === "same_domain") {
    return `
MODE: same_domain — master skills overlap this JD.
- Recent 1–2 project titles may equal exact JD title "${jobTitle}".
- Prefer REPHRASING master bullets toward JD language; do not invent employers, metrics, or industry tenure.
- No free % or $ claims unless present in MASTER text.${density}`;
  }
  if (mode === "transfer") {
    return `
MODE: transfer — limited skill overlap. HONEST TRANSFER ONLY.
- Do NOT claim years "in the Pharmaceutical / clinical / banking industry" unless MASTER supports it.
- Project titles: keep master career titles or progressive variants of the SAME family — do NOT rewrite entire career as "${jobTitle}".
- Headline may say "${jobTitle}" as target positioning only.
- Bullets: rephrase MASTER only. No invented clinical/SAP specialty ownership. No free metrics.
- Skills: grounded (JD∩master) first; JD-only terms only in skills bank, not early-career ownership.
- Do NOT thin packs — still require ${MIN_BULLETS_PER_PROJECT}–${MAX_BULLETS_PER_PROJECT} bullets (prefer ${TARGET_BULLETS_PER_PROJECT}) from master rephrase; fail closed if master is too thin.${density}`;
  }
  return `
MODE: strict — very low JD∩master overlap. MAXIMUM HONESTY.
- Summary: transferable positioning only — data quality, process, documentation, testing, stakeholders.
- NEVER invent industry careers, specialty tools ownership, or metrics.
- Keep master employer titles; do not clone "${jobTitle}" onto every job.
- Density is NOT relaxed: still ${MIN_BULLETS_PER_PROJECT}–${MAX_BULLETS_PER_PROJECT} bullets per employer from MASTER only; never invent to fill.${density}`;
}
