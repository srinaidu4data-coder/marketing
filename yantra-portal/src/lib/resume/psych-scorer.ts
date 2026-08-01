/**
 * Psych / credibility score (0–100) — binary dimensions.
 *
 * Complements ATS Fit-IR. "Best" packs require psych === 100 AND ats === 100.
 * Dimensions encode costly signals, honesty, identity coherence, first-screen structure
 * (Spence; dual-process thin-slice; serial position structure — not keyword stuffing).
 */

import {
  packHasFreeMetrics,
  packHasIndustryCosplay,
  packHasMasterResidueLeak,
  countYearsClaims,
} from "./resume-honesty";
import { parseStoredMasterProfile } from "./master-profile";
import type { TailorMode } from "./tailor-mode";
import { yearsFromMasterAndProjects } from "./jd-parse";

export type PsychBreakdown = {
  industryHonesty: number; // 20
  freeMetricsBan: number; // 15
  employerFidelity: number; // 15
  certEducationHonesty: number; // 10
  titlePolicy: number; // 15
  oneYearsClaim: number; // 10
  identityBrand: number; // 10
  firstScreen: number; // 5
};

export type PsychResult = {
  score: number;
  breakdown: PsychBreakdown;
  warnings: string[];
  /** Perfect credibility — all binary dims full */
  ready: boolean;
  mode: TailorMode;
};

const DIM = {
  industryHonesty: 20,
  freeMetricsBan: 15,
  employerFidelity: 15,
  certEducationHonesty: 10,
  titlePolicy: 15,
  oneYearsClaim: 10,
  identityBrand: 10,
  firstScreen: 5,
} as const;

function extractSection(text: string, start: RegExp, end: RegExp): string {
  const t = text || "";
  const m = t.match(start);
  if (!m || m.index == null) return "";
  const from = m.index + m[0].length;
  const rest = t.slice(from);
  const e = rest.search(end);
  return (e >= 0 ? rest.slice(0, e) : rest).slice(0, 8000);
}

