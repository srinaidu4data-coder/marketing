/**
 * Prompt-only resume generation — single path.
 * system = ACTIVE prompt (Bible)
 * user   = master + JD (+ optional regen feedback)
 */

import { llmChatJson } from "@/lib/resume/llm-chat";
import {
  getLlmConfigForProvider,
  type LlmProvider,
} from "@/lib/resume/llm-config";
import { getActiveLlmConfig } from "@/lib/system-settings";
import {
  parseAndValidatePack,
  type ResumePackV2,
  type PackValidationIssue,
} from "./pack-schema";
import { renderPackText, packToStructuredResume } from "./render-pack";
import { precheckGenerate } from "./precheck";
import { JSON_SHAPE_REMINDER } from "./bible-prompt";
import { scoreResume } from "@/lib/resume/ats-scorer";
import { scorePsych } from "@/lib/resume/psych-scorer";
import { resolveTailorMode } from "@/lib/resume/tailor-mode";

export type GenerateV2Result = {
  ok: boolean;
  pack: ResumePackV2;
  text: string;
  structured: ReturnType<typeof packToStructuredResume>;
  issues: PackValidationIssue[];
  precheckErrors: string[];
  precheckWarnings: string[];
  ats: ReturnType<typeof scoreResume>;
  psych: ReturnType<typeof scorePsych>;
  model: string;
  provider: string;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  enginesTried: { engine: string; ok: boolean; error?: string }[];
  error?: string;
};

function buildUserMessage(opts: {
  master: string;
  jd: string;
  contactHint?: { name: string; email: string; phone: string };
  feedback?: string;
  priorJson?: string;
}): string {
  const parts = [
    "=== MASTER RESUME (facts only — do not invent beyond this) ===",
    opts.master.trim(),
    "",
    "=== JOB DESCRIPTION (language + priority for tailoring) ===",
    opts.jd.trim(),
  ];
  if (opts.contactHint?.name || opts.contactHint?.email) {
    parts.push(
      "",
      "=== EXTRACTED CONTACT HINTS (prefer these exact values in header) ===",
      `name: ${opts.contactHint.name || ""}`,
      `email: ${opts.contactHint.email || ""}`,
      `phone: ${opts.contactHint.phone || ""}`
    );
  }
  if (opts.feedback) {
    parts.push(
      "",
      "=== REGENERATION FEEDBACK (improve pack; same honesty rules) ===",
      opts.feedback
    );
  }
  if (opts.priorJson) {
    parts.push("", "=== PRIOR JSON (revise; do not copy integrity failures) ===", opts.priorJson.slice(0, 14000));
  }
  parts.push(
    "",
    "Return the full resume pack as a single JSON object per the Bible contract."
  );
  return parts.join("\n");
}

async function callOnce(opts: {
  prompt: string;
  user: string;
  provider?: LlmProvider | null;
  temperature?: number;
}): Promise<{
  json: unknown;
  raw: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
}> {
  const cfg = opts.provider
    ? getLlmConfigForProvider(opts.provider)
    : await getActiveLlmConfig(null);
  if (!cfg.configured) {
    throw new Error(cfg.reason || "LLM not configured");
  }
  const res = await llmChatJson({
    system: opts.prompt.trim(),
    user: opts.user,
    temperature: opts.temperature ?? 0.4,
    config: cfg,
  });
  return {
    json: res.json,
    raw: res.raw,
    model: res.model,
    provider: res.provider,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
  };
}

/**
 * Generate with schema repair once if bullet counts wrong.
 */
