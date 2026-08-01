/**
 * Tailor mode router — JD∩master overlap decides how aggressive generation may be.
 *
 * same_domain: high overlap — JD titles on recent roles OK; rephrase master toward JD
 * transfer:    mid/low — headline may use JD; no industry tenure cosplay; master titles preferred
 * strict:      very low — transferable framing only; no specialty ownership claims
 */

import { groundedOverlapRatio } from "./resume-honesty";

export type TailorMode = "same_domain" | "transfer" | "strict";

export type TailorModeResult = {
  mode: TailorMode;
  overlap: number;
  /** Soft-fill templates allowed? Never for transfer/strict. */
  allowEmergencyFill: boolean;
  /** Recent N roles may use exact JD title */
  jdTitlesOnRecent: boolean;
  /** Min bullets before ship fails (honest thinner packs OK in transfer/strict) */
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
  if (overlap >= OVERLAP_SAME_DOMAIN) {
    return {
      mode: "same_domain",
      overlap,
      allowEmergencyFill: false, // still no invent — master/AI only
      jdTitlesOnRecent: true,
      minBullets: 6,
      label: "Same-domain tailor",
    };
  }
  if (overlap >= OVERLAP_TRANSFER) {
    return {
      mode: "transfer",
      overlap,
      allowEmergencyFill: false,
      jdTitlesOnRecent: false,
      minBullets: 5,
      label: "Transfer tailor",
    };
  }
  return {
    mode: "strict",
    overlap,
    allowEmergencyFill: false,
    jdTitlesOnRecent: false,
    minBullets: 4,
    label: "Strict truth",
  };
}

export function modePromptAppendix(mode: TailorMode, jobTitle: string): string {
  if (mode === "same_domain") {
    return `
MODE: same_domain — master skills overlap this JD.
- Recent 1–2 project titles may equal exact JD title "${jobTitle}".
- Prefer REPHRASING master bullets toward JD language; do not invent employers, metrics, or industry tenure.
- No free % or $ claims unless present in MASTER text.`;
  }
  if (mode === "transfer") {
    return `
MODE: transfer — limited skill overlap. HONEST TRANSFER ONLY.
- Do NOT claim years "in the Pharmaceutical / clinical / banking industry" unless MASTER supports it.
- Project titles: keep master career titles or progressive variants of the SAME family — do NOT rewrite entire career as "${jobTitle}".
- Headline may say "${jobTitle}" as target positioning only.
- Bullets: rephrase MASTER only. No invented clinical/SAP specialty ownership. No free metrics.
- Skills: grounded (JD∩master) first; JD-only terms only in skills bank, not early-career ownership.`;
  }
  return `
MODE: strict — very low JD∩master overlap. MAXIMUM HONESTY.
- Summary: transferable positioning only — data quality, process, documentation, testing, stakeholders.
- NEVER invent industry careers, specialty tools ownership, or metrics.
- Keep master employer titles; do not clone "${jobTitle}" onto every job.
- Prefer thinner honest packs over dense cosplay.`;
}
