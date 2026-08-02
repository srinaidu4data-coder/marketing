/**
 * Master-grounded ATS fix pass.
 *
 * After first score:
 *  1) Use missingKeywords + breakdown
 *  2) Inject only terms grounded in master (or synonym family on master)
 *  3) Rescore (synonym-aware scorer) toward 100
 *
 * Does not invent employers, free $/% metrics, or ungrounded specialty claims.
 */

import { scoreResume, type AtsResult, type AtsBreakdown } from "./ats-scorer";
import { renderPlainFromStructured } from "./build-from-layout";
import type { StructuredResume } from "./templates";
import {
  masterGroundedMissing,
  preferredInjectForm,
  textHasKeywordOrSynonym,
} from "./keyword-synonyms";

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
  skippedUngrounded: string[];
  notes: string[];
};

function ensureSkillsInject(
  structured: StructuredResume,
  tokens: string[]
): StructuredResume {
  if (!tokens.length) return structured;
  const line = `Core / JD-aligned skills: ${tokens.slice(0, 16).join(" · ")}`;
  let hit = false;
  const sections = structured.sections.map((sec) => {
    if (!/skill|matrix|competenc|stack|instrument|capability|core/i.test(sec.heading)) {
      return sec;
    }
    hit = true;
    const without = sec.lines.filter(
      (l) => !/JD keywords:|Core \/ JD-aligned skills:/i.test(l)
    );
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
  const plain = renderPlainFromStructured(structured);
  if (textHasKeywordOrSynonym(plain, jobTitle)) {
    return { ...structured, headline: structured.headline || jobTitle };
  }

  return {
    ...structured,
    headline: jobTitle,
    sections: structured.sections.map((sec) => {
      if (!/summary|profile|pitch/i.test(sec.heading)) return sec;
      const lead = `${jobTitle} with progressive delivery ownership across client engagements.`;
      if (sec.lines.some((l) => textHasKeywordOrSynonym(l, jobTitle))) return sec;
      return { ...sec, lines: [lead, ...sec.lines] };
    }),
  };
}

function ensureVerbsFromJdAndMaster(
  structured: StructuredResume,
  jd: string,
  master: string,
  text: string
): StructuredResume {
  // Only verbs that appear in JD and are also "grounded" (in master or generic delivery)
  const genericOk = new Set([
    "support",
    "test",
    "design",
    "lead",
    "implement",
    "configure",
    "integrate",
    "migrate",
    "stakeholder",
  ]);
  const needed = RESP_VERBS.filter((v) => {
    if (!new RegExp(v, "i").test(jd)) return false;
    if (new RegExp(v, "i").test(text)) return false;
    return genericOk.has(v) || textHasKeywordOrSynonym(master, v);
  }).slice(0, 5);
  if (!needed.length) return structured;

  const line = `Delivery focus: ${needed.join(", ")} across discovery, build, validation, and release.`;
  return {
    ...structured,
    sections: structured.sections.map((sec) => {
      if (!/skill|matrix|competenc|impact|achievement|summary/i.test(sec.heading)) {
        return sec;
      }
      if (sec.lines.some((l) => /Delivery focus:/i.test(l))) return sec;
      return { ...sec, lines: [...sec.lines, line] };
    }),
  };
}

/**
 * Weave master-grounded missing terms into recent experience bullets
 * by appending short lines that restate master-safe skills.
 */
function sprinkleGroundedIntoRecent(
  structured: StructuredResume,
  grounded: string[],
  master: string
): StructuredResume {
  if (!grounded.length) return structured;
  const top = grounded.slice(0, 4).map((k) => preferredInjectForm(k, master));
  let experienceSeen = 0;
  return {
    ...structured,
    sections: structured.sections.map((sec) => {
      if (
        !/experience|engagement|work|employment|chapter|selected work|leadership/i.test(
          sec.heading
        )
      ) {
        return sec;
      }
      experienceSeen++;
      if (experienceSeen > 1) return sec;
      const existing = sec.lines.join("\n");
      const add = top
        .filter((k) => !textHasKeywordOrSynonym(existing, k))
        .map(
          (k) =>
            `• Leveraged ${k} on engagement workstreams — design input, validation, and stakeholder alignment grounded in prior delivery.`
        );
      if (!add.length) return sec;
      return { ...sec, lines: [...sec.lines, ...add] };
    }),
  };
}

function breakdownGaps(b: AtsBreakdown): string[] {
  const notes: string[] = [];
  if (b.keywordCoverage < 25) notes.push(`keywords ${b.keywordCoverage}/25`);
  if (b.roleMatch < 20) notes.push(`role ${b.roleMatch}/20`);
  if (b.parseSafety < 20) notes.push(`parse ${b.parseSafety}/20`);
  if (b.temporalIntegrity < 15) notes.push(`temporal ${b.temporalIntegrity}/15`);
  if (b.progressiveBalance < 10) notes.push(`progressive ${b.progressiveBalance}/10`);
  if (b.recencyEmphasis < 10) notes.push(`recency ${b.recencyEmphasis}/10`);
  return notes;
}

function scoreOnce(
  text: string,
  jd: string,
  jobTitle: string,
  recentProjectCount: number,
  honestyFailed?: boolean
): AtsResult {
  return scoreResume({
    resumeText: text,
    jd,
    jobTitle,
    recentProjectCount,
    temporalViolations: 0,
    earlyCareerOversell: false,
    honestyFailed: honestyFailed === true,
  });
}

/**
 * Master-grounded climb toward ATS 100.
 * Feeds missingKeywords + breakdown into one (or two) fix passes.
 */
export function boostPackTowardAts100(opts: {
  structured: StructuredResume;
  jd: string;
  jobTitle: string;
  /** Required for grounded inject — without master, only title/verb soft fixes */
  masterText?: string;
  recentProjectCount?: number;
  honestyFailed?: boolean;
  maxRounds?: number;
}): AtsBoostResult {
  const master = opts.masterText || "";
  let structured = opts.structured;
  let text = renderPlainFromStructured(structured);
  const injected: string[] = [];
  const skippedUngrounded: string[] = [];
  const notes: string[] = [];
  const maxRounds = opts.maxRounds ?? 2;
  const recentN = opts.recentProjectCount ?? 2;
  let rounds = 0;

  let ats = scoreOnce(text, opts.jd, opts.jobTitle, recentN, opts.honestyFailed);
  notes.push(
    `pre-fix ATS ${ats.score} · gaps: ${breakdownGaps(ats.breakdown).join(", ") || "none"}`
  );

  while (ats.score < 100 && rounds < maxRounds) {
    rounds++;
    const before = ats.score;
    const missing = ats.missingKeywords || [];
    const grounded = master
      ? masterGroundedMissing(missing, master)
      : [];
    const skipped = missing.filter(
      (m) => !grounded.some((g) => g.toLowerCase() === m.toLowerCase())
    );
    skippedUngrounded.push(...skipped);

    // Breakdown-driven structural fixes
    if (ats.breakdown.roleMatch < 20) {
      structured = ensureTitleInSummary(structured, opts.jobTitle);
      notes.push(`round ${rounds}: role fix (title in summary/headline)`);
    }

    if (ats.breakdown.keywordCoverage < 25 && grounded.length) {
      structured = ensureSkillsInject(structured, grounded);
      structured = sprinkleGroundedIntoRecent(structured, grounded, master);
      injected.push(...grounded);
      notes.push(
        `round ${rounds}: inject grounded keywords [${grounded.slice(0, 8).join(", ")}]`
      );
    } else if (ats.breakdown.keywordCoverage < 25 && missing.length && !grounded.length) {
      notes.push(
        `round ${rounds}: ${missing.length} missing keywords ungrounded in master — skipped invent`
      );
    }

    // Soft verb line only when role/keyword still weak and verbs exist on JD+master
    if (ats.breakdown.roleMatch < 20 || ats.breakdown.keywordCoverage < 25) {
      structured = ensureVerbsFromJdAndMaster(
        structured,
        opts.jd,
        master,
        text
      );
    }

    text = renderPlainFromStructured(structured);
    ats = scoreOnce(text, opts.jd, opts.jobTitle, recentN, opts.honestyFailed);
    notes.push(
      `round ${rounds}: ATS ${before}→${ats.score} · remaining missing ${ats.missingKeywords.length}`
    );

    if (ats.score <= before) break;
  }

  text = renderPlainFromStructured(structured);
  ats = scoreOnce(text, opts.jd, opts.jobTitle, recentN, opts.honestyFailed);

  return {
    structured,
    text,
    ats,
    boosted: rounds > 0 || injected.length > 0,
    rounds,
    injected: Array.from(new Set(injected)),
    skippedUngrounded: Array.from(new Set(skippedUngrounded)),
    notes,
  };
}
