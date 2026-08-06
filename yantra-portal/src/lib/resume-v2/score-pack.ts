/**
 * Single score authority for adaptive-cost runPack (C0 + C4).
 * Hard fail → surge (BoN). Soft band → one constrained regen. Green → ship.
 */

import { scoreResume, SHIP_MIN_ATS, type AtsResult } from "@/lib/resume/ats-scorer";
import { scorePsych, type PsychResult } from "@/lib/resume/psych-scorer";
import {
  inspectPackShipReady,
  type PackShipReport,
} from "@/lib/resume/pack-ship-ready";
import { resolveTailorMode } from "@/lib/resume/tailor-mode";
import { packHasFreeMetrics } from "@/lib/resume/resume-honesty";
import { FILLER_BULLET } from "./ensure-ship-shape";
import type { ResumePackV2 } from "./pack-schema";

export type ScoreBand = "green" | "soft" | "hard";

export type ResidueProjectHit = {
  index: number;
  employer: string;
  detail: string;
};

export type PackScoreReport = {
  band: ScoreBand;
  hardFail: boolean;
  softBand: boolean;
  ok: boolean;
  ats: AtsResult;
  psych: PsychResult;
  ship: PackShipReport;
  /** C4: projects that still look like wrong master domain */
  residueHits: ResidueProjectHit[];
  residueFail: boolean;
  fillerPresent: boolean;
  freeMetrics: boolean;
  reasons: string[];
  /** Multi-objective rank among hard-pass candidates (higher better) */
  rankScore: number;
};

/** Soft band: near ship but not clean. */
const SOFT_ATS_LOW = 80;
const SOFT_PSYCH_LOW = 75;

/**
 * Detect master-domain residue on project text when JD domain differs.
 * Lightweight lexical check — not a full model.
 */
export function detectProjectResidue(opts: {
  pack: ResumePackV2;
  jd: string;
  masterText?: string;
}): ResidueProjectHit[] {
  const jd = (opts.jd || "").toLowerCase();
  const hits: ResidueProjectHit[] = [];
  if (jd.length < 40) return hits;

  // JD domain tokens (acronyms + significant words)
  const jdTokens = extractDomainTokens(jd);
  if (jdTokens.size < 3) return hits;

  // Master-only tokens that appear strongly in master but not JD
  const masterTokens = extractDomainTokens((opts.masterText || "").toLowerCase());
  const masterOnly = Array.from(masterTokens).filter((t) => !jdTokens.has(t));
  const jdOnly = Array.from(jdTokens).filter((t) => !masterTokens.has(t));
  if (masterOnly.length < 2) return hits;

  const projects = opts.pack.projects || [];
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i]!;
    const blob = [
      p.role,
      p.techStack,
      p.environment,
      ...(p.bullets || []),
    ]
      .join(" ")
      .toLowerCase();
    if (blob.length < 40) {
      hits.push({
        index: i,
        employer: p.employerOrClient || `project ${i}`,
        detail: "thin_project_body",
      });
      continue;
    }
    let masterHits = 0;
    let jdHits = 0;
    for (const t of masterOnly.slice(0, 40)) {
      if (blob.includes(t)) masterHits++;
    }
    // JD-only tokens (ignore shared words like sap/consultant)
    for (const t of jdOnly.slice(0, 40)) {
      if (blob.includes(t)) jdHits++;
    }
    // Residue: strong master face, weak JD-specific face on this project
    if (masterHits >= 2 && jdHits <= 1 && i > 0) {
      hits.push({
        index: i,
        employer: p.employerOrClient || `project ${i}`,
        detail: `master_face masterHits=${masterHits} jdHits=${jdHits}`,
      });
    }
    // Recent project with zero JD-specific language is also a problem
    if (i === 0 && jdHits === 0 && masterHits >= 2) {
      hits.push({
        index: i,
        employer: p.employerOrClient || `project ${i}`,
        detail: `recent_no_jd_face masterHits=${masterHits}`,
      });
    }
    // Stack line pure master domain (e.g. techStack = "SAP FICO GL CO" on BRIM JD)
    const stack = (p.techStack || "").toLowerCase();
    if (stack.length > 4) {
      let stackMaster = 0;
      let stackJd = 0;
      for (const t of masterOnly.slice(0, 30)) if (stack.includes(t)) stackMaster++;
      for (const t of jdOnly.slice(0, 30)) if (stack.includes(t)) stackJd++;
      if (stackMaster >= 2 && stackJd === 0) {
        hits.push({
          index: i,
          employer: p.employerOrClient || `project ${i}`,
          detail: `stack_master_face master=${stackMaster} jd=${stackJd}`,
        });
      }
    }
  }
  return hits;
}

function extractDomainTokens(text: string): Set<string> {
  const set = new Set<string>();
  // Acronyms 2–8 caps
  for (const m of text.toUpperCase().match(/\b[A-Z][A-Z0-9]{1,7}\b/g) || []) {
    if (m.length >= 2 && m.length <= 8) set.add(m.toLowerCase());
  }
  // Significant words
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "will",
    "have",
    "your",
    "our",
    "are",
    "was",
    "were",
    "been",
    "role",
    "team",
    "work",
    "years",
    "experience",
    "required",
    "preferred",
    "ability",
    "skills",
    "using",
    "including",
  ]);
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) || []) {
    if (!stop.has(w) && w.length >= 4) set.add(w);
  }
  return set;
}

function textHasFiller(text: string): boolean {
  return FILLER_BULLET.test(text || "");
}

/**
 * Score a finished pack text (+ optional structured pack for residue).
 */
