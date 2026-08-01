/**
 * Hard pre-show rules checklist — resume must pass before client-facing delivery.
 */

import { extractJobTitle } from "./jd-parse";
import { detectDomain } from "./jd-parse";
import {
  criticalJdPhrases,
  hasCriticalJdCoverage,
} from "./jd-weave";
import {
  DEFAULT_RESUME_ENGINE_POLICY,
  isOffDomainText,
  type ResumeEnginePolicy,
} from "./resume-engine-policy";
import type { StructuredResume } from "./templates";

export type RuleCheck = {
  id: string;
  ok: boolean;
  message: string;
};

export type RulesGateResult = {
  pass: boolean;
  checks: RuleCheck[];
  score: number;
};

export function runRulesGate(opts: {
  text: string;
  structured: StructuredResume;
  jd: string;
  masterProjectCount: number;
  usedOpenAi: boolean;
  model?: string;
  policy?: ResumeEnginePolicy;
}): RulesGateResult {
  const policy = opts.policy || DEFAULT_RESUME_ENGINE_POLICY;
  const text = opts.text || "";
  const jobTitle = extractJobTitle(opts.jd);
  const domain = detectDomain(opts.jd, jobTitle, policy);
  const critical = criticalJdPhrases(opts.jd, domain, policy);
  const checks: RuleCheck[] = [];

  const add = (id: string, ok: boolean, message: string) => {
    checks.push({ id, ok, message });
  };

  // Informational only: never fail the pack for presence/absence of engine footer
  add(
    "openai_engine",
    true,
    opts.usedOpenAi
      ? "AI engine path (marker optional)"
      : "Non-AI / rules path"
  );

  add(
    "header_title_jd",
    !!(
      opts.structured.headline &&
      (opts.structured.headline
        .toLowerCase()
        .includes(jobTitle.slice(0, 20).toLowerCase()) ||
        jobTitle
          .toLowerCase()
          .includes(opts.structured.headline.slice(0, 20).toLowerCase()) ||
        /SAP/i.test(opts.structured.headline))
    ),
    `Headline from JD: "${opts.structured.headline?.slice(0, 60)}"`
  );

  add(
    "header_contact_master",
    !!(opts.structured.contactLine && opts.structured.contactLine.length > 5),
    "Contact line present (from master)"
  );

  const empLines = (text.match(/Employer\s*\/\s*Client\s*:/gi) || []).length;
  const need = Math.max(1, opts.masterProjectCount);
  add(
    "all_projects",
    empLines >= need,
    `Projects present: ${empLines}/${need} Employer/Client lines`
  );

  // Recent titles: first two job-title-like lines after experience should reflect JD
  const titleHits = (
    text.match(new RegExp(jobTitle.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ||
    []
  ).length;
  const needTitles = Math.max(1, policy.recentTitleCount || 2);
  add(
    "recent_jd_titles",
    titleHits >= needTitles || jobTitle.length < 8,
    `JD title appears ${titleHits}× (need ≥${needTitles} for recent roles)`
  );

  // Off-domain lines using admin ban patterns
  const experienceBlock =
    text.match(
      /(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT)[\s\S]{0,12000}/i
    )?.[0] || text;
  const titleLikeLines = experienceBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && l.length < 120 && /^[A-Z]/.test(l));
  const offDomainHits = titleLikeLines.filter((l) =>
    isOffDomainText(l, domain, policy)
  ).length;
  if (policy.offDomainRules.some((r) => r.whenDomain.includes(domain))) {
    add(
      "no_off_domain_titles",
      offDomainHits === 0,
      offDomainHits
        ? `Found ${offDomainHits} off-domain title line(s) for domain ${domain}`
        : `No off-domain titles for ${domain}`
    );
  }

  // Specialty only when JD actually lists phrases — never fail for empty/invented packs
  add(
    "specialty_coverage",
    critical.length < 3 || hasCriticalJdCoverage(text, critical, 0.35),
    critical.length
      ? `JD phrases present: ${critical.slice(0, 5).join(", ")}`
      : "No JD specialty phrases required"
  );

  // Honesty: invented location spam (legacy default "United States" on every role)
  const usSpam = (text.match(/United States/gi) || []).length;
  add(
    "no_location_spam",
    usSpam <= Math.max(2, opts.masterProjectCount + 1),
    usSpam > Math.max(2, opts.masterProjectCount + 1)
      ? `Suspicious location spam: ${usSpam}× "United States"`
      : "Location density OK"
  );

  const sumHeads = (text.match(/PROFESSIONAL SUMMARY/gi) || []).length;
  add(
    "no_dup_summary",
    sumHeads <= 1,
    sumHeads > 1 ? "Duplicate Professional Summary" : "Single summary heading OK"
  );

  add(
    "no_noise",
    !/80\s*\/\s*hr|\$\d+\s*\/\s*hr|ROLE\s*::|interview questions/i.test(text),
    "No rates/staffing noise"
  );

  add(
    "no_identity_in_summary",
    !/professional summary[\s\S]{0,120}[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
      text
    ),
    "No email leak under summary"
  );

  add(
    "has_experience_content",
    text.length > 1500 && empLines >= 1,
    `Body length ${text.length} chars`
  );

  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);
  const pass = checks.every((c) => c.ok);

  return { pass, checks, score };
}
