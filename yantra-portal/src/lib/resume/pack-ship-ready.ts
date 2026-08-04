/**
 * Shared ship/no-ship checks for generated packs.
 * Single authority for generation, download, send, and chain UI.
 *
 * SHIP  (ok):   structural OK ∧ ATS ≥ SHIP_MIN_ATS (95)
 * BEST (badge): structural OK ∧ ATS === 100 ∧ Psych === 100
 *
 * Emergency product rule: do not discard high-quality packs (e.g. ATS 95)
 * just because dual-100 BEST is not met.
 */

import {
  MIN_BULLETS_PER_PROJECT,
  MAX_BULLETS_PER_PROJECT,
  BULLET_DENSITY_RANGE,
} from "./bullet-density";
import {
  packHasIndustryCosplay,
  packHasFreeMetrics,
  packHasMasterResidueLeak,
  assertAllMasterClientsPresent,
} from "./resume-honesty";
import { parseStoredMasterProfile } from "./master-profile";
import { scoreResume, type AtsResult, SHIP_MIN_ATS } from "./ats-scorer";
import { scorePsych, type PsychResult } from "./psych-scorer";
import {
  resolveTailorMode,
  type TailorMode,
} from "./tailor-mode";
import { extractJobTitle } from "./jd-parse";

/** Re-export single ship floor (defined in ats-scorer). */
export { SHIP_MIN_ATS };
/** Dual perfect scores for marketing BEST badge only. */
export const BEST_ATS = 100;
export const BEST_PSYCH = 100;

export type PackShipIssue = {
  code:
    | "empty"
    | "thin_bullets"
    | "missing_clients"
    | "industry_cosplay"
    | "free_metrics"
    | "master_residue"
    | "ats_below"
    | "psych_below"
    | "generation_blocked";
  detail: string;
};

export type PackShipReport = {
  ok: boolean;
  /** Marketing “best” badge: dual 100 */
  best: boolean;
  issues: PackShipIssue[];
  employerBlocks: number;
  minBulletsSeen: number | null;
  ats?: AtsResult;
  psych?: PsychResult;
  mode?: TailorMode;
};