export function scorePack(opts: {
  text: string;
  jd: string;
  masterText: string;
  masterProfileJson?: string | null;
  candidateName?: string;
  pack?: ResumePackV2 | null;
  ats?: AtsResult;
  psych?: PsychResult;
  jobTitle?: string;
}): PackScoreReport {
  const text = opts.text || "";
  const jd = opts.jd || "";
  const master = opts.masterText || "";
  const mode = resolveTailorMode(jd, master).mode;
  const jobTitle = opts.jobTitle || opts.pack?.header.jobTitle || "";

  const ats =
    opts.ats ||
    scoreResume({
      resumeText: text,
      jd,
      jobTitle,
    });
  const psych =
    opts.psych ||
    scorePsych({
      resumeText: text,
      masterText: master,
      jd,
      jobTitle,
      mode,
      candidateName: opts.candidateName || opts.pack?.header.name,
    });

  const ship = inspectPackShipReady({
    text,
    masterText: master,
    masterProfileJson: opts.masterProfileJson,
    jd,
    candidateName: opts.candidateName,
    ats,
    psych,
    mode,
  });

  const residueHits = opts.pack
    ? detectProjectResidue({ pack: opts.pack, jd, masterText: master })
    : [];
  const residueFail = residueHits.length >= 2 || residueHits.some((h) => h.index === 0);

  const fillerPresent = textHasFiller(text);
  const freeMetricHits = packHasFreeMetrics(text, master);
  const freeMetrics = freeMetricHits.length > 0;

  const reasons: string[] = [];
  let hardFail = false;
  let softBand = false;

  // Hard structural / honesty
  const hardCodes = new Set([
    "empty",
    "thin_bullets",
    "missing_clients",
    "industry_cosplay",
    "free_metrics",
    "generation_blocked",
  ]);
  for (const issue of ship.issues) {
    if (hardCodes.has(issue.code)) {
      hardFail = true;
      reasons.push(`hard:${issue.code}:${issue.detail}`);
    }
  }
  if (fillerPresent) {
    hardFail = true;
    reasons.push("hard:filler_banned");
  }
  if (freeMetrics && !ship.issues.some((i) => i.code === "free_metrics")) {
    hardFail = true;
    reasons.push("hard:free_metrics");
  }
  if (text.length < 200 || (opts.pack && opts.pack.projects.length === 0)) {
    hardFail = true;
    reasons.push("hard:empty_or_no_projects");
  }
  // C4 residue: hard when severe
  if (residueFail) {
    hardFail = true;
    reasons.push(
      `hard:residue:${residueHits.map((h) => `p${h.index}`).join(",")}`
    );
  } else if (residueHits.length === 1) {
    softBand = true;
    reasons.push(`soft:residue_one:${residueHits[0]!.detail}`);
  }

  // Soft band: near miss ATS/psych without hard fail
  if (!hardFail) {
    if (ats.score < SOFT_ATS_LOW) {
      hardFail = true;
      reasons.push(`hard:ats_${ats.score}`);
    } else if (ats.score < SHIP_MIN_ATS) {
      softBand = true;
      reasons.push(`soft:ats_${ats.score}`);
    }
    if (psych.score < SOFT_PSYCH_LOW) {
      softBand = true;
      reasons.push(`soft:psych_${psych.score}`);
    } else if (psych.score < 90 && ats.score < 100) {
      softBand = true;
      reasons.push(`soft:psych_mid_${psych.score}`);
    }
    if (!ship.ok && !hardFail) {
      softBand = true;
      for (const issue of ship.issues) {
        if (!hardCodes.has(issue.code)) {
          reasons.push(`soft:${issue.code}`);
        }
      }
    }
  }

  // Multi-objective rank (never ATS alone)
  // lexicographic hard-pass encoded as big penalty
  let rankScore = 0;
  if (!hardFail) {
    rankScore =
      0.45 * psych.score +
      0.3 * ats.score +
      0.25 * Math.max(0, 100 - residueHits.length * 25);
    if (fillerPresent) rankScore -= 50;
  } else {
    rankScore =
      0.3 * psych.score +
      0.2 * ats.score -
      40 -
      residueHits.length * 10;
  }

  const band: ScoreBand = hardFail ? "hard" : softBand ? "soft" : "green";
  const ok = band === "green" && ship.ok;

  return {
    band,
    hardFail,
    softBand: softBand && !hardFail,
    ok,
    ats,
    psych,
    ship,
    residueHits,
    residueFail,
    fillerPresent,
    freeMetrics,
    reasons,
    rankScore,
  };
}

/** Build regen feedback from score (C2 tier1). */
export function feedbackFromScore(score: PackScoreReport): string {
  const parts = [
    "REGEN: keep name/employers/dates/education locks.",
    "Rewrite EVERY project index (0..n-1) role, techStack, environment, all bullets to the JD domain.",
    "FORBIDDEN: master domain face on mid/early projects; Company+(N/M) filler; invent free metrics.",
  ];
  if (score.ats.missingKeywords?.length) {
    parts.push(
      `Missing JD keywords to weave honestly: ${score.ats.missingKeywords.slice(0, 12).join(", ")}`
    );
  }
  if (score.residueHits.length) {
    parts.push(
      `Residue on projects: ${score.residueHits
        .map((h) => `[${h.index}] ${h.employer} (${h.detail})`)
        .join("; ")}`
    );
  }
  if (score.fillerPresent) parts.push("Strip all engagement-goals (N/M) filler.");
  parts.push(`Prior: ATS ${score.ats.score} Psych ${score.psych.score} band=${score.band}`);
  return parts.join("\n");
}
