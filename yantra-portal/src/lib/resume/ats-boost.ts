/**
 * Aggressive ATS climb (intentionally a little less honest).
 *
 * After first score, inject missing JD keywords / title / verbs into the pack
 * so Fit-IR can reach 100. Does not invent employers or free $/% metrics.
 */

import { scoreResume, type AtsResult } from "./ats-scorer";
import { renderPlainFromStructured } from "./build-from-layout";
import type { StructuredResume } from "./templates";

const RESP_VERBS = [
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
  "compliance",
];

export type AtsBoostResult = {
  structured: StructuredResume;
  text: string;
  ats: AtsResult;
  boosted: boolean;
  rounds: number;
  injected: string[];
};

function ensureSkillsInject(
  structured: StructuredResume,
  tokens: string[]
): StructuredResume {
  if (!tokens.length) return structured;
  const line = `JD keywords: ${tokens.slice(0, 16).join(" · ")}`;
  let hit = false;
  const sections = structured.sections.map((sec) => {
    if (!/skill|matrix|competenc|stack|instrument|capability|core/i.test(sec.heading)) {
      return sec;
    }
    hit = true;
    const without = sec.lines.filter((l) => !/JD keywords:/i.test(l));
    return { ...sec, lines: [line, ...without] };
  });
  if (!hit) {
    sections.splice(1, 0, { heading: "Technical Skills", lines: [line] });
  }
  return { ...structured, sections };
}

function ensureTitleInSummary(
  structured: StructuredResume,
  jobTitle: string
): StructuredResume {
  if (!jobTitle || jobTitle.length < 4) return structured;
  const re = new RegExp(
    jobTitle.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i"
  );
  const plain = renderPlainFromStructured(structured);
  if (re.test(plain)) return structured;

  return {
    ...structured,
    headline: jobTitle,
    sections: structured.sections.map((sec) => {
      if (!/summary|profile|pitch/i.test(sec.heading)) return sec;
      const lead = `Target role: ${jobTitle}.`;
      if (sec.lines.some((l) => re.test(l))) return sec;
      return { ...sec, lines: [lead, ...sec.lines] };
    }),
  };
}

function ensureVerbsLine(
  structured: StructuredResume,
  jd: string,
  text: string
): StructuredResume {
  const needed = RESP_VERBS.filter(
    (v) => new RegExp(v, "i").test(jd) && !new RegExp(v, "i").test(text)
  ).slice(0, 6);
  if (!needed.length) return structured;

  const line = `Delivery verbs: ${needed.join(", ")} — applied across discovery, build, test, and release.`;
  return {
    ...structured,
    sections: structured.sections.map((sec) => {
      if (!/skill|matrix|competenc|impact|achievement/i.test(sec.heading)) {
        return sec;
      }
      if (sec.lines.some((l) => /Delivery verbs:/i.test(l))) return sec;
      return { ...sec, lines: [...sec.lines, line] };
    }),
  };
}

function sprinkleMissingIntoRecentBullets(
  structured: StructuredResume,
  missing: string[]
): StructuredResume {
  if (!missing.length) return structured;
  const top = missing.slice(0, 4);
  let experienceSeen = 0;
  return {
    ...structured,
    sections: structured.sections.map((sec) => {
      if (!/experience|engagement|work|employment|chapter|selected work/i.test(sec.heading)) {
        return sec;
      }
      experienceSeen++;
      if (experienceSeen > 1) return sec; // only first experience-like block
      const extra = top.map(
        (k) =>
          `• Applied ${k} on engagement deliverables with design, validation, and stakeholder alignment.`
      );
      // Avoid duplicating if already present
      const existing = sec.lines.join("\n").toLowerCase();
      const add = extra.filter((e) => {
        const key = e.toLowerCase().match(/applied (.+?) on/i)?.[1] || "";
        return key && !existing.includes(key.toLowerCase());
      });
      if (!add.length) return sec;
      return { ...sec, lines: [...sec.lines, ...add] };
    }),
  };
}

/**
 * Climb ATS toward 100 by injecting missing JD signals (all modes).
 * Slightly less honest by design — JD keyword presence over pure master-only purity.
 */
export function boostPackTowardAts100(opts: {
  structured: StructuredResume;
  jd: string;
  jobTitle: string;
  recentProjectCount?: number;
  /** Still block free-metric / hard cosplay caps if true */
  honestyFailed?: boolean;
  maxRounds?: number;
}): AtsBoostResult {
  let structured = opts.structured;
  let text = renderPlainFromStructured(structured);
  const injected: string[] = [];
  const maxRounds = opts.maxRounds ?? 2;
  let rounds = 0;
  let ats = scoreResume({
    resumeText: text,
    jd: opts.jd,
    jobTitle: opts.jobTitle,
    recentProjectCount: opts.recentProjectCount ?? 2,
    temporalViolations: 0,
    earlyCareerOversell: false,
    honestyFailed: opts.honestyFailed === true,
  });

  while (ats.score < 100 && rounds < maxRounds) {
    rounds++;
    const before = ats.score;
    const missing = ats.missingKeywords || [];

    structured = ensureTitleInSummary(structured, opts.jobTitle);
    if (missing.length) {
      structured = ensureSkillsInject(structured, missing);
      injected.push(...missing.slice(0, 12));
      structured = sprinkleMissingIntoRecentBullets(structured, missing);
    }
    structured = ensureVerbsLine(structured, opts.jd, text);

    // Always reinforce critical JD tokens from breakdown warnings path
    if (ats.breakdown.keywordCoverage < 25 && missing.length === 0) {
      // re-extract via score already empty missing — force title + skills headline
      structured = ensureSkillsInject(structured, [
        opts.jobTitle,
        ...opts.jobTitle.split(/\s+/).filter((t) => t.length > 3),
      ]);
    }

    text = renderPlainFromStructured(structured);
    ats = scoreResume({
      resumeText: text,
      jd: opts.jd,
      jobTitle: opts.jobTitle,
      recentProjectCount: opts.recentProjectCount ?? 2,
      temporalViolations: 0,
      earlyCareerOversell: false,
      honestyFailed: opts.honestyFailed === true,
    });

    if (ats.score <= before && rounds >= 1 && missing.length === 0) break;
  }

  // Final plain text for ship path
  text = renderPlainFromStructured(structured);
  ats = scoreResume({
    resumeText: text,
    jd: opts.jd,
    jobTitle: opts.jobTitle,
    recentProjectCount: opts.recentProjectCount ?? 2,
    temporalViolations: 0,
    earlyCareerOversell: false,
    honestyFailed: opts.honestyFailed === true,
  });

  return {
    structured,
    text,
    ats,
    boosted: rounds > 0 || injected.length > 0,
    rounds,
    injected: Array.from(new Set(injected)),
  };
}
