/**
 * Adaptive-cost single entry (C0–C4):
 * buildContext → generatePack → scorePack → tier1 soft / tier2 BoN → ship-shape
 *
 * Budgets (C3): max LLM call waves, soft fire cap, BoN N, mutual exclusion with force.
 */

import { estimateLlmCostUsd } from "@/lib/resume/llm-config";
import type { LlmProvider } from "@/lib/resume/llm-config";
import {
  getSkillNeutralBulletBank,
  formatBulletBankForPrompt,
} from "@/lib/resume/skill-neutral-bullet-bank";
import { generateResumeV2, type GenerateV2Result } from "./generate";
import { forceGenerateUnrestricted } from "./force-generate";
import {
  ensureShipCompatibleTextAsync,
  ensureShipCompatibleText,
} from "./ensure-ship-shape";
import { buildLightContext } from "./light-retrieve";
import {
  scorePack,
  feedbackFromScore,
  type PackScoreReport,
} from "./score-pack";
import {
  pathLabel,
  type GenerationMeta,
  type GenerationPath,
  type GenerationQuality,
} from "./generation-meta";
import { renderPackText } from "./render-pack";
import { scoreResume } from "@/lib/resume/ats-scorer";
import { scorePsych } from "@/lib/resume/psych-scorer";
import { resolveTailorMode } from "@/lib/resume/tailor-mode";

/** C3 hard budgets */
export const RUN_PACK_BUDGETS = {
  /** Primary + at most one soft regen OR one BoN wave (parallel counts as one wave) */
  MAX_LLM_WAVES: 3,
  /** Soft-band fire rate cap per chain (fraction of packs) */
  SOFT_FIRE_CAP: 0.25,
  /** Best-of-N samples on hard fail */
  BON_N: 2,
  /** Soft remaining time (ms) before skipping extras */
  CAND_SOFT_MS: 45_000,
  /** Absolute wall for one pack extras */
  CAND_HARD_MS: 75_000,
} as const;

export type RunPackChainBudget = {
  /** Chain generation deadline (epoch ms) */
  deadlineMs?: number;
  /** Packs already started in this chain */
  packsStarted?: number;
  /** Soft-band (tier1) fires so far */
  softFires?: number;
  /** Surge (tier2) fires so far */
  surgeFires?: number;
};

export type RunPackResult = GenerateV2Result & {
  generationMeta: GenerationMeta;
  score: PackScoreReport;
  rankedBank: string[];
};

export type RunPackOptions = {
  prompt: string;
  master: string;
  jd: string;
  promptVersionId?: string;
  llmProvider?: LlmProvider | null;
  candidateName?: string;
  email?: string;
  phone?: string;
  masterProfileJson?: string | null;
  /** Feature flags */
  enableRetrieve?: boolean;
  enableSoftRegen?: boolean;
  enableBon?: boolean;
  chainBudget?: RunPackChainBudget;
  onPhase?: (
    phase:
      | "resume-v2-llm"
      | "resume-v2-schema"
      | "resume-v2-repair"
      | "resume-v2-score"
      | "resume-v2-regen"
      | "run-pack-tier0"
      | "run-pack-tier1"
      | "run-pack-tier2"
      | "run-pack-force",
    status: "active" | "done" | "error"
  ) => void | Promise<void>;
};

function remainingMs(deadline?: number): number {
  if (!deadline) return Number.POSITIVE_INFINITY;
  return deadline - Date.now();
}

function canSpend(
  chain: RunPackChainBudget | undefined,
  kind: "soft" | "surge"
): boolean {
  const rem = remainingMs(chain?.deadlineMs);
  if (rem < RUN_PACK_BUDGETS.CAND_SOFT_MS) return false;
  if (kind === "soft") {
    const started = Math.max(1, chain?.packsStarted ?? 1);
    const fires = chain?.softFires ?? 0;
    const cap = Math.max(1, Math.ceil(started * RUN_PACK_BUDGETS.SOFT_FIRE_CAP));
    if (fires >= cap) return false;
  }
  return true;
}

