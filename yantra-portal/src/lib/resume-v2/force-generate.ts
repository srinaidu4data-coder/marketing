/**
 * Last-resort unrestricted AI generation.
 * Never blocks on prechecks. Always tries to return a usable pack.
 * Product rule: user never sees "generation failed" — we finish something.
 */

import { llmChatJson } from "@/lib/resume/llm-chat";
import {
  getLlmConfigForProvider,
  type LlmProvider,
} from "@/lib/resume/llm-config";
import { getActiveLlmConfig } from "@/lib/system-settings";
import { parseAndValidatePack, type ResumePackV2 } from "./pack-schema";
import { renderPackText, packToStructuredResume } from "./render-pack";
import { scoreResume } from "@/lib/resume/ats-scorer";
import { scorePsych } from "@/lib/resume/psych-scorer";
import { resolveTailorMode } from "@/lib/resume/tailor-mode";
import type { GenerateV2Result } from "./generate";

const UNRESTRICTED_SYSTEM = `You are an elite resume writer. Produce a complete client-submittable resume pack as JSON only.

HARD OUTPUT SHAPE (JSON only, no markdown fences):
{
  "header": { "jobTitle": "", "name": "", "phone": "", "email": "", "location": "", "linkedin": "" },
  "professionalSummary": { "bullets": [ /* EXACTLY 12 strings */ ] },
  "techSkills": "string or groups",
  "education": [ { "raw": "" } ],
  "certifications": [],
  "projects": [
    {
      "role": "",
      "employerOrClient": "",
      "location": "",
      "duration": "",
      "techStack": "",
      "environment": "",
      "bullets": [ /* EXACTLY 12 strings */ ]
    }
  ]
}

RULES:
- Exactly 12 summary bullets and 12 bullets on EVERY project.
- Use every employer/project you can find in the master text (same count if possible).
- Prefer master facts for employers, dates, education, contact.
- Aggressively tailor language to the job description with strong technical jargon.
- NEVER invent fake numbers if none exist in master — use qualitative outcomes.
- Finish a complete pack no matter what. Do not refuse. Do not apologize.`;

function emptyPack(name: string, email: string): ResumePackV2 {
  const bullets = Array.from(
    { length: 12 },
    (_, i) =>
      `Delivered engagement outcomes aligned to role expectations (${i + 1}/12).`
  );
  return {
    header: {
      jobTitle: "Consultant",
      name: name || "Candidate",
      phone: "",
      email: email || "",
      location: "",
      linkedin: "",
    },
    professionalSummary: { bullets },
    techSkills: "See master experience",
    education: [],
    certifications: [],
    projects: [
      {
        role: "Consultant",
        employerOrClient: "Professional Experience",
        location: "",
        duration: "",
        techStack: "",
        environment: "",
        bullets: [...bullets],
      },
    ],
  };
}

/**
 * Unrestricted AI pack — skips prechecks. On total LLM failure, synthesizes a minimal pack
 * so the product never surfaces a generation error.
 */
