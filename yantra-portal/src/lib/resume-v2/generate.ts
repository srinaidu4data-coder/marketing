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
import { precheckGenerate, normalizeJdText } from "./precheck";
import { JSON_SHAPE_REMINDER } from "./bible-prompt";

function normalizeFallbackJd(jd: string): string {
  return normalizeJdText(jd) || "Professional role — tailor using master experience.";
}
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
  contactHint?: {
    name: string;
    email: string;
    phone: string;
    location?: string;
    linkedin?: string;
  };
  feedback?: string;
  priorJson?: string;
  /** Admin skill-neutral bank block for thin bullet lookup */
  bulletBankBlock?: string;
  /**
   * C1 project-complete skeleton + per-slot evidence.
   * When set, still keep master for locks but evidence drives rewrite.
   */
  evidenceBlock?: string;
}): string {
  const isFitAccumulate = /FIT ACCUMULATE|MUST WEAVE/i.test(opts.feedback || "");
  const parts: string[] = [];

  // OpenAI-style: instructions + prior first on repair (model attends to front)
  if (isFitAccumulate && opts.feedback) {
    parts.push(
      "=== HIGHEST PRIORITY: FIT ACCUMULATE REPAIR (read first) ===",
      opts.feedback,
      "",
      "ACCUMULATE LAW: KEEP prior tool NOUNS; KEEP strong bullets. ADD missing tool nouns only.",
      "Fit PHRASES → bullets/summary only. Never put phrases into Tech Stack/Environment.",
      "Only repair projects[0..2] for JD fit. projects[i≥3] stay neutral — do not JD-paint early career.",
      "Tech Stack good: SAP IBP, S/4HANA, CPI, Jira. Bad: Hands-on expertise, candidate must have 15+.",
      ""
    );
    if (opts.priorJson) {
      parts.push(
        "=== PRIOR PACK JSON (baseline — accrue onto this) ===",
        opts.priorJson.slice(0, 16000),
        ""
      );
    }
    parts.push(
      "=== JD (weave missing phrases into free fields) ===",
      opts.jd.trim().slice(0, 8000),
      "",
      "=== MASTER LOCKS ONLY (do not invent employers/dates; free craft may JD-rewrite roles/stack/env/bullets) ===",
      opts.master.trim().slice(0, 12000),
      ""
    );
  } else {
    parts.push(
      "=== MASTER (locks: name, employers, dates, order) ===",
      opts.master.trim().slice(0, 28000),
      "",
      "=== JD (target role language — all free fields follow this) ===",
      opts.jd.trim().slice(0, 12000),
      ""
    );
  }

  parts.push(
    "LOCKS: name + every employerOrClient + duration exact. Same project count/order. Certs/education from master only — never invent.",
    "JD REWRITE ONLY projects[0], projects[1], projects[2]: role + techStack + environment + ALL bullets in JD domain (era-honest).",
    "projects[i] with i≥3: FREEZE — keep neutral/master/era-true; do NOT invent role/stack/env/bullets; little JD matching is correct.",
    "header.jobTitle + projects[0..2].role = JD role family. FORBIDDEN: FICO/RTR face on 0..2 when JD is another domain.",
    "ERA: never put modern jargon on a project whose end year predates that tech (no Data Science in 1999).",
    "techStack + environment: NOUN tools only, DIFFERENT lists (Jira/ServiceNow/S/4HANA/IBP/CPI — not sentences).",
    "FORBIDDEN in stack/env: hands-on, expertise, candidate must, strong experience. Phrases → summary/bullets only.",
    "ACCUMULATE: keep prior tool nouns + bullets; add missing tool nouns; Fit phrases into bullets only; do not JD-paint i≥3.",
    "Budget: summary 6–8; EVERY project 8–12 bullets (min 8). No engagement-goals (N/M) filler. No rates/CTC. JSON only."
  );

  if (opts.evidenceBlock && !isFitAccumulate) {
    parts.push("", opts.evidenceBlock);
  }
  if (opts.bulletBankBlock) {
    parts.push("", opts.bulletBankBlock);
  }
  if (opts.contactHint?.name || opts.contactHint?.email) {
    parts.push(
      "",
      "=== CONTACT (name locked; use these in header when present) ===",
      `name: ${opts.contactHint.name || ""}`,
      `email: ${opts.contactHint.email || ""}`,
      `phone: ${opts.contactHint.phone || ""}`,
      `location: ${opts.contactHint.location || ""}`,
      `linkedin: ${opts.contactHint.linkedin || ""}`
    );
  }
  if (opts.feedback && !isFitAccumulate) {
    parts.push(
      "",
      "=== REGENERATION FEEDBACK (keep locks; free craft elsewhere) ===",
      opts.feedback
    );
  }
  if (opts.priorJson && !isFitAccumulate) {
    parts.push(
      "",
      "=== PRIOR JSON (revise; do not copy integrity failures) ===",
      opts.priorJson.slice(0, 14000)
    );
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
  /** Candidate DB fields — used when master text extract fails */
  candidateName?: string;
  email?: string;
  phone?: string;
  /** C1 evidence / skeleton block */
  evidenceBlock?: string;
  /** Pre-formatted bank block (skip default load when set) */
  bulletBankBlock?: string;
  temperature?: number;
  onPhase?: (
    phase:
      | "resume-v2-llm"
      | "resume-v2-schema"
      | "resume-v2-repair"
      | "resume-v2-score"
      | "resume-v2-regen",
    status: "active" | "done" | "error"
  ) => void | Promise<void>;
  /** Skip LLM — for dry tests */
  dryPack?: ResumePackV2;
}): Promise<GenerateV2Result> {
  const enginesTried: GenerateV2Result["enginesTried"] = [];
  // Always prefer a real Bible if caller passed an empty/tiny prompt
  const { BIBLE_PROMPT } = await import("./bible-prompt");
  const promptForRun =
    (opts.prompt || "").trim().length >= 80
      ? opts.prompt.trim()
      : (BIBLE_PROMPT || opts.prompt || "").trim();

  // Soft precheck only — never hard-stop. Product rule: always finish with AI.
  const pre = precheckGenerate({
    prompt: promptForRun,
    masterText: opts.master,
    jd: opts.jd,
    contactOverride: {
      name: opts.candidateName || "",
      email: opts.email || "",
      phone: opts.phone || "",
    },
    allowShortJd: true,
    minJdChars: 1,
    minMasterChars: 1,
    minPromptChars: 1,
  });

  const jdForLlm = pre.jdText || normalizeFallbackJd(opts.jd);
  const masterForLlm =
    pre.masterText ||
    (opts.master || "").trim() ||
    "Professional experience available on request.";
  // Promote precheck "errors" to warnings — generation continues
  const softWarnings = [
    ...pre.warnings,
    ...pre.errors.map((e) => `soft-precheck: ${e}`),
  ];
  pre.errors = [];
  pre.warnings = softWarnings;
  pre.ok = true;

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
    let bulletBankBlock = opts.bulletBankBlock || "";
    if (!bulletBankBlock) {
      try {
        const {
          getSkillNeutralBulletBank,
          formatBulletBankForPrompt,
        } = await import("@/lib/resume/skill-neutral-bullet-bank");
        const bank = await getSkillNeutralBulletBank();
        bulletBankBlock = formatBulletBankForPrompt(bank, 50);
      } catch {
        /* bank optional */
      }
    }
    const user = buildUserMessage({
      master: masterForLlm,
      jd: jdForLlm,
      contactHint: pre.contact,
      feedback: opts.feedback,
      priorJson: opts.priorJson,
      bulletBankBlock,
      evidenceBlock: opts.evidenceBlock,
    });

    try {
      attempts = 1;
      await opts.onPhase?.("resume-v2-llm", "active");
      const first = await callOnce({
        prompt: promptForRun,
        user,
        provider: opts.llmProvider,
        temperature: opts.temperature,
      });
      tokensIn += first.tokensIn;
      tokensOut += first.tokensOut;
      model = first.model;
      provider = first.provider;
      await opts.onPhase?.("resume-v2-llm", "done");
      await opts.onPhase?.("resume-v2-schema", "active");

      let parsed = parseAndValidatePack(first.json);
      // One schema repair — same Bible + shape reminder only
      if (
        parsed.issues.some((i) => i.code === "bullet_count") ||
        !parsed.ok
      ) {
        await opts.onPhase?.("resume-v2-schema", "done");
        await opts.onPhase?.("resume-v2-repair", "active");
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
          prompt: promptForRun,
          user: repairUser,
          provider: opts.llmProvider,
          temperature: 0.25,
        });
        tokensIn += second.tokensIn;
        tokensOut += second.tokensOut;
        model = second.model;
        provider = second.provider;
        parsed = parseAndValidatePack(second.json);
        await opts.onPhase?.("resume-v2-repair", "done");
      } else {
        await opts.onPhase?.("resume-v2-schema", "done");
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
        ats: scoreResume({
          resumeText: "",
          jd: jdForLlm || opts.jd,
          jobTitle: "",
        }),
        psych: scorePsych({
          resumeText: "",
          masterText: masterForLlm || opts.master,
          jd: jdForLlm || opts.jd,
          jobTitle: "",
          mode: resolveTailorMode(
            jdForLlm || opts.jd,
            masterForLlm || opts.master
          ).mode,
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

  // Name lock: always prefer known contact name when model drifts
  if (pre.contact.name) pack.header.name = pre.contact.name;
  // Prefer precheck contact if model blanked them
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
  const modeResult = resolveTailorMode(jdForLlm, masterForLlm);
  const ats = scoreResume({
    resumeText: text,
    jd: jdForLlm,
    jobTitle,
  });
  const psych = scorePsych({
    resumeText: text,
    masterText: masterForLlm,
    jd: jdForLlm,
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
    professionalSummary: { bullets: [] },
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
  candidateName?: string;
  email?: string;
  phone?: string;
  onPhase?: (
    phase:
      | "resume-v2-llm"
      | "resume-v2-schema"
      | "resume-v2-repair"
      | "resume-v2-score"
      | "resume-v2-regen",
    status: "active" | "done" | "error"
  ) => void | Promise<void>;
}): Promise<GenerateV2Result> {
  const target = opts.targetAts ?? 95;
  const max = opts.maxAttempts ?? 3;
  let best: GenerateV2Result | null = null;
  let priorJson: string | undefined;
  let feedback: string | undefined;

  for (let i = 0; i < max; i++) {
    if (i > 0) await opts.onPhase?.("resume-v2-regen", "active");
    const r = await generateResumeV2({
      prompt: opts.prompt,
      master: opts.master,
      jd: opts.jd,
      promptVersionId: opts.promptVersionId,
      llmProvider: opts.llmProvider,
      feedback,
      priorJson,
      candidateName: opts.candidateName,
      email: opts.email,
      phone: opts.phone,
      onPhase: opts.onPhase,
    });
    if (i > 0) await opts.onPhase?.("resume-v2-regen", "done");
    await opts.onPhase?.("resume-v2-score", "active");
    await opts.onPhase?.("resume-v2-score", "done");
    if (!best || r.ats.score > best.ats.score) best = r;
    if (r.ok && r.ats.score >= target) {
      r.attempts = i + 1;
      return r;
    }
    if (!r.ok && r.precheckErrors.length) return r;
    priorJson = JSON.stringify(r.pack);
    feedback = `Attempt ${i + 1} scored ATS ${r.ats.score}/100 (target ≥${target}). Missing keywords: ${(r.ats.missingKeywords || []).slice(0, 15).join(", ")}. Strengthen JD language in summary, skills, AND every project index (not only projects[0]): rewrite role, techStack, environment, and all bullets for projects[0..n-1] to the JD domain. FORBIDDEN: leaving mid/early projects as master FICO/copy while only recent is JD. LOCKS: name, employers, dates, location, education only.`;
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