function buildMeta(opts: {
  path: GenerationPath;
  quality: GenerationQuality;
  tokensIn: number;
  tokensOut: number;
  model: string;
  provider: string;
  llmCalls: number;
  score: PackScoreReport;
  retrieveUsed: boolean;
  retrieveMode: GenerationMeta["retrieveMode"];
  bonN: number;
  notes: string[];
}): GenerationMeta {
  const costUsd = estimateLlmCostUsd(
    opts.tokensIn,
    opts.tokensOut,
    opts.model,
    (opts.provider as "openai" | "anthropic") || undefined
  );
  return {
    path: opts.path,
    pathLabel: pathLabel(opts.path),
    quality: opts.quality,
    costUsd,
    tokensIn: opts.tokensIn,
    tokensOut: opts.tokensOut,
    llmCalls: opts.llmCalls,
    softBand: opts.score.softBand,
    hardFail: opts.score.hardFail,
    retrieveUsed: opts.retrieveUsed,
    retrieveMode: opts.retrieveMode,
    bonN: opts.bonN,
    residueFail: opts.score.residueFail,
    notes: opts.notes,
    at: new Date().toISOString(),
  };
}

function rescore(
  r: GenerateV2Result,
  master: string,
  jd: string,
  masterProfileJson?: string | null,
  candidateName?: string
): PackScoreReport {
  return scorePack({
    text: r.text,
    jd,
    masterText: master,
    masterProfileJson,
    candidateName,
    pack: r.pack,
    ats: r.ats,
    psych: r.psych,
    jobTitle: r.pack.header.jobTitle,
  });
}

/**
 * Single adaptive entry for production packs.
 */