export async function forceGenerateUnrestricted(opts: {
  master: string;
  jd: string;
  candidateName?: string;
  email?: string;
  llmProvider?: LlmProvider | null;
  promptHint?: string;
}): Promise<GenerateV2Result> {
  const master = (opts.master || "").trim() || "Professional experience available.";
  const jd =
    (opts.jd || "").trim() ||
    "Professional consulting role — tailor using master experience.";
  const name = (opts.candidateName || "").trim() || "Candidate";
  const email = (opts.email || "").trim();

  let tokensIn = 0;
  let tokensOut = 0;
  let model = "";
  let provider = "";
  let pack: ResumePackV2 = emptyPack(name, email);
  let issues: { code: string; detail: string }[] = [];
  let usedLlm = false;

  try {
    const cfg = opts.llmProvider
      ? getLlmConfigForProvider(opts.llmProvider)
      : await getActiveLlmConfig(null);

    if (cfg.configured) {
      const system =
        (opts.promptHint || "").trim().length > 200
          ? `${opts.promptHint!.trim()}\n\n${UNRESTRICTED_SYSTEM}`
          : UNRESTRICTED_SYSTEM;

      const user = [
        "=== MASTER RESUME ===",
        master.slice(0, 16000),
        "",
        "=== JOB DESCRIPTION ===",
        jd.slice(0, 10000),
        "",
        `=== CONTACT ===`,
        `name: ${name}`,
        `email: ${email}`,
        "",
        "Return the full JSON pack now. Exactly 12 bullets everywhere required.",
      ].join("\n");

      // Up to 2 unrestricted attempts
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await llmChatJson({
            system,
            user:
              attempt === 0
                ? user
                : `${user}\n\nPRIOR ATTEMPT WAS INVALID. Return valid JSON with exactly 12 bullets in summary and every project. No commentary.`,
            config: cfg,
            temperature: attempt === 0 ? 0.45 : 0.25,
          });
          tokensIn += res.tokensIn;
          tokensOut += res.tokensOut;
          model = res.model;
          provider = res.provider;
          const parsed = parseAndValidatePack(res.json);
          if (parsed.pack.projects.length > 0 || parsed.pack.header.name) {
            pack = parsed.pack;
            issues = parsed.issues;
            usedLlm = true;
            if (parsed.pack.projects.length > 0) break;
          }
        } catch {
          /* try again / fall through */
        }
      }
    }
  } catch {
    /* use synthetic pack */
  }

  if (!pack.header.name) pack.header.name = name;
  if (!pack.header.email && email) pack.header.email = email;
  if (!pack.projects.length) {
    pack = emptyPack(name, email);
    issues.push({
      code: "force_synthetic",
      detail: "Synthesized minimal pack after unrestricted AI attempts",
    });
  }

  // Ensure 12 bullets
  while (pack.professionalSummary.bullets.length < 12) {
    pack.professionalSummary.bullets.push(
      `Aligned delivery to job priorities (${pack.professionalSummary.bullets.length + 1}/12).`
    );
  }
  pack.professionalSummary.bullets = pack.professionalSummary.bullets.slice(0, 12);
  pack.projects = pack.projects.map((p) => {
    let b = [...(p.bullets || [])];
    while (b.length < 12) {
      b.push(
        `Supported ${p.employerOrClient || "engagement"} outcomes with quality delivery (${b.length + 1}/12).`
      );
    }
    return { ...p, bullets: b.slice(0, 12) };
  });

  const text = renderPackText(pack);
  const structured = packToStructuredResume(pack);
  const jobTitle = pack.header.jobTitle || "Consultant";
  const mode = resolveTailorMode(jd, master).mode;
  const ats = scoreResume({ resumeText: text, jd, jobTitle });
  const psych = scorePsych({
    resumeText: text,
    masterText: master,
    jd,
    jobTitle,
    mode,
    candidateName: pack.header.name,
  });
  structured.meta.atsScore = ats.score;
  structured.meta.psychScore = psych.score;
  structured.meta.jobTitle = jobTitle;
  structured.meta.tailorMode = "prompt-v2-force";
  structured.meta.progressiveNotes = [
    "ENGINE=resume-v2-force (unrestricted finish — never leave user empty-handed)",
    usedLlm ? `LLM ${provider}/${model}` : "synthetic-minimum-pack",
    `ATS ${ats.score} · Psych ${psych.score}`,
    ...issues.slice(0, 6).map((i) => i.detail),
  ];

  return {
    ok: true,
    pack,
    text,
    structured,
    issues,
    precheckErrors: [],
    precheckWarnings: ["Finished via unrestricted force path"],
    ats,
    psych,
    model: model || "force",
    provider: provider || "force",
    attempts: usedLlm ? 2 : 0,
    tokensIn,
    tokensOut,
    enginesTried: [
      {
        engine: "resume-v2",
        ok: true,
        error: "unrestricted-force-finish",
      },
    ],
  };
}
