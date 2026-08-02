/**
 * Resume tailor — production entrypoint with admin-sequenced engines.
 *
 * Default sequence: ai-tailor → progressive-rules (backup).
 * Admin Console → Settings → Resume engine sequence.
 */

import { prisma } from "./db";
import { DEFAULT_PROMPT } from "./constants";
import { generateResumeWithOpenAi } from "./resume/ai-tailor";
import { getOpenAiConfig } from "./resume/openai-config";
import { assembleDeterministicPack } from "./resume/assemble-pack";
import {
  getResumeEngineSequence,
  type ResumeEngineId,
} from "./system-settings";
import type { AtsResult } from "./resume/ats-scorer";
import type { PsychResult } from "./resume/psych-scorer";
import type { StructuredResume } from "./resume/templates";
import type { RulesGateResult } from "./resume/rules-gate";
import {
  validatePackAgainstMaster,
  type PackValidationReport,
} from "./resume/master-pack-validate";
import { parseStoredMasterProfile } from "./resume/master-profile";
import { inspectPackShipReady } from "./resume/pack-ship-ready";
import type { TailorModeResult } from "./resume/tailor-mode";

export { renderEmailTemplate } from "./resume/email-render";
export { getOpenAiConfig } from "./resume/openai-config";
export { LAYOUT_CONFIGS, getLayoutConfig } from "./resume/layout-config";
export { RESUME_LAYOUTS, getLayout, layoutForIndex } from "./resume/templates";

export type TailorResumeResult = {
  structured: StructuredResume;
  text: string;
  ats: AtsResult;
  psych?: PsychResult;
  modeResult?: TailorModeResult;
  usedLlm: boolean;
  model: string;
  engine: ResumeEngineId;
  enginesTried: { engine: ResumeEngineId; ok: boolean; error?: string }[];
  rulesGate?: RulesGateResult;
  matchGate?: { pass: boolean; reasons: string[] };
  passes?: number;
  tokensIn?: number;
  tokensOut?: number;
  /** Full ground-truth checklist vs master (every employer/date/etc.) */
  packValidation?: PackValidationReport;
  /** Dual 100 = best pack */
  best?: boolean;
};

async function attachPackValidation(
  result: Omit<TailorResumeResult, "packValidation" | "best">,
  opts: {
    masterProfileJson?: string | null;
    master: string;
    jd: string;
    candidateName?: string;
    /** Optional full re-generate for until-100 module */
    regenerate?: () => Promise<{
      structured: StructuredResume;
      text: string;
      ats: AtsResult;
      psych?: PsychResult;
    }>;
  }
): Promise<TailorResumeResult> {
  let pack = result;

  // Always run regenerate-until-100 when ATS < 100 (or missing)
  if ((pack.ats?.score ?? 0) < 100 && pack.structured) {
    try {
      const { regenerateUntilAts100 } = await import(
        "./resume/regenerate-until-100"
      );
      const regen = await regenerateUntilAts100({
        structured: pack.structured,
        text: pack.text,
        ats: pack.ats,
        psych: pack.psych,
        jd: opts.jd,
        masterText: opts.master,
        jobTitle: pack.structured.meta.jobTitle || "",
        candidateName: opts.candidateName,
        mode: pack.modeResult?.mode,
        masterProfileJson: opts.masterProfileJson,
        maxAttempts: 5,
        regenerate: opts.regenerate,
      });
      pack = {
        ...pack,
        text: regen.text,
        structured: regen.structured,
        ats: regen.ats,
        psych: regen.psych || pack.psych,
      };
      pack.structured.meta.progressiveNotes = [
        ...(pack.structured.meta.progressiveNotes || []),
        `regenerate-until-100: ${regen.reached100 ? "ATS 100" : `final ${regen.ats.score}`} · ${regen.attempts} attempts`,
        ...regen.history.slice(-6).map((h) => `regen: ${h}`),
      ];
    } catch {
      /* keep original pack */
    }
  }

  // Ship authority: structural + ATS ≥ 95. BEST badge = dual 100.
  const ship = inspectPackShipReady({
    text: pack.text,
    masterText: opts.master,
    masterProfileJson: opts.masterProfileJson,
    jd: opts.jd,
    candidateName: opts.candidateName,
    ats: pack.ats,
    psych: pack.psych,
    mode: pack.modeResult?.mode,
  });
  if (!ship.ok) {
    // One more forced regen on ship failure
    try {
      const { regenerateUntilAts100 } = await import(
        "./resume/regenerate-until-100"
      );
      const regen = await regenerateUntilAts100({
        structured: pack.structured,
        text: pack.text,
        ats: pack.ats,
        psych: pack.psych,
        jd: opts.jd,
        masterText: opts.master,
        jobTitle: pack.structured.meta.jobTitle || "",
        candidateName: opts.candidateName,
        mode: pack.modeResult?.mode,
        masterProfileJson: opts.masterProfileJson,
        maxAttempts: 4,
        regenerate: opts.regenerate,
      });
      pack = {
        ...pack,
        text: regen.text,
        structured: regen.structured,
        ats: regen.ats,
        psych: regen.psych || pack.psych,
      };
      const ship2 = inspectPackShipReady({
        text: pack.text,
        masterText: opts.master,
        masterProfileJson: opts.masterProfileJson,
        jd: opts.jd,
        candidateName: opts.candidateName,
        ats: pack.ats,
        psych: pack.psych,
        mode: pack.modeResult?.mode,
      });
      if (ship2.ok) {
        pack.structured.meta.progressiveNotes = [
          ...(pack.structured.meta.progressiveNotes || []),
          `ship-recovery: OK after regen · ATS ${pack.ats.score}`,
        ];
        return finalizePack(pack, ship2, opts);
      }
    } catch {
      /* fall through */
    }

    const hard = ship.issues.filter(
      (i) =>
        !(i.code === "ats_below" && /ship OK/i.test(i.detail)) &&
        !(i.code === "psych_below" && /BEST badge/i.test(i.detail))
    );
    const details = (hard.length ? hard : ship.issues).map((i) => i.detail);
    throw new Error(
      `Resume generation blocked: ${details.join("; ")}. Full resume was not generated.`
    );
  }

  return finalizePack(pack, ship, opts);
}

