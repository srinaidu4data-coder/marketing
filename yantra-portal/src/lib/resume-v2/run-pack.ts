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
import { renderPackText, packToStructuredResume } from "./render-pack";
import { scoreResume } from "@/lib/resume/ats-scorer";
import { scorePsych } from "@/lib/resume/psych-scorer";
import { resolveTailorMode } from "@/lib/resume/tailor-mode";
import { buildFitReport } from "@/lib/resume/fit-report";
import {
  accumulatePackCraft,
  buildFitAccumulateFeedback,
  injectMissingPhrasesIntoPack,
} from "./pack-accumulate";
import { BIBLE_PROMPT } from "./bible-prompt";

/** C3 hard budgets */
export const RUN_PACK_BUDGETS = {
  /** Primary + soft/fit/surge waves (Fit loops consume budget) */
  MAX_LLM_WAVES: 5,
  /** Soft-band fire rate cap per chain (fraction of packs) */
  SOFT_FIRE_CAP: 0.25,
  /** Best-of-N samples on hard fail */
  BON_N: 2,
  /** Soft remaining time (ms) before skipping extras */
  CAND_SOFT_MS: 45_000,
  /** Absolute wall for one pack extras */
  CAND_HARD_MS: 75_000,
  /** Auto Fit repair until confidence ≥ this */
  FIT_MIN_CONFIDENCE: 80,
  /** Extra Bible-only accumulate loops when Fit < 80 */
  MAX_FIT_LOOPS: 3,
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
  /**
   * Auto Fit craft repair until craftConfidence ≥ 80 (default ON).
   * Independent of soft/BoN/fastMode — product law for stack/env/bullets/phrases.
   */
  enableFitRepair?: boolean;
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
  fitConfidence?: number;
  fitLoops?: number;
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
    fitConfidence: opts.fitConfidence,
    fitLoops: opts.fitLoops,
  };
}

function measureFit(text: string, jd: string, jobTitle?: string, layoutId?: string) {
  return buildFitReport({
    resumeText: text,
    jd,
    jobTitle,
    layoutId: layoutId || "ats_classic",
  });
}

/** Gate for auto loops — craftConfidence (not layout-capped confidence) */
function fitGateScore(fit: ReturnType<typeof buildFitReport>): number {
  return typeof fit.craftConfidence === "number"
    ? fit.craftConfidence
    : fit.confidence;
}