export function scorePsych(opts: {
  resumeText: string;
  masterText: string;
  masterProfileJson?: string | null;
  jd: string;
  jobTitle: string;
  mode: TailorMode;
  candidateName?: string;
}): PsychResult {
  const text = opts.resumeText || "";
  const master = opts.masterText || "";
  const warnings: string[] = [];
  const breakdown: PsychBreakdown = {
    industryHonesty: 0,
    freeMetricsBan: 0,
    employerFidelity: 0,
    certEducationHonesty: 0,
    titlePolicy: 0,
    oneYearsClaim: 0,
    identityBrand: 0,
    firstScreen: 0,
  };

  // ── Industry honesty (summary + impact + experience headers/env) ──
  const scanRegions = [
    extractSection(
      text,
      /professional summary\s*\n/i,
      /\n\s*(core competencies|technical skills|selected impact|professional experience)/i
    ),
    extractSection(
      text,
      /selected impact\s*\n/i,
      /\n\s*(professional experience|experience|education)/i
    ),
    text.match(
      /(?:PROFESSIONAL EXPERIENCE|EXPERIENCE)[\s\S]{0,14000}/i
    )?.[0] || "",
  ].join("\n");

  const cosplay = packHasIndustryCosplay(scanRegions, master);
  const residue = packHasMasterResidueLeak(text, opts.jd || "", opts.mode);
  if (cosplay.length === 0 && residue.length === 0) {
    breakdown.industryHonesty = DIM.industryHonesty;
  } else {
    if (cosplay.length)
      warnings.push(`Industry cosplay: ${cosplay.join(", ")}`);
    if (residue.length)
      warnings.push(`Master residue under JD titles: ${residue.slice(0, 3).join("; ")}`);
  }

  // ── Free metrics ──
  const free = packHasFreeMetrics(text, master);
  if (free.length === 0) {
    breakdown.freeMetricsBan = DIM.freeMetricsBan;
  } else {
    warnings.push(`Unsupported metrics: ${free.slice(0, 4).join("; ")}`);
  }

  // ── Employer fidelity ──
  const profile = parseStoredMasterProfile(opts.masterProfileJson);
  const clients = profile?.engagements.map((e) => e.client) || [];
  if (!clients.length) {
    // No structured profile — pass if at least one Employer line exists
    const n = (text.match(/Employer\s*\/\s*Client\s*:/gi) || []).length;
    if (n >= 1) breakdown.employerFidelity = DIM.employerFidelity;
    else warnings.push("No Employer/Client lines");
  } else {
    const textLc = text.toLowerCase();
    let missing = 0;
    for (const client of clients) {
      const core = client.split(",")[0].trim();
      const tokens = core
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((t) => t.length > 3);
      const primary = tokens.find((t) => t.length >= 5) || tokens[0] || "";
      if (primary.length >= 3 && !textLc.includes(primary)) missing++;
    }
    if (missing === 0) breakdown.employerFidelity = DIM.employerFidelity;
    else warnings.push(`${missing} master employer(s) missing from pack`);
  }

  // ── Cert / education ──
  const eduBlock =
    extractSection(
      text,
      /(?:education|certifications?)\s*\n/i,
      /\n\s*—\s*Role Forge|\n\s*$/i
    ) || "";
  const eduLines = eduBlock
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 4 && l.length < 200);
  const masterLc = master.toLowerCase();
  let eduBad = 0;
  for (const line of eduLines) {
    // Skip section headers
    if (/^(education|certifications?)$/i.test(line)) continue;
    const needle = line.toLowerCase().slice(0, Math.min(40, line.length));
    if (needle.length >= 8 && !masterLc.includes(needle.slice(0, 24))) {
      // Generic degree defaults
      if (/bachelor.?s degree or equivalent/i.test(line)) eduBad++;
      else if (
        /SAP\s+S\/?4|SAP\s+Certified|TERP|C_TS/i.test(line) &&
        !/sap/i.test(opts.jd || "") &&
        opts.mode !== "same_domain"
      ) {
        eduBad++;
      } else if (!masterLc.includes(needle.slice(0, 16))) {
        // soft: only hard-fail clear inventions
        if (/or equivalent professional experience/i.test(line)) eduBad++;
      }
    }
  }
  // SAP cert on non-SAP JD
  if (
    /SAP\s+(S\/?4|Certified|HANA)/i.test(text) &&
    !/\bsap\b/i.test(opts.jd || "") &&
    opts.mode !== "same_domain"
  ) {
    eduBad++;
    warnings.push("SAP credential on non-SAP JD");
  }
  if (eduBad === 0) breakdown.certEducationHonesty = DIM.certEducationHonesty;
  else warnings.push("Education/cert honesty issues");

  // ── Title policy by mode ──
  const jobTitle = opts.jobTitle || "";
  const expBlock =
    text.match(
      /(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT)[\s\S]{0,12000}/i
    )?.[0] || text;
  const titleHits = jobTitle
    ? (
        expBlock.match(
          new RegExp(
            jobTitle.slice(0, 28).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "gi"
          )
        ) || []
      ).length
    : 0;

  if (opts.mode === "same_domain") {
    if (titleHits >= 1 || jobTitle.length < 8) {
      breakdown.titlePolicy = DIM.titlePolicy;
    } else {
      warnings.push("same_domain: JD title missing from experience");
    }
  } else {
    // transfer/strict: do not clone JD title onto every role
    if (titleHits >= 4 && clients.length >= 3) {
      warnings.push(
        `${opts.mode}: JD title appears ${titleHits}× (career cosplay)`
      );
    } else {
      breakdown.titlePolicy = DIM.titlePolicy;
    }
  }

  // ── One years claim ──
  const yearsClaims = countYearsClaims(text);
  const starts =
    profile?.engagements.map((e) => e.startYear).filter((y) => y >= 1980) ||
    [];
  const span =
    starts.length > 0
      ? yearsFromMasterAndProjects(master, starts)
      : 0;
  if (yearsClaims <= 1) {
    if (yearsClaims === 0 || span <= 0) {
      breakdown.oneYearsClaim = DIM.oneYearsClaim;
    } else {
      // Allow ±2 years slack on stated number
      const m = text.match(
        /\b(\d{1,2})\+?\s*years?\b|\bapproximately\s+(\d{1,2})\+?\s*years?\b/i
      );
      const n = m ? Number(m[1] || m[2]) : span;
      if (Math.abs(n - span) <= 2) {
        breakdown.oneYearsClaim = DIM.oneYearsClaim;
      } else {
        warnings.push(
          `Years claim ${n} vs master span ~${span}`
        );
      }
    }
  } else {
    warnings.push(`Multiple years claims (${yearsClaims})`);
  }

  // ── Identity / brand ──
  let idOk = true;
  if ((text.match(/^\s*PROFESSIONAL SUMMARY\s*$/gim) || []).length > 1) {
    idOk = false;
    warnings.push("Duplicate Professional Summary");
  }
  if (
    /professional summary[\s\S]{0,120}[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
      text
    )
  ) {
    idOk = false;
    warnings.push("Email under summary");
  }
  if (/@example\.com/i.test(text)) {
    idOk = false;
    warnings.push("Demo/example email");
  }
  if (opts.candidateName) {
    const first = opts.candidateName.split(/\s+/)[0];
    if (
      first &&
      first.length > 1 &&
      !new RegExp(first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
        text.slice(0, 400)
      )
    ) {
      // soft — header might be formatting
    }
  }
  if (idOk) breakdown.identityBrand = DIM.identityBrand;

  // ── First-screen skeleton ──
  const hasSummary = /professional summary|summary/i.test(text);
  const hasSkills = /core competencies|technical skills|skills/i.test(text);
  const hasExp = /professional experience|experience|employment/i.test(text);
  if (hasSummary && hasSkills && hasExp) {
    breakdown.firstScreen = DIM.firstScreen;
  } else {
    warnings.push("Missing first-screen sections (summary/skills/experience)");
  }

  const score = Math.min(
    100,
    Object.values(breakdown).reduce((a, b) => a + b, 0)
  );

  return {
    score,
    breakdown,
    warnings,
    ready: score === 100,
    mode: opts.mode,
  };
}