export async function runPack(opts: RunPackOptions): Promise<RunPackResult> {
  const enableRetrieve = opts.enableRetrieve !== false;
  const enableSoft = opts.enableSoftRegen !== false;
  const enableBon = opts.enableBon !== false;
  const master = (opts.master || "").trim() || "Professional experience.";
  const jd =
    (opts.jd || "").trim() ||
    "Professional consulting role tailored from master experience.";

  let bank: string[] = [];
  try {
    bank = await getSkillNeutralBulletBank();
  } catch {
    bank = [];
  }

  const light = enableRetrieve
    ? buildLightContext({
        masterText: master,
        jd,
        masterProfileJson: opts.masterProfileJson,
        bank,
      })
    : {
        evidenceBlock: "",
        rankedBank: bank.slice(0, 40),
        retrieveUsed: false,
        retrieveMode: "full_master" as const,
        slotCount: 0,
      };

  const rankedBank = light.rankedBank.length ? light.rankedBank : bank;
  const bankBlock = formatBulletBankForPrompt(
    rankedBank.length ? rankedBank : bank,
    40
  );

  let tokensIn = 0;
  let tokensOut = 0;
  let llmWaves = 0;
  const notes: string[] = [];

  const genBase = {
    prompt: opts.prompt,
    master,
    jd,
    promptVersionId: opts.promptVersionId,
    llmProvider: opts.llmProvider,
    candidateName: opts.candidateName,
    email: opts.email,
    phone: opts.phone,
    evidenceBlock: light.evidenceBlock || undefined,
    bulletBankBlock: bankBlock || undefined,
  };

  // ── Tier 0 ─────────────────────────────────────────────────────────
  await opts.onPhase?.("run-pack-tier0", "active");
  llmWaves += 1;
  let best = await generateResumeV2({
    ...genBase,
    onPhase: async (phase, status) => {
      await opts.onPhase?.(phase, status);
    },
  });
  tokensIn += best.tokensIn;
  tokensOut += best.tokensOut;

  // Ship-shape with ranked bank
  {
    const shaped = await ensureShipCompatibleTextAsync(best.pack, master);
    // Prefer ranked bank pad: re-run sync with ranked order
    const rankedShaped = ensureShipCompatibleText(
      shaped.pack,
      master,
      rankedBank
    );
    best.pack = rankedShaped.pack;
    best.text = rankedShaped.text;
    best.ats = scoreResume({
      resumeText: best.text,
      jd,
      jobTitle: best.pack.header.jobTitle,
    });
    best.psych = scorePsych({
      resumeText: best.text,
      masterText: master,
      jd,
      jobTitle: best.pack.header.jobTitle,
      mode: resolveTailorMode(jd, master).mode,
      candidateName: best.pack.header.name || opts.candidateName,
    });
  }

  let score = rescore(
    best,
    master,
    jd,
    opts.masterProfileJson,
    opts.candidateName
  );
  notes.push(`tier0 band=${score.band} ATS=${score.ats.score} Psych=${score.psych.score}`);
  await opts.onPhase?.("run-pack-tier0", "done");

  let path: GenerationPath = "tier0";
  let bonN = 0;

  // ── Tier 1 soft (one constrained regen) ────────────────────────────
  if (
    score.softBand &&
    !score.hardFail &&
    enableSoft &&
    llmWaves < RUN_PACK_BUDGETS.MAX_LLM_WAVES &&
    canSpend(opts.chainBudget, "soft")
  ) {
    await opts.onPhase?.("run-pack-tier1", "active");
    llmWaves += 1;
    if (opts.chainBudget) {
      opts.chainBudget.softFires = (opts.chainBudget.softFires || 0) + 1;
    }
    const feedback = feedbackFromScore(score);
    const soft = await generateResumeV2({
      ...genBase,
      feedback,
      priorJson: JSON.stringify(best.pack).slice(0, 14000),
      onPhase: async (phase, status) => {
        await opts.onPhase?.(phase, status);
      },
    });
    tokensIn += soft.tokensIn;
    tokensOut += soft.tokensOut;
    const shaped = ensureShipCompatibleText(soft.pack, master, rankedBank);
    soft.pack = shaped.pack;
    soft.text = shaped.text;
    soft.ats = scoreResume({
      resumeText: soft.text,
      jd,
      jobTitle: soft.pack.header.jobTitle,
    });
    soft.psych = scorePsych({
      resumeText: soft.text,
      masterText: master,
      jd,
      jobTitle: soft.pack.header.jobTitle,
      mode: resolveTailorMode(jd, master).mode,
      candidateName: soft.pack.header.name || opts.candidateName,
    });
    const softScore = rescore(
      soft,
      master,
      jd,
      opts.masterProfileJson,
      opts.candidateName
    );
    notes.push(
      `tier1 band=${softScore.band} ATS=${softScore.ats.score} rank=${softScore.rankScore.toFixed(1)}`
    );
    if (
      softScore.rankScore > score.rankScore ||
      (softScore.ok && !score.ok) ||
      (!softScore.hardFail && score.hardFail)
    ) {
      best = soft;
      score = softScore;
      path = "tier1";
    }
    await opts.onPhase?.("run-pack-tier1", "done");
  } else if (score.softBand) {
    notes.push("tier1_skipped_budget_or_cap");
  }

  // ── Tier 2 hard fail → BoN (parallel N) ─────────────────────────────
  // Re-score path may still be hard after soft, or started hard
  if (
    score.hardFail &&
    enableBon &&
    llmWaves < RUN_PACK_BUDGETS.MAX_LLM_WAVES &&
    canSpend(opts.chainBudget, "surge") &&
    remainingMs(opts.chainBudget?.deadlineMs) >= RUN_PACK_BUDGETS.CAND_SOFT_MS
  ) {
    await opts.onPhase?.("run-pack-tier2", "active");
    llmWaves += 1;
    bonN = RUN_PACK_BUDGETS.BON_N;
    if (opts.chainBudget) {
      opts.chainBudget.surgeFires = (opts.chainBudget.surgeFires || 0) + 1;
    }
    const feedback = feedbackFromScore(score);
    const temps = [0.35, 0.55].slice(0, bonN);
    const samples = await Promise.all(
      temps.map((temperature, i) =>
        generateResumeV2({
          ...genBase,
          feedback: `${feedback}\nBoN sample ${i + 1}/${bonN}`,
          priorJson: JSON.stringify(best.pack).slice(0, 10000),
          temperature,
          onPhase: async () => {
            /* suppress multi noise */
          },
        }).catch((e) => {
          const empty = best;
          return {
            ...empty,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            tokensIn: 0,
            tokensOut: 0,
          } as GenerateV2Result;
        })
      )
    );

    for (const s of samples) {
      tokensIn += s.tokensIn || 0;
      tokensOut += s.tokensOut || 0;
      if (!(s.text || "").trim() || !s.pack?.projects?.length) continue;
      const shaped = ensureShipCompatibleText(s.pack, master, rankedBank);
      s.pack = shaped.pack;
      s.text = shaped.text;
      s.ats = scoreResume({
        resumeText: s.text,
        jd,
        jobTitle: s.pack.header.jobTitle,
      });
      s.psych = scorePsych({
        resumeText: s.text,
        masterText: master,
        jd,
        jobTitle: s.pack.header.jobTitle,
        mode: resolveTailorMode(jd, master).mode,
        candidateName: s.pack.header.name || opts.candidateName,
      });
      const sc = rescore(
        s,
        master,
        jd,
        opts.masterProfileJson,
        opts.candidateName
      );
      // Lexicographic: prefer non-hard, then rankScore
      const better =
        (!sc.hardFail && score.hardFail) ||
        (sc.hardFail === score.hardFail && sc.rankScore > score.rankScore) ||
        (sc.ok && !score.ok);
      if (better) {
        best = s;
        score = sc;
        path = "tier2";
      }
    }
    notes.push(
      `tier2 BoN=${bonN} best band=${score.band} ATS=${score.ats.score} rank=${score.rankScore.toFixed(1)}`
    );
    await opts.onPhase?.("run-pack-tier2", "done");
  } else if (score.hardFail) {
    notes.push("tier2_skipped_budget_or_disabled");
  }

  // ── Force if still unusable (mutually exclusive with more BoN) ──────
  let quality: GenerationQuality = score.hardFail || !best.text || best.text.length < 200
    ? "weak"
    : "ok";

  if (
    (!(best.text || "").trim() ||
      best.text.length < 200 ||
      !best.pack?.projects?.length) &&
    llmWaves < RUN_PACK_BUDGETS.MAX_LLM_WAVES + 1
  ) {
    await opts.onPhase?.("run-pack-force", "active");
    try {
      const forced = await forceGenerateUnrestricted({
        master,
        jd,
        candidateName: opts.candidateName,
        email: opts.email,
        llmProvider: opts.llmProvider,
        promptHint: opts.prompt,
      });
      tokensIn += forced.tokensIn || 0;
      tokensOut += forced.tokensOut || 0;
      const shaped = ensureShipCompatibleText(forced.pack, master, rankedBank);
      forced.pack = shaped.pack;
      forced.text = shaped.text;
      best = forced;
      score = rescore(
        best,
        master,
        jd,
        opts.masterProfileJson,
        opts.candidateName
      );
      path = "force";
      quality = "weak";
      notes.push("force_unrestricted");
    } catch (e) {
      notes.push(
        `force_failed:${e instanceof Error ? e.message : String(e)}`
      );
      quality = "weak";
    }
    await opts.onPhase?.("run-pack-force", "done");
  }

  if (score.hardFail) quality = "weak";
  if (score.ok && path !== "force") quality = "ok";

  // Stamp scores onto result
  best.ats = score.ats;
  best.psych = score.psych;
  best.tokensIn = tokensIn;
  best.tokensOut = tokensOut;
  best.ok = !!(best.text && best.text.length > 200 && best.pack.projects.length);
  best.pack.meta = {
    ...(best.pack.meta || {}),
    notes: [...(best.pack.meta?.notes || []), ...notes].slice(0, 20),
  };

  const generationMeta = buildMeta({
    path,
    quality,
    tokensIn,
    tokensOut,
    model: best.model,
    provider: best.provider,
    llmCalls: llmWaves,
    score,
    retrieveUsed: light.retrieveUsed,
    retrieveMode: light.retrieveMode,
    bonN,
    notes,
  });

  // progressive notes for UI
  try {
    const { packToStructuredResume } = await import("./render-pack");
    best.structured = packToStructuredResume(best.pack);
    best.structured.meta.atsScore = score.ats.score;
    best.structured.meta.psychScore = score.psych.score;
    best.structured.meta.progressiveNotes = [
      `runPack path=${generationMeta.pathLabel} cost=${generationMeta.costUsd.toFixed(4)} waves=${llmWaves}`,
      `retrieve=${light.retrieveMode} slots=${light.slotCount}`,
      `band=${score.band} quality=${quality}`,
      ...notes.slice(0, 8),
      ...score.reasons.slice(0, 4),
    ];
    best.text = best.text || renderPackText(best.pack);
  } catch {
    /* keep */
  }

  return {
    ...best,
    generationMeta,
    score,
    rankedBank,
  };
}