function shapeAndScore(
  r: GenerateV2Result,
  master: string,
  jd: string,
  rankedBank: string[],
  masterProfileJson?: string | null,
  candidateName?: string
): { result: GenerateV2Result; score: PackScoreReport } {
  const shaped = ensureShipCompatibleText(r.pack, master, rankedBank, jd);
  r.pack = shaped.pack;
  r.text = shaped.text;
  r.ats = scoreResume({
    resumeText: r.text,
    jd,
    jobTitle: r.pack.header.jobTitle,
  });
  r.psych = scorePsych({
    resumeText: r.text,
    masterText: master,
    jd,
    jobTitle: r.pack.header.jobTitle,
    mode: resolveTailorMode(jd, master).mode,
    candidateName: r.pack.header.name || candidateName,
  });
  return {
    result: r,
    score: rescore(r, master, jd, masterProfileJson, candidateName),
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
  // Fit repair is ON by default — fastMode must not silently kill it
  const enableFitRepair = opts.enableFitRepair !== false;
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

  // OpenAI/Karpathy: system = code Bible SOT (caller prompt only if it embeds product law)
  const systemPrompt = (() => {
    const p = (opts.prompt || "").trim();
    const bible = (BIBLE_PROMPT || "").trim();
    if (
      p.length > 400 &&
      /EVERY PROJECT/i.test(p) &&
      /techStack|ACCUMULATE/i.test(p)
    ) {
      return p;
    }
    return bible.length > 400 ? bible : p || bible;
  })();
  notes.push(
    systemPrompt === (BIBLE_PROMPT || "").trim()
      ? "system=code_BIBLE"
      : "system=caller_or_ACTIVE"
  );

  const genBase = {
    prompt: systemPrompt,
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
    const shaped = await ensureShipCompatibleTextAsync(best.pack, master, jd);
    // Prefer ranked bank pad: re-run sync with ranked order
    const rankedShaped = ensureShipCompatibleText(
      shaped.pack,
      master,
      rankedBank,
      jd
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

  // ── Fit craft gate ≥ 80: accumulate loops (Bible-only; independent of fastMode soft/BoN) ──
  let fit = measureFit(best.text, jd, best.pack.header.jobTitle);
  let fitLoops = 0;
  let gate = fitGateScore(fit);
  notes.push(
    `fit0 craft=${gate} display=${fit.confidence} coverage=${fit.coveragePct} missing=${fit.missing.slice(0, 8).join("|")}`
  );

  if (!enableFitRepair) {
    notes.push("fit_repair_disabled");
  }

  // Always allow Fit repair after tier0 (do not starve behind soft/BoN or tight budget).
  // First loop only needs any remaining time; later loops need ~12s.
  while (
    enableFitRepair &&
    gate < RUN_PACK_BUDGETS.FIT_MIN_CONFIDENCE &&
    fitLoops < RUN_PACK_BUDGETS.MAX_FIT_LOOPS &&
    llmWaves < RUN_PACK_BUDGETS.MAX_LLM_WAVES &&
    (fitLoops === 0
      ? remainingMs(opts.chainBudget?.deadlineMs) > 0 ||
        !opts.chainBudget?.deadlineMs
      : remainingMs(opts.chainBudget?.deadlineMs) >= 12_000 ||
        !opts.chainBudget?.deadlineMs)
  ) {
    fitLoops += 1;
    llmWaves += 1;
    await opts.onPhase?.("run-pack-tier1", "active");
    const missingReqs = fit.requirements
      .filter(
        (r) =>
          !r.present &&
          (r.kind === "phrase" ||
            r.kind === "keyword" ||
            r.kind === "title" ||
            r.kind === "structure")
      )
      .map((r) => ({ kind: r.kind, label: r.label }));
    const feedback = buildFitAccumulateFeedback({
      fitConfidence: gate,
      missing: fit.missing,
      missingRequirements: missingReqs,
      loop: fitLoops,
      maxLoops: RUN_PACK_BUDGETS.MAX_FIT_LOOPS,
    });
    // Prefer stronger model on fit repair when available (same Bible)
    let fitProvider = opts.llmProvider;
    try {
      const { getActiveLlmConfig } = await import("@/lib/system-settings");
      const cfg = await getActiveLlmConfig(opts.llmProvider || null);
      if (cfg.anthropic?.configured && (cfg.provider === "openai" || !opts.llmProvider)) {
        fitProvider = "anthropic";
      }
    } catch {
      /* keep */
    }

    const prior = JSON.stringify(best.pack).slice(0, 16000);
    const loopGen = await generateResumeV2({
      ...genBase,
      llmProvider: fitProvider,
      // Always Bible system from genBase.prompt (caller must pass code Bible)
      feedback,
      priorJson: prior,
      temperature: 0.35 + fitLoops * 0.05,
      onPhase: async (phase, status) => {
        await opts.onPhase?.(phase, status);
      },
    });
    tokensIn += loopGen.tokensIn || 0;
    tokensOut += loopGen.tokensOut || 0;

    if (loopGen.pack?.projects?.length) {
      // Accrue: merge new craft onto existing (stack/bullets/skills grow)
      const merged = accumulatePackCraft(best.pack, loopGen.pack);
      loopGen.pack = merged;
      const shaped = shapeAndScore(
        loopGen,
        master,
        jd,
        rankedBank,
        opts.masterProfileJson,
        opts.candidateName
      );
      const nextFit = measureFit(
        shaped.result.text,
        jd,
        shaped.result.pack.header.jobTitle
      );
      const nextGate = fitGateScore(nextFit);
      notes.push(
        `fit${fitLoops} craft ${gate}→${nextGate} display=${nextFit.confidence} phrasesMissing=${nextFit.missing.slice(0, 4).join("|")}`
      );
      // Always keep accumulate merge (points accrue); adopt if gate improved or equal
      best = shaped.result;
      score = shaped.score;
      fit = nextFit;
      gate = nextGate;
      path = "tier1";
    } else {
      notes.push(`fit${fitLoops}_empty_response`);
    }
    await opts.onPhase?.("run-pack-tier1", "done");
  }

  // Deterministic phrase inject (wiring guarantee) then re-measure craft gate
  if (enableFitRepair && gate < RUN_PACK_BUDGETS.FIT_MIN_CONFIDENCE) {
    const beforeInject = gate;
    const injected = injectMissingPhrasesIntoPack(
      best.pack,
      fit.missing.slice(0, 20)
    );
    const re = shapeAndScore(
      { ...best, pack: injected },
      master,
      jd,
      rankedBank,
      opts.masterProfileJson,
      opts.candidateName
    );
    best = re.result;
    score = re.score;
    fit = measureFit(best.text, jd, best.pack.header.jobTitle);
    gate = fitGateScore(fit);
    notes.push(
      `phrase_inject craft ${beforeInject}→${gate} missingLeft=${fit.missing.slice(0, 5).join("|")}`
    );
  }

  if (gate < RUN_PACK_BUDGETS.FIT_MIN_CONFIDENCE) {
    notes.push(
      `fit_below_target craft=${gate} display=${fit.confidence} need=${RUN_PACK_BUDGETS.FIT_MIN_CONFIDENCE}`
    );
  } else {
    notes.push(`fit_ok craft=${gate} display=${fit.confidence}`);
  }

  // ── Soft regen: NEVER replace Fit accumulate — merge only ───────────
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
    if (soft.pack?.projects?.length) {
      // Accrue onto best — soft must not wipe Fit stack/bullets
      soft.pack = accumulatePackCraft(best.pack, soft.pack);
      const shaped = shapeAndScore(
        soft,
        master,
        jd,
        rankedBank,
        opts.masterProfileJson,
        opts.candidateName
      );
      notes.push(
        `soft_merge band=${shaped.score.band} ATS=${shaped.score.ats.score} rank=${shaped.score.rankScore.toFixed(1)}`
      );
      best = shaped.result;
      score = shaped.score;
      path = "tier1";
      fit = measureFit(best.text, jd, best.pack.header.jobTitle);
      gate = fitGateScore(fit);
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
      const shaped = ensureShipCompatibleText(s.pack, master, rankedBank, jd);
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
      // Accrue onto current best, then pick by rank — never drop Fit stack
      const mergedPack = accumulatePackCraft(best.pack, s.pack);
      s.pack = mergedPack;
      const reshaped = shapeAndScore(
        s,
        master,
        jd,
        rankedBank,
        opts.masterProfileJson,
        opts.candidateName
      );
      const better =
        (!reshaped.score.hardFail && score.hardFail) ||
        (reshaped.score.hardFail === score.hardFail &&
          reshaped.score.rankScore > score.rankScore) ||
        (reshaped.score.ok && !score.ok) ||
        reshaped.score.rankScore >= score.rankScore;
      if (better) {
        best = reshaped.result;
        score = reshaped.score;
        path = "tier2";
        fit = measureFit(best.text, jd, best.pack.header.jobTitle);
        gate = fitGateScore(fit);
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
      const shaped = ensureShipCompatibleText(forced.pack, master, rankedBank, jd);
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
  if (gate < RUN_PACK_BUDGETS.FIT_MIN_CONFIDENCE) quality = "weak";
  if (score.ok && path !== "force" && gate >= RUN_PACK_BUDGETS.FIT_MIN_CONFIDENCE) {
    quality = "ok";
  }

  // Stamp scores onto result
  best.ats = score.ats;
  best.psych = score.psych;
  best.tokensIn = tokensIn;
  best.tokensOut = tokensOut;
  best.ok = !!(best.text && best.text.length > 200 && best.pack.projects.length);
  best.pack.meta = {
    ...(best.pack.meta || {}),
    notes: [...(best.pack.meta?.notes || []), ...notes].slice(0, 24),
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
    fitConfidence: gate,
    fitLoops,
  });

  // progressive notes for UI
  try {
    best.structured = packToStructuredResume(best.pack);
    best.structured.meta.atsScore = score.ats.score;
    best.structured.meta.psychScore = score.psych.score;
    best.structured.meta.progressiveNotes = [
      `runPack path=${generationMeta.pathLabel} cost=${generationMeta.costUsd.toFixed(4)} waves=${llmWaves}`,
      `Fit craft=${gate} display=${fit.confidence} loops=${fitLoops} (target ≥${RUN_PACK_BUDGETS.FIT_MIN_CONFIDENCE})`,
      `retrieve=${light.retrieveMode} slots=${light.slotCount} fitRepair=${enableFitRepair ? "on" : "off"}`,
      `band=${score.band} quality=${quality}`,
      ...notes.slice(0, 10),
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
