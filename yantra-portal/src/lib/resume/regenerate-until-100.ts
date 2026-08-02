/**
 * regenerate-until-100 — single recovery module for resume generation.
 *
 * Contract:
 *   On ANY generation error OR ATS < 100, improve the pack and re-score
 *   until ATS === 100 (or maxAttempts exhausted).
 *
 * Improvement stack (each attempt):
 *   1) Escalating ATS graph (master-grounded → ship-floor → full JD bank)
 *   2) Structural heading repair if parseSafety low
 *   3) Optional full re-generate via callback (new OpenAI / rules pack)
 *
 * Does not invent employers or free $/% metrics.
 */

import {
  boostPackTowardAts100,
  type AtsBoostResult,
} from "./ats-boost";
import { ATS_BEST_SCORE, SHIP_MIN_ATS, type AtsResult } from "./ats-scorer";
import { scorePsych, type PsychResult } from "./psych-scorer";
import type { StructuredResume } from "./templates";
import type { TailorMode } from "./tailor-mode";
import { renderPlainFromStructured } from "./build-from-layout";

export type RegenerateUntil100Input = {
  structured: StructuredResume;
  text: string;
  ats: AtsResult;
  psych?: PsychResult;
  jd: string;
  masterText: string;
  jobTitle?: string;
  candidateName?: string;
  mode?: TailorMode;
  masterProfileJson?: string | null;
  /** Max improvement loops (default 5) */
  maxAttempts?: number;
  /**
   * Optional full re-generate when deterministic boost cannot reach 100.
   * Called when attempt ≥ 2 and still ATS < 100.
   */
  regenerate?: () => Promise<{
    structured: StructuredResume;
    text: string;
    ats: AtsResult;
    psych?: PsychResult;
  }>;
};

export type RegenerateUntil100Result = {
  structured: StructuredResume;
  text: string;
  ats: AtsResult;
  psych?: PsychResult;
  /** True when ATS === 100 */
  reached100: boolean;
  attempts: number;
  history: string[];
  lastBoost?: AtsBoostResult;
  error?: string;
};

function ensureSkeleton(
  structured: StructuredResume,
  jobTitle: string,
  keywords: string[]
): StructuredResume {
  const sections = [...(structured.sections || [])];
  const has = (re: RegExp) => sections.some((s) => re.test(s.heading));
  if (!has(/summary|profile/i)) {
    sections.unshift({
      heading: "Professional Summary",
      lines: [
        `${jobTitle || "Consultant"} with progressive client delivery, stakeholder partnership, and release accountability.`,
      ],
    });
  }
  if (!has(/skill|competenc/i)) {
    sections.splice(1, 0, {
      heading: "Technical Skills",
      lines: [
        `Core / JD-aligned skills: ${keywords.slice(0, 20).join(" · ") || jobTitle}`,
      ],
    });
  }
  if (!has(/experience|engagement|work|employment/i)) {
    sections.push({
      heading: "Professional Experience",
      lines: [
        jobTitle || "Consultant",
        "Employer / Client: Client organization",
        "Location | dates on file",
        "Stack: delivery toolkit",
        "",
        ...Array.from({ length: 8 }, (_, i) =>
          `• Delivery contribution ${i + 1}: design, configure, implement, test, and stakeholder alignment.`
        ),
      ],
    });
  }
  return {
    ...structured,
    headline: structured.headline || jobTitle,
    sections,
  };
}

/**
 * Improve pack until ATS hits 100 (or attempts exhausted).
 * Call after any engine error recovery or when score is below 100.
 */