function finalizePack(
  pack: Omit<TailorResumeResult, "packValidation" | "best">,
  ship: ReturnType<typeof inspectPackShipReady>,
  opts: {
    masterProfileJson?: string | null;
    master: string;
    jd: string;
    candidateName?: string;
  }
): TailorResumeResult {
  const profile = parseStoredMasterProfile(opts.masterProfileJson);
  const starts =
    profile?.engagements.map((e) => e.startYear).filter((y) => y >= 1980) ||
    [];
  const span = starts.length
    ? new Date().getFullYear() - Math.min(...starts)
    : 0;
  const packValidation = validatePackAgainstMaster({
    masterProfileJson: opts.masterProfileJson,
    masterText: opts.master,
    tailoredText: pack.text,
    expectedYears: span,
  });

  const psych = pack.psych || ship.psych;
  const ats = pack.ats || ship.ats;
  pack.structured.meta.psychScore = psych?.score;
  pack.structured.meta.atsScore = ats?.score ?? pack.ats.score;
  pack.structured.meta.progressiveNotes = [
    ...pack.structured.meta.progressiveNotes,
    `Ground-truth: ${packValidation.ok ? "PASS" : "REVIEW"} ${packValidation.score}% · clients ${packValidation.clientsFound.length}/${packValidation.engagementCount}`,
    `Dual scores: ATS ${ats?.score ?? "?"}/100 · Psych ${psych?.score ?? "?"}/100 · ${ship.best ? "BEST" : "SHIP OK"}`,
    `Ship-ready: OK · mode ${ship.mode || "?"} · min bullets ${ship.minBulletsSeen ?? "?"}`,
  ];
  return {
    ...pack,
    psych: psych || pack.psych,
    packValidation,
    best: ship.best || (ats?.score === 100 && (psych?.score ?? 0) === 100),
  };
}

