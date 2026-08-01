/**
 * Multi-pass JD match engine.
 * Generate → score → refine until RESEARCH_GENERATION_RULES thresholds met
 * or max passes exhausted.
 */

import { RESEARCH_GENERATION_RULES } from "./research-foundations";
import { extractJdKeywords, extractJobTitle } from "./jd-parse";
import type { AtsResult } from "./ats-scorer";
import { scoreResume } from "./ats-scorer";

export type MatchGate = {
  pass: boolean;
  score: number;
  keywordCoverage: number;
  missingKeywords: string[];
  titleOnProjects: boolean;
  employerLines: number;
  duplicateSections: boolean;
  identityLeaks: boolean;
  reasons: string[];
};

/** Strict pre-submit gate for client-ready packs */
export function evaluateMatchGate(opts: {
  resumeText: string;
  jd: string;
  jobTitle: string;
  ats: AtsResult;
  /** Master project count — output must include every employer */
  expectedProjectCount?: number;
}): MatchGate {
  const text = opts.resumeText || "";
  const title = (opts.jobTitle || extractJobTitle(opts.jd)).trim();
  const keywords = extractJdKeywords(opts.jd, 40);
  const reasons: string[] = [];

  let hit = 0;
  const missing: string[] = [];
  for (const k of keywords) {
    const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(text)) hit++;
    else missing.push(k);
  }
  const keywordCoverage = keywords.length ? hit / keywords.length : 1;
  if (keywordCoverage < RESEARCH_GENERATION_RULES.minKeywordCoverage) {
    reasons.push(
      `Keyword coverage ${Math.round(keywordCoverage * 100)}% < ${Math.round(RESEARCH_GENERATION_RULES.minKeywordCoverage * 100)}%`
    );
  }

  // Title must appear as headline-ish and in experience zone
  const titleCore = title
    .split(/[-–—|/]/)[0]
    .trim()
    .slice(0, 40);
  const titlePresent =
    !title ||
    new RegExp(title.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
      text
    ) ||
    (titleCore.length > 5 &&
      new RegExp(titleCore.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text));
  if (!titlePresent) reasons.push("Job title missing from resume body");

  // Count Employer / Client lines — must cover ALL master projects when known
  const employerLines = (
    text.match(/Employer\s*\/\s*Client\s*:/gi) || []
  ).length;
  if (
    RESEARCH_GENERATION_RULES.requireEmployerClientLine &&
    employerLines < 1
  ) {
    reasons.push("Missing Employer / Client lines on projects");
  }
  const expected = opts.expectedProjectCount || 0;
  if (expected > 0 && employerLines < expected) {
    reasons.push(
      `Only ${employerLines} of ${expected} master projects present (Employer / Client lines)`
    );
  }

  // Duplicate Professional Summary headings
  const summaryHeads = (
    text.match(/^\s*PROFESSIONAL SUMMARY\s*$/gim) || []
  ).length;
  const duplicateSections = summaryHeads > 1;
  if (duplicateSections) reasons.push("Duplicate PROFESSIONAL SUMMARY headings");

  // Identity leak patterns under body (email repeated mid-doc after first 5 lines)
  const lines = text.split(/\n/);
  const body = lines.slice(6).join("\n");
  const identityLeaks =
    /professional summary[\s\S]{0,80}[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
      text
    ) ||
    (/PROFESSIONAL SUMMARY/i.test(body) &&
      /PROFESSIONAL SUMMARY/i.test(text) &&
      summaryHeads > 1);
  if (identityLeaks) reasons.push("Identity/contact leak under Professional Summary");

  // Ban staffing noise
  if (/80\s*\/\s*hr|\$\d+\s*\/\s*hr|interview questions|ROLE\s*::/i.test(text)) {
    reasons.push("Staffing/rate noise present");
  }

  const score = opts.ats.score;
  if (score < RESEARCH_GENERATION_RULES.minAtsScore) {
    reasons.push(
      `ATS ${score} < ${RESEARCH_GENERATION_RULES.minAtsScore}`
    );
  }

  const pass =
    keywordCoverage >= RESEARCH_GENERATION_RULES.minKeywordCoverage &&
    score >= RESEARCH_GENERATION_RULES.minAtsScore &&
    titlePresent &&
    employerLines >= 1 &&
    !duplicateSections &&
    !identityLeaks &&
    reasons.length === 0;

  return {
    pass,
    score,
    keywordCoverage,
    missingKeywords: missing.slice(0, 15),
    titleOnProjects: titlePresent,
    employerLines,
    duplicateSections,
    identityLeaks,
    reasons,
  };
}

export function buildRefineUserMessage(opts: {
  jobTitle: string;
  missingKeywords: string[];
  reasons: string[];
  currentJsonSnippet: string;
}): string {
  return `REFINE the resume JSON to pass client-submit gate.

TARGET TITLE: ${opts.jobTitle}
FAILURE REASONS:
${opts.reasons.map((r) => `- ${r}`).join("\n") || "- improve JD density"}

MISSING JD KEYWORDS (must appear naturally in summary, skills, and recent project bullets):
${opts.missingKeywords.join(", ") || "(none)"}

RULES:
- Set every recent/mid project title to exactly: ${opts.jobTitle}
- Keep employers and dates unchanged
- Do NOT put name/email/phone inside summary
- Do NOT emit section headings inside string values
- Weave missing keywords into bullets with honest delivery language
- Return full corrected JSON only

CURRENT JSON (edit in place):
${opts.currentJsonSnippet.slice(0, 12000)}`;
}

export function rescoreText(opts: {
  text: string;
  jd: string;
  jobTitle: string;
}): AtsResult {
  return scoreResume({
    resumeText: opts.text,
    jd: opts.jd,
    jobTitle: opts.jobTitle,
    recentProjectCount: 2,
    temporalViolations: 0,
    earlyCareerOversell: false,
  });
}
