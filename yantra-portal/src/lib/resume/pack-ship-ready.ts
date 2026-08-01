/**
 * Shared ship/no-ship checks for generated packs.
 * Single authority for generation, download, send, and chain UI.
 *
 * Best pack: structural OK ∧ ats.score === 100 ∧ psych.score === 100
 */

import { MIN_BULLETS_PER_PROJECT } from "./assemble-pack";
import {
  packHasIndustryCosplay,
  packHasFreeMetrics,
  packHasMasterResidueLeak,
  assertAllMasterClientsPresent,
} from "./resume-honesty";
import { parseStoredMasterProfile } from "./master-profile";
import { scoreResume, type AtsResult } from "./ats-scorer";
import { scorePsych, type PsychResult } from "./psych-scorer";
import {
  resolveTailorMode,
  type TailorMode,
} from "./tailor-mode";
import { extractJobTitle } from "./jd-parse";

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
  const min = opts.minBullets ?? MIN_BULLETS_PER_PROJECT;
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
          detail: `${head}: ${n}/${min} bullets`,
        });
      }
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

  // Cap / dual 100 requirement when scores available
  if (ats) {
    if (ats.score < 100) {
      issues.push({
        code: "ats_below",
        detail: `ATS ${ats.score}/100 (best requires 100)`,
      });
    }
  }
  if (psych) {
    if (psych.score < 100) {
      issues.push({
        code: "psych_below",
        detail: `Psych ${psych.score}/100 (best requires 100) · ${psych.warnings.slice(0, 2).join("; ")}`,
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
  const scoresOk =
    (!ats || ats.score === 100) && (!psych || psych.score === 100);
  // When JD provided, require both scores present and 100
  const dualRequired = !!(opts.jd && master);
  const ok =
    structuralOk &&
    (!dualRequired || (!!ats && !!psych && ats.score === 100 && psych.score === 100));
  const best = ok && !!ats && !!psych && ats.score === 100 && psych.score === 100;

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

export function mustRegeneratePack(opts: {
  text: string;
  masterText?: string;
  masterProfileJson?: string | null;
  jd?: string;
}): boolean {
  const ship = inspectPackShipReady(opts);
  if (!ship.ok) return true;
  if (opts.text && !/Role Forge/i.test(opts.text)) return true;
  return false;
}