export async function tailorResume(opts: {
  master: string;
  jd: string;
  vendorName: string;
  candidateName: string;
  employeeId?: string;
  isTestMode?: boolean;
  layoutId?: string | null;
  email?: string;
  /** Structured master profile from parse-on-upload */
  masterProfileJson?: string | null;
  onStep?: (
    stepId: string,
    status: "active" | "done" | "error"
  ) => void | Promise<void>;
  /** Override admin sequence for tests */
  engineSequence?: ResumeEngineId[];
}): Promise<TailorResumeResult> {
  let promptId = "default";
  let promptTemplate = DEFAULT_PROMPT;
  try {
    const active = await prisma.promptVersion.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (active && (active.content || "").trim().length > 400) {
      promptTemplate = active.content;
      promptId = active.id;
    }
  } catch {
    // Offline / misconfigured DB — still allow generation with DEFAULT_PROMPT
  }

  let sequence: ResumeEngineId[] =
    opts.engineSequence && opts.engineSequence.length
      ? opts.engineSequence
      : ["ai-tailor", "progressive-rules"];
  if (!opts.engineSequence?.length) {
    try {
      sequence = await getResumeEngineSequence();
    } catch {
      /* keep default sequence */
    }
  }

  const enginesTried: TailorResumeResult["enginesTried"] = [];
  let lastError: Error | null = null;

  for (const engine of sequence) {
    try {
      if (engine === "ai-tailor") {
        const openai = getOpenAiConfig();
        if (!openai.configured) {
          enginesTried.push({
            engine,
            ok: false,
            error: openai.reason || "OPENAI_API_KEY not configured",
          });
          continue;
        }
        const result = await generateResumeWithOpenAi({
          promptTemplate,
          master: opts.master,
          jd: opts.jd,
          vendorName: opts.vendorName,
          candidateName: opts.candidateName,
          layoutId: opts.layoutId,
          email: opts.email,
          masterProfileJson: opts.masterProfileJson,
          onStep: opts.onStep,
        });

        try {
          await prisma.apiUsageLog.create({
            data: {
              employeeId: opts.employeeId || null,
              operation: opts.isTestMode
                ? "prompt_test_openai"
                : result.rulesGate.pass
                  ? "resume_tailor_openai"
                  : "resume_tailor_openai_review",
              tokensIn: result.tokensIn,
              tokensOut: result.tokensOut,
              costUsd: estimateCost(
                result.tokensIn,
                result.tokensOut,
                result.model
              ),
              isTestMode: !!opts.isTestMode,
            },
          });
        } catch {
          /* offline test without DB */
        }

        result.structured.meta.progressiveNotes = [
          ...result.structured.meta.progressiveNotes,
          `Engine: ai-tailor (primary path)`,
          `Sequence: ${sequence.join(" → ")}`,
          `Prompt: ${promptId.slice(0, 12)}`,
        ];

        enginesTried.push({ engine, ok: true });
        const regenOpenAi = async () => {
          const again = await generateResumeWithOpenAi({
            promptTemplate,
            master: opts.master,
            jd: opts.jd,
            vendorName: opts.vendorName,
            candidateName: opts.candidateName,
            layoutId: opts.layoutId,
            email: opts.email,
            masterProfileJson: opts.masterProfileJson,
          });
          return {
            structured: again.structured,
            text: again.text,
            ats: again.ats,
            psych: again.psych,
          };
        };
        return await attachPackValidation(
          {
            structured: result.structured,
            text: result.text,
            ats: result.ats,
            psych: result.psych,
            modeResult: result.modeResult,
            usedLlm: true,
            model: result.model,
            engine: "ai-tailor",
            enginesTried,
            rulesGate: result.rulesGate,
            matchGate: result.matchGate,
            passes: result.passes,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
          },
          {
            masterProfileJson: opts.masterProfileJson,
            master: opts.master,
            jd: opts.jd,
            candidateName: opts.candidateName,
            regenerate: regenOpenAi,
          }
        );
      }

      if (engine === "progressive-rules") {
        await opts.onStep?.("summary", "active");
        const pack = await assembleDeterministicPack({
          master: opts.master,
          jd: opts.jd,
          vendorName: opts.vendorName,
          candidateName: opts.candidateName,
          layoutId: opts.layoutId,
          email: opts.email,
          masterProfileJson: opts.masterProfileJson,
        });
        await opts.onStep?.("summary", "done");
        await opts.onStep?.("projects_all", "done");
        await opts.onStep?.("layout", "done");
        await opts.onStep?.("rules", "done");

        pack.structured.meta.progressiveNotes = [
          ...pack.structured.meta.progressiveNotes,
          `Engine: progressive-rules (backup / rules engine)`,
          `Sequence: ${sequence.join(" → ")}`,
          `Fell through after: ${enginesTried.map((e) => e.engine).join(", ") || "none"}`,
        ];

        try {
          await prisma.apiUsageLog.create({
            data: {
              employeeId: opts.employeeId || null,
              operation: opts.isTestMode
                ? "prompt_test_rules"
                : "resume_tailor_rules_backup",
              tokensIn: 0,
              tokensOut: 0,
              costUsd: 0,
              isTestMode: !!opts.isTestMode,
            },
          });
        } catch {
          /* offline */
        }

        enginesTried.push({ engine, ok: true });
        const regenRules = async () => {
          const again = await assembleDeterministicPack({
            master: opts.master,
            jd: opts.jd,
            vendorName: opts.vendorName,
            candidateName: opts.candidateName,
            layoutId: opts.layoutId,
            email: opts.email,
            masterProfileJson: opts.masterProfileJson,
          });
          return {
            structured: again.structured,
            text: again.text,
            ats: again.ats,
            psych: again.psych,
          };
        };
        return await attachPackValidation(
          {
            structured: pack.structured,
            text: pack.text,
            ats: pack.ats,
            psych: pack.psych,
            modeResult: pack.modeResult,
            usedLlm: false,
            model: "rules-engine",
            engine: "progressive-rules",
            enginesTried,
            matchGate: {
              pass: !!(pack.ats?.score === 100 && pack.psych?.score === 100),
              reasons: [],
            },
            passes: 1,
            tokensIn: 0,
            tokensOut: 0,
          },
          {
            masterProfileJson: opts.masterProfileJson,
            master: opts.master,
            jd: opts.jd,
            candidateName: opts.candidateName,
            regenerate: regenRules,
          }
        );
      }

      enginesTried.push({
        engine,
        ok: false,
        error: `Unknown engine: ${engine}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      enginesTried.push({ engine, ok: false, error: msg });
      lastError = e instanceof Error ? e : new Error(msg);
      // try next engine in sequence
    }
  }

  // Final recovery: regenerate-until-100 module after all engines failed
  const detail = enginesTried
    .map((e) => `${e.engine}: ${e.ok ? "ok" : e.error || "fail"}`)
    .join(" | ");
  try {
    const { recoverFromGenerationError } = await import(
      "./resume/regenerate-until-100"
    );
    const openai = getOpenAiConfig();
    const regen = await recoverFromGenerationError({
      error: lastError || new Error(detail),
      jd: opts.jd,
      masterText: opts.master,
      jobTitle: "",
      candidateName: opts.candidateName,
      masterProfileJson: opts.masterProfileJson,
      mode: "transfer",
      regenerate: openai.configured
        ? async () => {
            const again = await generateResumeWithOpenAi({
              promptTemplate,
              master: opts.master,
              jd: opts.jd,
              vendorName: opts.vendorName,
              candidateName: opts.candidateName,
              layoutId: opts.layoutId,
              email: opts.email,
              masterProfileJson: opts.masterProfileJson,
            });
            return {
              structured: again.structured,
              text: again.text,
              ats: again.ats,
              psych: again.psych,
            };
          }
        : async () => {
            const again = await assembleDeterministicPack({
              master: opts.master,
              jd: opts.jd,
              vendorName: opts.vendorName,
              candidateName: opts.candidateName,
              layoutId: opts.layoutId,
              email: opts.email,
              masterProfileJson: opts.masterProfileJson,
            });
            return {
              structured: again.structured,
              text: again.text,
              ats: again.ats,
              psych: again.psych,
            };
          },
    });

    if ((regen.ats?.score ?? 0) >= 95) {
      regen.structured.meta.progressiveNotes = [
        ...(regen.structured.meta.progressiveNotes || []),
        `recover-module: engines failed → regen · ATS ${regen.ats.score} · ${detail}`,
        ...regen.history.slice(-5).map((h) => `regen: ${h}`),
      ];
      return await attachPackValidation(
        {
          structured: regen.structured,
          text: regen.text,
          ats: regen.ats,
          psych: regen.psych,
          usedLlm: openai.configured,
          model: openai.configured ? openai.model : "rules-engine",
          engine: openai.configured ? "ai-tailor" : "progressive-rules",
          enginesTried: [
            ...enginesTried,
            {
              engine: "ai-tailor",
              ok: true,
              error: "recovered via regenerate-until-100",
            },
          ],
          passes: regen.attempts,
          tokensIn: 0,
          tokensOut: 0,
        },
        {
          masterProfileJson: opts.masterProfileJson,
          master: opts.master,
          jd: opts.jd,
          candidateName: opts.candidateName,
        }
      );
    }
  } catch {
    /* fall through to throw */
  }

  throw new Error(
    lastError
      ? `All resume engines failed. ${detail}. Last: ${lastError.message}`
      : `All resume engines failed. ${detail}`
  );
}

function estimateCost(tin: number, tout: number, model: string) {
  const m = (model || "").toLowerCase();
  let a = 0.15,
    b = 0.6;
  if (m.includes("gpt-4o") && !m.includes("mini")) {
    a = 2.5;
    b = 10;
  }
  return Number(((tin / 1e6) * a + (tout / 1e6) * b).toFixed(6));
}

export async function tailorResumeText(opts: {
  master: string;
  jd: string;
  vendorName: string;
  candidateName: string;
  employeeId?: string;
  isTestMode?: boolean;
  layoutId?: string | null;
  email?: string;
}) {
  return (await tailorResume(opts)).text;
}
