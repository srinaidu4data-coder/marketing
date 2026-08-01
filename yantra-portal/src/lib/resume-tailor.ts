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
import type { StructuredResume } from "./resume/templates";
import type { RulesGateResult } from "./resume/rules-gate";
import {
  validatePackAgainstMaster,
  type PackValidationReport,
} from "./resume/master-pack-validate";
import { parseStoredMasterProfile } from "./resume/master-profile";
import { MIN_BULLETS_PER_PROJECT } from "./resume/assemble-pack";
import {
  assertAllMasterClientsPresent,
  packHasIndustryCosplay,
} from "./resume/resume-honesty";

export { renderEmailTemplate } from "./resume/email-render";
export { getOpenAiConfig } from "./resume/openai-config";
export { LAYOUT_CONFIGS, getLayoutConfig } from "./resume/layout-config";
export { RESUME_LAYOUTS, getLayout, layoutForIndex } from "./resume/templates";

export type TailorResumeResult = {
  structured: StructuredResume;
  text: string;
  ats: AtsResult;
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
};

/**
 * Final delivery gates: clients + bullets + industry cosplay.
 * Fail = full resume not returned (engine throws).
 */
function assertDeliveredBulletDensity(text: string): void {
  const blocks = text.split(/Employer\s*\/\s*Client:\s*/i).slice(1);
  if (!blocks.length) {
    const bullets = (text.match(/^[•\-–▸→\*]\s+\S/gm) || []).length;
    if (bullets < MIN_BULLETS_PER_PROJECT) {
      throw new Error(
        `Resume generation blocked: mandatory ${MIN_BULLETS_PER_PROJECT}–10 bullets per project/client/employer. No employer blocks found and only ${bullets} bullets total.`
      );
    }
    return;
  }
  const thin: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const head = (blocks[i].split("\n")[0] || `Client ${i + 1}`)
      .split(",")[0]
      .trim()
      .slice(0, 60);
    const n = (blocks[i].match(/^[•\-–▸→\*]\s+\S/gm) || []).length;
    if (n < MIN_BULLETS_PER_PROJECT) {
      thin.push(`${head}: ${n}/${MIN_BULLETS_PER_PROJECT}`);
    }
  }
  if (thin.length) {
    throw new Error(
      `Resume generation blocked: every project/client/employer requires ${MIN_BULLETS_PER_PROJECT}–10 bullets (mandatory). Insufficient: ${thin.join("; ")}. Full resume was not generated.`
    );
  }
}

function attachPackValidation(
  result: Omit<TailorResumeResult, "packValidation">,
  opts: { masterProfileJson?: string | null; master: string }
): TailorResumeResult {
  // Hard gates — no DOCX/PDF payload if any fail
  assertAllMasterClientsPresent({
    masterProfileJson: opts.masterProfileJson,
    masterText: opts.master,
    tailoredText: result.text,
  });
  assertDeliveredBulletDensity(result.text);

  const cosplay = packHasIndustryCosplay(result.text, opts.master);
  if (cosplay.length) {
    throw new Error(
      `Resume generation blocked: industry/career claims not supported by master (${cosplay.join(", ")}). Full resume was not generated.`
    );
  }

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
    tailoredText: result.text,
    expectedYears: span,
  });

  if (packValidation.clientsMissing.length) {
    throw new Error(
      `Resume generation blocked: missing master employers in pack: ${packValidation.clientsMissing
        .map((c) => c.split(",")[0])
        .join("; ")}. Full resume was not generated.`
    );
  }

  const bulletCheck = packValidation.checks.find(
    (c) => c.id === "pack_bullets_per_project"
  );
  if (bulletCheck && bulletCheck.severity === "fail") {
    throw new Error(
      `Resume generation blocked: mandatory ${MIN_BULLETS_PER_PROJECT}–10 bullets per project/client. ${bulletCheck.detail}. Full resume was not generated.`
    );
  }

  result.structured.meta.progressiveNotes = [
    ...result.structured.meta.progressiveNotes,
    `Ground-truth: ${packValidation.ok ? "PASS" : "REVIEW"} ${packValidation.score}% · clients ${packValidation.clientsFound.length}/${packValidation.engagementCount} · fail ${packValidation.summary.fail} warn ${packValidation.summary.warn}`,
    `Bullet density: PASS · mandatory ≥${MIN_BULLETS_PER_PROJECT} per project/client (hard gate)`,
    `Honesty: no unsupported industry cosplay`,
  ];
  return { ...result, packValidation };
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
        return attachPackValidation(
          {
            structured: result.structured,
            text: result.text,
            ats: result.ats,
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
        return attachPackValidation(
          {
            structured: pack.structured,
            text: pack.text,
            ats: pack.ats,
            usedLlm: false,
            model: "rules-engine",
            engine: "progressive-rules",
            enginesTried,
            matchGate: { pass: true, reasons: [] },
            passes: 1,
            tokensIn: 0,
            tokensOut: 0,
          },
          {
            masterProfileJson: opts.masterProfileJson,
            master: opts.master,
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

  const detail = enginesTried
    .map((e) => `${e.engine}: ${e.ok ? "ok" : e.error || "fail"}`)
    .join(" | ");
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