export function inspectPackShipReady(opts: {
  text: string;
  masterText?: string;
  masterProfileJson?: string | null;
  /**
   * @deprecated Ignored if below product floor. ONE LAW: min always 8.
   * Callers may omit; never lower ship density via this option.
   */
  minBullets?: number;
  /** When provided, dual scores are computed and required for ok/best */
  jd?: string;
  jobTitle?: string;
  candidateName?: string;
  /** Precomputed scores (skip recompute) */
  atsScore?: number;
  psychScore?: number;
  ats?: AtsResult;
  psych?: PsychResult;
  mode?: TailorMode;
}): PackShipReport {
  // ONE LAW: never allow ship with fewer than 8 bullets, regardless of caller.
  const min = Math.max(
    MIN_BULLETS_PER_PROJECT,
    opts.minBullets ?? MIN_BULLETS_PER_PROJECT
  );
  const text = opts.text || "";
  const master = opts.masterText || "";
  const issues: PackShipIssue[] = [];

  if (text.length < 400) {
    issues.push({ code: "empty", detail: `Pack too short (${text.length} chars)` });
  }
  if (/Resume generation blocked/i.test(text)) {
    issues.push({
      code: "generation_blocked",
      detail: "Stored text is a generation-blocked message",
    });
  }

  const blocks = text.split(/Employer\s*\/\s*Client:\s*/i).slice(1);
  let minBulletsSeen: number | null = null;
  if (blocks.length) {
    for (let i = 0; i < blocks.length; i++) {
      const head = (blocks[i].split(/\r?\n/)[0] || `Client ${i + 1}`)
        .split(",")[0]
        .trim()
        .slice(0, 48);
      const n = countBulletsInBlock(blocks[i]);
      minBulletsSeen =
        minBulletsSeen == null ? n : Math.min(minBulletsSeen, n);
      if (n < min) {
        issues.push({
          code: "thin_bullets",
          detail: `${head}: ${n}/${min} bullets (need ${BULLET_DENSITY_RANGE}, max ${MAX_BULLETS_PER_PROJECT})`,
        });
      }
      // Over-max is capped at assembly/render — ship only hard-fails under-min.
    }
  } else if (text.length >= 400) {
    issues.push({
      code: "thin_bullets",
      detail: "No Employer/Client blocks found in pack",
    });
  }

  const profile = parseStoredMasterProfile(opts.masterProfileJson);
  const clients = profile?.engagements.map((e) => e.client) || [];
  if (clients.length && text.length >= 200) {
    try {
      assertAllMasterClientsPresent({
        clients,
        tailoredText: text,
        masterProfileJson: opts.masterProfileJson,
      });
    } catch (e) {
      issues.push({
        code: "missing_clients",
        detail: e instanceof Error ? e.message : "Missing master employers",
      });
    }
  }

  // Full-pack honesty (not summary-only)
  const summarySlice = extractSummaryRegion(text);
  const cosplay = packHasIndustryCosplay(
    summarySlice + "\n" + (text.match(/SELECTED IMPACT[\s\S]{0,2500}/i)?.[0] || ""),
    master
  );
  for (const c of cosplay) {
    issues.push({ code: "industry_cosplay", detail: c });
  }

  const free = packHasFreeMetrics(text, master);
  for (const f of free.slice(0, 6)) {
    issues.push({ code: "free_metrics", detail: f });
  }

  const mode =
    opts.mode ||
    (opts.jd ? resolveTailorMode(opts.jd, master).mode : "same_domain");
  if (opts.jd) {
    const residue = packHasMasterResidueLeak(text, opts.jd, mode);
    for (const r of residue) {
      issues.push({ code: "master_residue", detail: r });
    }
  }

  // Dual scores
  let ats = opts.ats;
  let psych = opts.psych;
  const jobTitle =
    opts.jobTitle || (opts.jd ? extractJobTitle(opts.jd) : "");

  if (opts.jd && master) {
    if (!ats) {
      ats = scoreResume({
        resumeText: text,
        jd: opts.jd,
        jobTitle,
        recentProjectCount: 2,
        temporalViolations: 0,
        earlyCareerOversell: false,
        honestyFailed: issues.some((i) =>
          ["industry_cosplay", "free_metrics", "master_residue"].includes(i.code)
        ),
      });
    }
    if (!psych) {
      psych = scorePsych({
        resumeText: text,
        masterText: master,
        masterProfileJson: opts.masterProfileJson,
        jd: opts.jd,
        jobTitle,
        mode,
        candidateName: opts.candidateName,
      });
    }
  } else if (opts.atsScore != null || opts.psychScore != null) {
    // Legacy path with only numbers
  }

  // Score messaging: ship floor vs BEST badge (do not conflate)
  if (ats) {
    if (ats.score < SHIP_MIN_ATS) {
      issues.push({
        code: "ats_below",
        detail: `ATS ${ats.score}/100 (ship requires ≥${SHIP_MIN_ATS})`,
      });
    } else if (ats.score < BEST_ATS) {
      // Informational only — does not block ship (code still listed for UI)
      issues.push({
        code: "ats_below",
        detail: `ATS ${ats.score}/100 (ship OK ≥${SHIP_MIN_ATS}; BEST badge needs ${BEST_ATS})`,
      });
    }
  }
  if (psych) {
    if (psych.score < BEST_PSYCH) {
      issues.push({
        code: "psych_below",
        detail: `Psych ${psych.score}/100 (BEST badge needs ${BEST_PSYCH}) · ${psych.warnings.slice(0, 2).join("; ")}`,
      });
    }
  }

  const structuralOk = !issues.some((i) =>
    [
      "empty",
      "thin_bullets",
      "missing_clients",
      "industry_cosplay",
      "free_metrics",
      "master_residue",
      "generation_blocked",
    ].includes(i.code)
  );
  // When JD+master: ship if ATS ≥ 95. Psych/ATS-100 only gate BEST badge.
  // ats_below / psych_below issues are retained for UI but do NOT force fail when ship floor met.
  const scoresRequired = !!(opts.jd && master);
  const shipScoresOk =
    !scoresRequired || (!!ats && ats.score >= SHIP_MIN_ATS);
  const ok = structuralOk && shipScoresOk;
  const best =
    ok &&
    !!ats &&
    !!psych &&
    ats.score >= BEST_ATS &&
    psych.score >= BEST_PSYCH;

  return {
    ok,
    best,
    issues,
    employerBlocks: blocks.length,
    minBulletsSeen,
    ats,
    psych,
    mode,
  };
}

function extractSummaryRegion(text: string): string {
  const t = text || "";
  const m = t.match(
    /professional summary\s*\n([\s\S]*?)(?:\n\s*\n[A-Z][A-Z \/\-]{3,}|core competencies|technical skills|selected impact|professional experience)/i
  );
  if (m) return m[1].slice(0, 2000);
  const exp = t.search(/professional experience|work experience/i);
  return exp > 0 ? t.slice(0, exp) : t.slice(0, 1800);
}

export function countBulletsInBlock(block: string): number {
  const lines = (block || "").split(/\r?\n/);
  let n = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^employer\s*\/\s*client:/i.test(t)) continue;
    if (/^[•●○▪▸→‣\-\u2013\u2014\*]\s+\S/.test(t)) n++;
    else if (/^[\u2022]\s+\S/.test(t)) n++;
  }
  return n;
}

/**
 * Whether pack *content* is missing/bad and needs a full AI re-tailor.
 * Disk presence (docxPath) is intentionally ignored — /tmp is ephemeral on
 * Vercel; DB tailoredResumeText is the source of truth.
 *
 * "Role Forge" footer is a soft signal only (older packs / vendor-stripped
 * exports may omit it). Structural ship-ready is the hard gate.
 */
export function mustRegeneratePack(opts: {
  text: string;
  masterText?: string;
  masterProfileJson?: string | null;
  jd?: string;
}): boolean {
  const ship = inspectPackShipReady(opts);
  if (!ship.ok) return true;
  return false;
}
