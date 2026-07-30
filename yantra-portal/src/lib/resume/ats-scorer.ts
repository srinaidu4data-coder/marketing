/**
 * Internal ATS scorer — target >= 95.
 * Re-exports JD parsers; scoring stays here.
 */

import {
  extractJdKeywords,
  extractJobTitle,
  skillFingerprint,
} from "./jd-parse";

export { extractJdKeywords, extractJobTitle, skillFingerprint };

export type AtsBreakdown = {
  parseSafety: number;
  keywordCoverage: number;
  roleMatch: number;
  temporalIntegrity: number;
  progressiveBalance: number;
  recencyEmphasis: number;
};

export type AtsResult = {
  score: number;
  breakdown: AtsBreakdown;
  missingKeywords: string[];
  warnings: string[];
  ready: boolean;
};

const STOP = new Set(
  "the and for with that this from have will your our are you all any can not but into a an of to in on as by or be is was were been being at it its".split(
    " "
  )
);

export function scoreResume(opts: {
  resumeText: string;
  jd: string;
  jobTitle: string;
  recentProjectCount?: number;
  temporalViolations?: number;
  earlyCareerOversell?: boolean;
}): AtsResult {
  const text = opts.resumeText || "";
  const jd = opts.jd || "";
  const keywords = extractJdKeywords(jd);
  const warnings: string[] = [];
  const missing: string[] = [];

  let parseSafety = 20;
  if (/\|{2,}|\t{2,}/.test(text)) {
    parseSafety -= 4;
    warnings.push("Multi-column-like separators detected");
  }
  if (/<table|text-box|textbox/i.test(text)) {
    parseSafety -= 6;
    warnings.push("Table/text-box markers harm ATS parsing");
  }
  const hasHeadings =
    /professional summary|summary|technical skills|skills|experience|projects|education/i.test(
      text
    );
  if (!hasHeadings) {
    parseSafety -= 8;
    warnings.push("Missing standard section headings");
  }
  parseSafety = Math.max(0, parseSafety);

  let hit = 0;
  for (const k of keywords) {
    if (new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) {
      hit++;
    } else {
      missing.push(k);
    }
  }
  const coverageRatio = keywords.length ? hit / keywords.length : 1;
  // Full keyword points once ≥90% of JD terms appear (near-100% matching target)
  const keywordCoverage = Math.round(25 * Math.min(1, coverageRatio / 0.9));
  if (coverageRatio < 0.9) {
    warnings.push(`Keyword coverage only ${Math.round(coverageRatio * 100)}% (target ≥90%)`);
  }

  let roleMatch = 0;
  const titleTokens = opts.jobTitle
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t.toLowerCase()));
  const titleHits = titleTokens.filter((t) =>
    new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)
  ).length;
  const titleRatio = titleTokens.length ? titleHits / titleTokens.length : 1;
  roleMatch = Math.round(12 * titleRatio);
  const respHints = [
    "implement",
    "configure",
    "support",
    "migrate",
    "integrate",
    "lead",
    "design",
    "test",
    "cutover",
    "stakeholder",
    "serial",
    "compliance",
    "trace",
  ];
  const respInJd = respHints.filter((r) => new RegExp(r, "i").test(jd));
  const respHits = respInJd.filter((r) => new RegExp(r, "i").test(text)).length;
  roleMatch += Math.round(8 * (respInJd.length ? respHits / respInJd.length : 1));
  roleMatch = Math.min(20, roleMatch);

  let temporalIntegrity = 15;
  const viol = opts.temporalViolations ?? 0;
  if (viol > 0) {
    temporalIntegrity = Math.max(0, 15 - viol * 5);
    warnings.push(`${viol} skill(s) outside project timeframe`);
  }

  let progressiveBalance = 10;
  if (opts.earlyCareerOversell) {
    progressiveBalance = 4;
    warnings.push("Early-career oversell detected");
  }

  let recencyEmphasis = 6;
  if ((opts.recentProjectCount ?? 2) >= 2) recencyEmphasis = 10;
  else if ((opts.recentProjectCount ?? 0) === 1) recencyEmphasis = 7;
  else {
    recencyEmphasis = 3;
    warnings.push("Recent projects lack clear JD alignment");
  }

  const breakdown: AtsBreakdown = {
    parseSafety,
    keywordCoverage,
    roleMatch,
    temporalIntegrity,
    progressiveBalance,
    recencyEmphasis,
  };
  const score = Math.min(
    100,
    Object.values(breakdown).reduce((a, b) => a + b, 0)
  );

  return {
    score,
    breakdown,
    missingKeywords: missing.slice(0, 12),
    warnings,
    ready: score >= 95,
  };
}