export async function regenerateUntilAts100(
  input: RegenerateUntil100Input
): Promise<RegenerateUntil100Result> {
  const maxAttempts = Math.max(1, Math.min(8, input.maxAttempts ?? 5));
  const jobTitle =
    input.jobTitle ||
    input.structured.meta.jobTitle ||
    input.structured.headline ||
    "";
  const history: string[] = [];
  let structured = input.structured;
  let text = input.text || renderPlainFromStructured(structured);
  let ats = input.ats;
  let psych = input.psych;
  let lastBoost: AtsBoostResult | undefined;
  let attempts = 0;

  history.push(
    `start ATS ${ats?.score ?? "?"} · target ${ATS_BEST_SCORE} · ship floor ${SHIP_MIN_ATS}`
  );

  while (attempts < maxAttempts) {
    attempts++;

    // Already perfect
    if (ats?.score === ATS_BEST_SCORE) {
      history.push(`attempt ${attempts}: already ATS 100 — done`);
      break;
    }

    // Skeleton repair when pack is broken/empty
    if (!structured?.sections?.length || (text || "").length < 400) {
      structured = ensureSkeleton(structured || {
        candidateName: input.candidateName || "Candidate",
        headline: jobTitle,
        contactLine: "",
        layoutId: "consultant_band",
        sections: [],
        meta: {
          atsScore: 0,
          skillFingerprint: "",
          jobTitle,
          progressiveNotes: [],
        },
      }, jobTitle, ats?.missingKeywords || []);
      text = renderPlainFromStructured(structured);
      history.push(`attempt ${attempts}: skeleton repair`);
    }

    // Deterministic escalating boost (targets 100)
    try {
      lastBoost = boostPackTowardAts100({
        structured,
        jd: input.jd,
        jobTitle,
        masterText: input.masterText,
        recentProjectCount: 2,
        honestyFailed: false,
        shipFloor: ATS_BEST_SCORE, // force T4 path until 100
        maxRounds: 4,
      });
      structured = lastBoost.structured;
      text = lastBoost.text;
      ats = lastBoost.ats;
      structured.meta.atsScore = ats.score;
      structured.meta.progressiveNotes = [
        ...(structured.meta.progressiveNotes || []),
        ...lastBoost.notes.map((n) => `regen[${attempts}]: ${n}`),
      ];
      history.push(
        `attempt ${attempts}: boost T${lastBoost.tierReached} → ATS ${ats.score} (+${lastBoost.injected.length} tok)`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      history.push(`attempt ${attempts}: boost error: ${msg.slice(0, 120)}`);
    }

    // Recompute psych on improved text
    try {
      psych = scorePsych({
        resumeText: text,
        masterText: input.masterText,
        masterProfileJson: input.masterProfileJson,
        jd: input.jd,
        jobTitle,
        mode: input.mode || "transfer",
        candidateName: input.candidateName,
      });
      structured.meta.psychScore = psych.score;
    } catch {
      /* keep prior psych */
    }

    if (ats.score === ATS_BEST_SCORE) {
      history.push(`attempt ${attempts}: reached ATS 100`);
      break;
    }

    // Full re-generate mid-loop if still stuck
    if (input.regenerate && attempts >= 2 && ats.score < ATS_BEST_SCORE) {
      try {
        history.push(`attempt ${attempts}: full regenerate callback`);
        const fresh = await input.regenerate();
        structured = fresh.structured;
        text = fresh.text;
        ats = fresh.ats;
        psych = fresh.psych || psych;
        // Immediate boost on fresh pack
        lastBoost = boostPackTowardAts100({
          structured,
          jd: input.jd,
          jobTitle: structured.meta.jobTitle || jobTitle,
          masterText: input.masterText,
          recentProjectCount: 2,
          honestyFailed: false,
          shipFloor: ATS_BEST_SCORE,
        });
        structured = lastBoost.structured;
        text = lastBoost.text;
        ats = lastBoost.ats;
        structured.meta.atsScore = ats.score;
        structured.meta.progressiveNotes = [
          ...(structured.meta.progressiveNotes || []),
          `regen-full[${attempts}]: T${lastBoost.tierReached} → ${ats.score}`,
        ];
        history.push(
          `attempt ${attempts}: regenerate+boost → ATS ${ats.score}`
        );
        if (ats.score === ATS_BEST_SCORE) break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        history.push(
          `attempt ${attempts}: regenerate failed: ${msg.slice(0, 120)}`
        );
      }
    }
  }

  const reached100 = ats?.score === ATS_BEST_SCORE;
  if (!reached100) {
    history.push(
      `exhausted after ${attempts} attempts · final ATS ${ats?.score ?? "?"} (ship floor ${SHIP_MIN_ATS} still usable if ≥${SHIP_MIN_ATS})`
    );
  }

  return {
    structured,
    text,
    ats,
    psych,
    reached100,
    attempts,
    history,
    lastBoost,
    error: reached100
      ? undefined
      : `Could not reach ATS 100 after ${attempts} attempts (final ${ats?.score ?? "?"}/100)`,
  };
}

/**
 * Run regen module when generation threw, using last structured if any,
 * or building from empty skeleton + optional regenerate callback.
 */
export async function recoverFromGenerationError(opts: {
  error: unknown;
  jd: string;
  masterText: string;
  jobTitle?: string;
  candidateName?: string;
  masterProfileJson?: string | null;
  mode?: TailorMode;
  /** Prefer full re-generate on error */
  regenerate?: RegenerateUntil100Input["regenerate"];
  /** Partial pack if engine failed after scoring */
  partial?: {
    structured?: StructuredResume;
    text?: string;
    ats?: AtsResult;
    psych?: PsychResult;
  };
}): Promise<RegenerateUntil100Result> {
  const errMsg =
    opts.error instanceof Error ? opts.error.message : String(opts.error);
  const jobTitle = opts.jobTitle || "Consultant";

  const skeleton: StructuredResume = opts.partial?.structured || {
    candidateName: opts.candidateName || "Candidate",
    headline: jobTitle,
    contactLine: "",
    layoutId: "consultant_band",
    sections: [],
    meta: {
      atsScore: 0,
      skillFingerprint: "",
      jobTitle,
      progressiveNotes: [`recover: ${errMsg.slice(0, 160)}`],
    },
  };

  // Prefer regenerate first on hard errors
  if (opts.regenerate) {
    try {
      const fresh = await opts.regenerate();
      return regenerateUntilAts100({
        structured: fresh.structured,
        text: fresh.text,
        ats: fresh.ats,
        psych: fresh.psych,
        jd: opts.jd,
        masterText: opts.masterText,
        jobTitle: fresh.structured.meta.jobTitle || jobTitle,
        candidateName: opts.candidateName,
        mode: opts.mode,
        masterProfileJson: opts.masterProfileJson,
        maxAttempts: 4,
        regenerate: opts.regenerate,
      });
    } catch (e) {
      // fall through to boost-only on skeleton
      const msg = e instanceof Error ? e.message : String(e);
      skeleton.meta.progressiveNotes.push(`recover regen failed: ${msg.slice(0, 100)}`);
    }
  }

  const emptyAts: AtsResult = opts.partial?.ats || {
    score: 0,
    breakdown: {
      parseSafety: 0,
      keywordCoverage: 0,
      roleMatch: 0,
      temporalIntegrity: 15,
      progressiveBalance: 10,
      recencyEmphasis: 10,
    },
    missingKeywords: [],
    warnings: [errMsg.slice(0, 200)],
    ready: false,
  };

  return regenerateUntilAts100({
    structured: skeleton,
    text: opts.partial?.text || renderPlainFromStructured(skeleton),
    ats: emptyAts,
    psych: opts.partial?.psych,
    jd: opts.jd,
    masterText: opts.masterText,
    jobTitle,
    candidateName: opts.candidateName,
    mode: opts.mode,
    masterProfileJson: opts.masterProfileJson,
    maxAttempts: 5,
    regenerate: opts.regenerate,
  });
}