export async function generateResumeV2(opts: {
  prompt: string;
  master: string;
  jd: string;
  promptVersionId?: string;
  llmProvider?: LlmProvider | null;
  feedback?: string;
  priorJson?: string;
  /** Skip LLM — for dry tests */
  dryPack?: ResumePackV2;
}): Promise<GenerateV2Result> {
  const enginesTried: GenerateV2Result["enginesTried"] = [];
  const pre = precheckGenerate({
    prompt: opts.prompt,
    masterText: opts.master,
    jd: opts.jd,
  });

  if (!pre.ok && !opts.dryPack) {
    const empty = emptyPack();
    return {
      ok: false,
      pack: empty,
      text: "",
      structured: packToStructuredResume(empty),
      issues: [],
      precheckErrors: pre.errors,
      precheckWarnings: pre.warnings,
      ats: scoreResume({ resumeText: "", jd: opts.jd, jobTitle: "" }),
      psych: scorePsych({
        resumeText: "",
        masterText: opts.master,
        jd: opts.jd,
        jobTitle: "",
        mode: resolveTailorMode(opts.jd, opts.master).mode,
      }),
      model: "",
      provider: "",
      attempts: 0,
      tokensIn: 0,
      tokensOut: 0,
      enginesTried: [{ engine: "resume-v2", ok: false, error: pre.errors.join("; ") }],
      error: pre.errors.join(" · "),
    };
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let model = "";
  let provider = "";
  let pack: ResumePackV2;
  let issues: PackValidationIssue[] = [];
  let attempts = 0;

  if (opts.dryPack) {
    pack = opts.dryPack;
  } else {
    const user = buildUserMessage({
      master: pre.masterText || opts.master,
      jd: opts.jd,
      contactHint: pre.contact,
      feedback: opts.feedback,
      priorJson: opts.priorJson,
    });

    try {
      attempts = 1;
      const first = await callOnce({
        prompt: opts.prompt,
        user,
        provider: opts.llmProvider,
      });
      tokensIn += first.tokensIn;
      tokensOut += first.tokensOut;
      model = first.model;
      provider = first.provider;

      let parsed = parseAndValidatePack(first.json);
      // One schema repair — same Bible + shape reminder only
      if (
        parsed.issues.some((i) => i.code === "bullet_count") ||
        !parsed.ok
      ) {
        attempts = 2;
        const repairUser =
          user +
          "\n\n=== SCHEMA REPAIR ===\n" +
          JSON_SHAPE_REMINDER +
          "\nIssues: " +
          parsed.issues.map((i) => i.detail).join("; ") +
          "\nPrior JSON:\n" +
          first.raw.slice(0, 12000);
        const second = await callOnce({
          prompt: opts.prompt,
          user: repairUser,
          provider: opts.llmProvider,
          temperature: 0.25,
        });
        tokensIn += second.tokensIn;
        tokensOut += second.tokensOut;
        model = second.model;
        provider = second.provider;
        parsed = parseAndValidatePack(second.json);
      }

      pack = parsed.pack;
      issues = parsed.issues;
      enginesTried.push({ engine: "resume-v2", ok: parsed.ok || pack.projects.length > 0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      enginesTried.push({ engine: "resume-v2", ok: false, error: msg });
      const empty = emptyPack();
      return {
        ok: false,
        pack: empty,
        text: "",
        structured: packToStructuredResume(empty),
        issues: [],
        precheckErrors: pre.errors,
        precheckWarnings: pre.warnings,
        ats: scoreResume({ resumeText: "", jd: opts.jd, jobTitle: "" }),
        psych: scorePsych({
          resumeText: "",
          masterText: opts.master,
          jd: opts.jd,
          jobTitle: "",
          mode: resolveTailorMode(opts.jd, opts.master).mode,
        }),
        model,
        provider,
        attempts,
        tokensIn,
        tokensOut,
        enginesTried,
        error: msg,
      };
    }
  }

  // Prefer precheck contact if model blanked them
  if (!pack.header.name && pre.contact.name) pack.header.name = pre.contact.name;
  if (!pack.header.email && pre.contact.email) pack.header.email = pre.contact.email;
  if (!pack.header.phone && pre.contact.phone) pack.header.phone = pre.contact.phone;
  if (!pack.header.linkedin && pre.contact.linkedin) {
    pack.header.linkedin = pre.contact.linkedin;
  }

  pack.meta = {
    ...(pack.meta || {}),
    model,
    provider,
    promptVersionId: opts.promptVersionId,
    attempts,
    notes: issues.map((i) => i.detail),
  };

  const text = renderPackText(pack);
  const structured = packToStructuredResume(pack);
  const jobTitle = pack.header.jobTitle;
  const modeResult = resolveTailorMode(opts.jd, opts.master);
  const ats = scoreResume({
    resumeText: text,
    jd: opts.jd,
    jobTitle,
  });
  const psych = scorePsych({
    resumeText: text,
    masterText: opts.master,
    jd: opts.jd,
    jobTitle,
    mode: modeResult.mode,
    candidateName: pack.header.name,
  });
  structured.meta.atsScore = ats.score;
  structured.meta.psychScore = psych.score;
  structured.meta.jobTitle = jobTitle;
  structured.meta.skillFingerprint = (ats.missingKeywords || []).slice(0, 5).join(",");
  structured.meta.tailorMode = modeResult.mode;
  structured.meta.progressiveNotes = [
    `resume-v2 · ${provider || "llm"} · ${model || "model"}`,
    `ATS ${ats.score} · Psych ${psych.score}`,
    ...issues.slice(0, 6).map((i) => i.detail),
  ];

  return {
    ok: true,
    pack,
    text,
    structured,
    issues,
    precheckErrors: pre.errors,
    precheckWarnings: pre.warnings,
    ats,
    psych,
    model,
    provider,
    attempts,
    tokensIn,
    tokensOut,
    enginesTried,
  };
}

function emptyPack(): ResumePackV2 {
  return {
    header: {
      jobTitle: "",
      name: "",
      phone: "",
      email: "",
      location: "",
      linkedin: "",
    },
    professionalSummary: { bullets: Array.from({ length: 12 }, () => "") },
    techSkills: "",
    education: [],
    certifications: [],
    projects: [],
  };
}

/**
 * Generate + regen until ATS ≥ target or maxAttempts.
 */
export async function generateResumeV2WithRegen(opts: {
  prompt: string;
  master: string;
  jd: string;
  promptVersionId?: string;
  llmProvider?: LlmProvider | null;
  targetAts?: number;
  maxAttempts?: number;
}): Promise<GenerateV2Result> {
  const target = opts.targetAts ?? 95;
  const max = opts.maxAttempts ?? 3;
  let best: GenerateV2Result | null = null;
  let priorJson: string | undefined;
  let feedback: string | undefined;

  for (let i = 0; i < max; i++) {
    const r = await generateResumeV2({
      prompt: opts.prompt,
      master: opts.master,
      jd: opts.jd,
      promptVersionId: opts.promptVersionId,
      llmProvider: opts.llmProvider,
      feedback,
      priorJson,
    });
    if (!best || r.ats.score > best.ats.score) best = r;
    if (r.ok && r.ats.score >= target) {
      r.attempts = i + 1;
      return r;
    }
    if (!r.ok && r.precheckErrors.length) return r;
    priorJson = JSON.stringify(r.pack);
    feedback = `Attempt ${i + 1} scored ATS ${r.ats.score}/100 (target ≥${target}). Missing keywords: ${(r.ats.missingKeywords || []).slice(0, 15).join(", ")}. Warnings: ${(r.ats.warnings || []).slice(0, 5).join("; ")}. Strengthen JD language in summary, skills, and recent project stack/environment. Keep exactly 12 bullets. Never invent numbers or employers.`;
  }

  if (best) {
    best.attempts = max;
    best.pack.meta = {
      ...(best.pack.meta || {}),
      attempts: max,
      notes: [
        ...(best.pack.meta?.notes || []),
        `Stopped after ${max} attempts · best ATS ${best.ats.score}`,
      ],
    };
  }
  return best!;
}

/** Try OpenAI + Claude; pick higher ATS (tie-break Psych). */
export async function generateResumeV2PickBetter(opts: {
  prompt: string;
  master: string;
  jd: string;
  promptVersionId?: string;
  targetAts?: number;
  maxAttempts?: number;
}): Promise<GenerateV2Result & { runnerUp?: GenerateV2Result }> {
  const [a, b] = await Promise.all([
    generateResumeV2WithRegen({ ...opts, llmProvider: "openai" }).catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    })),
    generateResumeV2WithRegen({ ...opts, llmProvider: "anthropic" }).catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    })),
  ]);

  const ra = "ok" in a ? a : null;
  const rb = "ok" in b ? b : null;
  if (ra && rb) {
    const better =
      ra.ats.score > rb.ats.score
        ? ra
        : rb.ats.score > ra.ats.score
          ? rb
          : ra.psych.score >= rb.psych.score
            ? ra
            : rb;
    const runnerUp = better === ra ? rb : ra;
    return { ...better, runnerUp };
  }
  if (ra) return ra;
  if (rb) return rb;
  throw new Error(
    `Both providers failed: ${"error" in a ? a.error : ""} / ${"error" in b ? b.error : ""}`
  );
}
