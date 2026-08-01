/**
 * Role Forge AI Resume Engine.
 *
 * Contract:
 * - OpenAI + prompt + rules (no silent non-AI packs)
 * - Header from master; headline/title from JD
 * - All master projects kept; recent 2 titles = JD title
 * - Skills/bullets honesty: grounded (JD∩master) > rephrase master > soft fill
 * - Layout spines + single QA/rules pass
 */

import { DEFAULT_PROMPT } from "@/lib/constants";
import {
  extractJobTitle,
  scoreResume,
  skillFingerprint,
  type AtsResult,
} from "./ats-scorer";
import {
  buildStructuredFromLayout,
  renderPlainFromStructured,
} from "./build-from-layout";
import {
  detectDomain,
  skillsHonestFromSources,
  yearsFromMasterAndProjects,
  type DomainHint,
} from "./jd-parse";
import { extractContactFromMaster, formatContactLine } from "./extract-contact";
import {
  criticalJdPhrases,
  domainProofBullets,
  hasCriticalJdCoverage,
} from "./jd-weave";
import { getLayoutConfig } from "./layout-config";
import { getOpenAiConfig } from "./openai-config";
import {
  anchorsFromMaster,
  assertMandatoryBulletDensity,
  buildProjects,
  MIN_BULLETS_PER_PROJECT,
  type AiProjectInput,
} from "./assemble-pack";
import {
  parseStoredMasterProfile,
  profileForAiPath,
} from "./master-profile";
import {
  isOffDomainText,
  type ResumeEnginePolicy,
} from "./resume-engine-policy";
import {
  isLowOverlap,
  scrubSapRitualFromBullets,
  scrubSummaryHonesty,
} from "./resume-honesty";
import { getResumeEnginePolicy } from "@/lib/system-settings";
import { runRulesGate, type RulesGateResult } from "./rules-gate";
import { qaAndRepairResume } from "./resume-qa";
import type { StructuredResume } from "./templates";

export type AiTailorInput = {
  promptTemplate: string;
  master: string;
  jd: string;
  vendorName: string;
  candidateName: string;
  layoutId?: string | null;
  email?: string;
  /** Structured master profile JSON from parse-on-upload (preferred anchors) */
  masterProfileJson?: string | null;
  /** Optional live UI progress (green checks) */
  onStep?: (stepId: string, status: "active" | "done" | "error") => void | Promise<void>;
};

export type AiTailorResult = {
  structured: StructuredResume;
  text: string;
  ats: AtsResult;
  usedLlm: true;
  model: string;
  tokensIn: number;
  tokensOut: number;
  promptVersionNote: string;
  qaIssues: { severity: string; code: string; message: string }[];
  rulesGate: RulesGateResult;
  passes: number;
  matchGate: { pass: boolean; reasons: string[] };
};

type AiResumeJson = {
  headline?: string;
  summary?: string[] | string;
  skills?: string[] | string;
  impact?: string[] | string;
  methodology?: string[] | string;
  projects?: AiProjectInput[];
  education?: string[] | string;
  certifications?: string[] | string;
  supportiveTitles?: string[];
};

const MAX_PASSES = Number(process.env.AI_MATCH_MAX_PASSES || 2);

function asArr(v: string[] | string | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return String(v)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fillPrompt(template: string, vars: Record<string, string>) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi"), v);
  }
  return out;
}

function dedupeBullets(lines: string[]): string[] {
  const out: string[] = [];
  const keys = new Set<string>();
  for (const b of lines) {
    const k = b
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 55);
    if (!k || keys.has(k)) continue;
    keys.add(k);
    out.push(b);
  }
  return out;
}

function isNoisyBullet(b: string): boolean {
  return (
    /near-100%|keyword coverage|ROLE\s*::|80\s*\/\s*hr/i.test(b) ||
    /Do the data work personally where it matters/i.test(b)
  );
}

function extractEducationLinesFromMaster(master: string): string[] {
  if (!master || master.length < 20) return [];
  const lines = master.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      /^(education|academic|certifications?|licenses?)\b/i.test(lines[i]) &&
      lines[i].length < 60
    ) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (
      /^(experience|professional|technical skills|skills|summary|employment)\b/i.test(
        line
      ) &&
      line.length < 50
    ) {
      break;
    }
    if (line.length < 4 || line.length > 200) continue;
    if (/^https?:\/\//i.test(line) || /@/.test(line)) continue;
    out.push(line);
    if (out.length >= 8) break;
  }
  return out;
}

async function chatJson(opts: {
  system: string;
  user: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature?: number;
}): Promise<{
  json: AiResumeJson;
  raw: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}> {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature ?? 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
    signal: AbortSignal.timeout(
      Number(process.env.OPENAI_TIMEOUT_MS || 90_000)
    ),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  let raw = (data.choices?.[0]?.message?.content || "").trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!raw) throw new Error("OpenAI empty response");
  const json = JSON.parse(raw) as AiResumeJson;
  return {
    json,
    raw,
    tokensIn: data.usage?.prompt_tokens || Math.ceil(opts.user.length / 4),
    tokensOut: data.usage?.completion_tokens || Math.ceil(raw.length / 4),
    model: data.model || opts.model,
  };
}

/** Years claim in prose — one number only, never “25” then “27+”. */
const YEARS_CLAIM_RE =
  /\b(?:over|approximately|about|around|nearly|more than)\s+\d{1,2}\+?\s*years?\b|\b\d{1,2}\+\s*years?\b|\b\d{1,2}\s*years?\b/gi;

function hasYearsClaim(s: string): boolean {
  // Non-global clone — avoid RegExp.lastIndex traps with .test()
  return /\b(?:over|approximately|about|around|nearly|more than)\s+\d{1,2}\+?\s*years?\b|\b\d{1,2}\+\s*years?\b|\b\d{1,2}\s*years?\b/i.test(
    s
  );
}

function normalizeYearsInText(s: string, yearsHint: number): string {
  if (yearsHint <= 0 || !hasYearsClaim(s)) return s;
  let first = true;
  return s
    .replace(YEARS_CLAIM_RE, () => {
      if (!first) return "";
      first = false;
      return `approximately ${yearsHint}+ years`;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

/** Reject keyword-dump / template lines that read as machine fill, not prose. */
function isSummaryJunk(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 28) return true;
  if (/^core focus includes\b/i.test(t)) return true;
  if (/^career progression moves from\b/i.test(t)) return true;
  if (/\baligned to\b/i.test(t) && (t.match(/,/g) || []).length >= 2) return true;
  if (/cutover,\s*and hypercare|build\/test cycles.*hypercare/i.test(t)) return true;
  // "aligned to Pharmaceutical, PowerPoint, CDISC" — skill list as career arc
  if (/\bPowerPoint\b/i.test(t) && /\byears?\b/i.test(t)) return true;
  return false;
}

/**
 * Apple bar: one voice, one years claim, no AI+template stacking.
 * Prefer strong AI prose; else one short human template — never both year numbers.
 */
function buildCoherentSummary(opts: {
  candidateName: string;
  jobTitle: string;
  domain: DomainHint;
  yearsHint: number;
  skills: string[];
  critical: string[];
  aiSummary: string[];
  policy: ResumeEnginePolicy;
  master: string;
  lowOverlap: boolean;
}): string[] {
  const first = opts.candidateName.split(/\s+/)[0] || opts.candidateName;

  // Substantive skills only — never soft JD noise in summary prose
  const skillPick = [
    ...opts.skills,
    ...opts.critical,
  ]
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 2 &&
        s.length < 42 &&
        !/^(data|clinical|pharmaceutical|powerpoint|ms office|problem solving|interpersonal skills)$/i.test(
          s
        )
    )
    .slice(0, 6);
  const skillLine = skillPick.slice(0, 5).join(", ");

  let kept = opts.aiSummary
    .map((s) => String(s).replace(/\s+/g, " ").trim())
    .filter(
      (s) =>
        s.length > 40 &&
        !/@/.test(s) &&
        !isSummaryJunk(s) &&
        !isOffDomainText(s, opts.domain, opts.policy)
    )
    .map((s) =>
      opts.yearsHint > 0 ? normalizeYearsInText(s, opts.yearsHint) : s
    );

  // One years claim across the whole summary block
  let sawYears = false;
  kept = kept
    .map((s) => {
      if (!hasYearsClaim(s)) return s;
      YEARS_CLAIM_RE.lastIndex = 0;
      if (sawYears) {
        return s
          .replace(YEARS_CLAIM_RE, "")
          .replace(/\s{2,}/g, " ")
          .replace(/\s+([,.])/g, "$1")
          .trim();
      }
      sawYears = true;
      return opts.yearsHint > 0 ? normalizeYearsInText(s, opts.yearsHint) : s;
    })
    .filter((s) => s.length > 40 && !isSummaryJunk(s));

  // Strong AI prose alone — do NOT append templates (was the 25 vs 27+ bug)
  const proseChars = kept.join(" ").length;
  if (kept.length >= 2 && proseChars >= 280) {
    kept = dedupeBullets(kept).slice(0, 6);
  } else if (kept.length >= 1 && proseChars >= 180) {
    const pad: string[] = [];
    if (skillLine && !kept.some((k) => /core focus|specializ|focus/i.test(k))) {
      pad.push(`Strengths relevant to this search include ${skillLine}.`);
    }
    kept = dedupeBullets([...kept, ...pad]).slice(0, 5);
  } else {
    const yearsPart =
      opts.yearsHint > 0
        ? ` with approximately ${opts.yearsHint}+ years of progressive professional experience`
        : " with progressive professional experience";
    const fallback = [
      `${first} is positioned as a ${opts.jobTitle}${yearsPart}, drawing on delivery history that is reframed toward this role’s requirements.`,
      skillLine
        ? `Focus areas for this submission include ${skillLine}.`
        : `Experience is mapped to ${opts.jobTitle} responsibilities with honest emphasis on transferable delivery discipline.`,
    ];
    if (kept.length === 1) {
      kept = dedupeBullets([...kept, fallback[1]].filter(Boolean)).slice(0, 4);
    } else {
      kept = dedupeBullets(fallback).slice(0, 4);
    }
  }

  // Honesty scrub: no industry cosplay; low-overlap → transferable framing only
  return scrubSummaryHonesty({
    lines: kept,
    master: opts.master,
    jobTitle: opts.jobTitle,
    yearsHint: opts.yearsHint,
    candidateName: opts.candidateName,
    lowOverlap: opts.lowOverlap,
  });
}

/** Last-pass scrub of any contradicting lines left in structured sections */
function scrubContradictionsInStructured(
  structured: StructuredResume,
  domain: DomainHint,
  jobTitle: string,
  policy: ResumeEnginePolicy
): StructuredResume {
  const sections = structured.sections.map((sec) => {
    if (/experience|engagement|deep-dive|chapter|history|case|track/i.test(sec.heading)) {
      return sec;
    }
    const lines = sec.lines.filter((l) => {
      if (!l.trim()) return true;
      if (isOffDomainText(l, domain, policy)) return false;
      return true;
    });
    return { ...sec, lines };
  });
  return {
    ...structured,
    headline: jobTitle.slice(0, 120),
    sections,
  };
}

/** Drop padding, industry meta lines, and near-duplicate master noise */
export async function generateResumeWithOpenAi(
  input: AiTailorInput
): Promise<AiTailorResult> {
  const cfg = getOpenAiConfig();
  if (!cfg.configured) {
    throw new Error(
      cfg.reason || "OPENAI_API_KEY required for Role Forge AI resumes."
    );
  }

  const report = async (stepId: string, status: "active" | "done" | "error") => {
    try {
      await input.onStep?.(stepId, status);
    } catch {
      /* never fail generation on progress UI */
    }
  };

  const layout = getLayoutConfig(input.layoutId);
  await report("parse_master", "active");
  await report("parse_jd", "active");

  const policy = await getResumeEnginePolicy();
  const jobTitle = extractJobTitle(input.jd);
  const domain = detectDomain(input.jd, jobTitle, policy);
  const anchors = anchorsFromMaster(input.master, input.masterProfileJson);
  const critical = criticalJdPhrases(input.jd, domain, policy);
  // Honest skill bank: grounded (JD∩master) vs jdOnly (ATS page-1 only)
  const honest = skillsHonestFromSources(input.jd, input.master, 40);
  const pack = honest.all;
  const groundedPack = honest.grounded.length
    ? honest.grounded
    : honest.masterOnly.slice(0, 20);
  const lowOverlap = isLowOverlap(input.jd, input.master);
  const template = (input.promptTemplate || "").trim() || DEFAULT_PROMPT;
  await report("parse_master", "done");
  await report("parse_jd", "done");
  await report("title", "active");
  await report("header", "active");

  const vars = {
    job_requirement: input.jd.slice(0, 14000),
    vendor_context: `Vendor: ${input.vendorName}\nCandidate: ${input.candidateName}\nUS C2C SAP staffing`,
    candidate_master_resume: input.master.slice(0, 22000),
    candidate_name: input.candidateName,
    job_title: jobTitle,
    vendor_name: input.vendorName,
  };
  const system =
    fillPrompt(template, vars) +
    `\n\nOUTPUT: valid JSON only. Layout target: ${layout.name} (${layout.researchSpine}).
CRITICAL POLICY — HONEST, COHERENT CAREER (no invention):
- projects[] length MUST be ${Math.max(anchors.length, 1)} — every master employer.
- projects[0..${Math.max(0, (policy.recentTitleCount || 2) - 1)}] title = exact JD title "${jobTitle}".
- later projects: progressive variants of the SAME role family (not off-domain modules).
- Keep client/startYear/endYear/location exact from REQUIRED PROJECTS — never invent locations.
- Prefer REPHRASING master bullets toward JD language over inventing new work.
- EACH project/client MUST have 8–10 bullet achievements (never fewer than 8). Recent denser (10), mid ~9, early at least 8.
- Do NOT invent modules, tools, certifications, or deep ownership absent from MASTER and JD.
- JD-only skills (not in master): skills section / recent framing only — never claim early-career deep config of tools not in master.
- modules: short, era-appropriate — recent denser, early thinner; not the same long list on every job.
- Domain hint "${domain}" is for coherence (avoid FICO titles on EWM JDs) — NOT a license to generate a full canned specialty pack.
- No duplicate bullets. No industry meta lines. No name/email in summary.
- education/certifications: from master only.
- SUMMARY: one voice only (no third-person name line after an "Experienced …" opener). At most ONE tenure claim, using master career span only — never invent a second number (e.g. do not write both "25 years" and "27+ years"). Do not append keyword dumps ("Core focus includes…") or SAP go-live boilerplate (cutover/hypercare) when domain is not SAP implementation.
- HONESTY: Never claim years "in the Pharmaceutical / clinical / banking industry" unless MASTER text supports that industry. On low skill overlap, use transferable positioning only — do not invent a clinical/pharma career.`;

  // Prefer upload-time MasterProfile (richer than anchors alone)
  const storedProfile = parseStoredMasterProfile(input.masterProfileJson);
  const structuredMaster = storedProfile
    ? profileForAiPath(storedProfile)
    : {
        version: 1,
        engagementCount: anchors.length,
        skills: groundedPack.slice(0, 20),
        summaryLines: [] as string[],
        engagements: anchors.map((a) => ({
          i: a.i,
          client: a.client,
          location: a.location,
          startYear: a.startYear,
          endYear: a.endYear,
          title: a.masterTitle,
          masterBullets: a.masterBullets.slice(0, 12),
        })),
        warnings: [] as string[],
      };

  const user = `Generate a 4–5 page client-submittable resume as STRICT JSON.

CANDIDATE: ${input.candidateName}
JD TITLE (headline + first ${Math.max(1, policy.recentTitleCount || 2)} projects ONLY): ${jobTitle}
DOMAIN COHERENCE HINT (not a skill pack to invent): ${domain}
GROUNDED SKILLS (in JD and master — prefer these): ${groundedPack.slice(0, 16).join(", ") || "(derive carefully from master)"}
JD-ONLY SKILLS (ATS / recent only — do not invent deep early ownership): ${honest.jdOnly.slice(0, 12).join(", ") || "none"}
CRITICAL PHRASES FROM JD TEXT: ${critical.join(", ") || pack.slice(0, 8).join(", ")}
LAYOUT: ${layout.name} — ${layout.researchSpine}
SECTION ORDER: ${layout.sections
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order)
    .map((s) => s.heading)
    .join(" → ")}

=== STRUCTURED MASTER PROFILE (GROUND TRUTH — upload-time parse, ${structuredMaster.engagementCount} engagements) ===
Employers, dates, titles, environments, and masterBullets are FACTS. projects.length MUST equal ${Math.max(structuredMaster.engagementCount, 1)}.
DO NOT drop, merge, or invent employers. Reframe bullets toward JD language using masterBullets as source material.
Match engagement count to clients/employers exactly. Keep startYear/endYear/location exact.

${JSON.stringify(structuredMaster, null, 2).slice(0, 16000)}

=== JOB REQUIREMENT (JD) ===
${input.jd.slice(0, 10000)}

=== MASTER RESUME (raw context — profile above wins on facts) ===
${input.master.slice(0, 12000)}

Return JSON:
{
  "headline": "${jobTitle}",
  "summary": ["3-5 dense sentences, one voice, ONE years claim from master span, grounded in master + JD — no keyword-dump lines"],
  "skills": ["20-35 skills: grounded first, then JD keywords"],
  "impact": ["5-8 peak bullets grounded in master outcomes, JD language"],
  "methodology": ["3-5 delivery method lines"],
  "supportiveTitles": ["progressive variants of JD title only"],
  "projects": [
    {
      "i": 0,
      "title": "${jobTitle}",
      "client": "exact",
      "location": "exact from required (empty if unknown)",
      "startYear": 2024,
      "endYear": "Present",
      "modules": "era-appropriate tools from grounded/JD — not identical on every job",
      "environment": "tools",
      "bullets": ["8-10 achievements for THIS client — rephrase master; expand distinct outcomes; never invent employers or tools"]
    }
  ],
  "education": ["from master"],
  "certifications": ["from master only"]
}

projects.length MUST equal ${Math.max(structuredMaster.engagementCount || anchors.length, 1)}.
Every projects[i].bullets length MUST be 8–10 (minimum 8).
Titles: i=0,1 = "${jobTitle}"; i>=2 = progressive same-family titles — ban off-domain module titles.
Honesty > keyword stuffing.`;

  let tokensIn = 0;
  let tokensOut = 0;
  let modelUsed = cfg.model;
  let passes = 0;
  let parsed: AiResumeJson = { projects: [] };

  // Pass 1: generate
  passes++;
  await report("summary", "active");
  await report("skills", "active");
  await report("impact", "active");
  await report("projects_all", "active");
  const gen = await chatJson({
    system,
    user,
    model: cfg.model,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    temperature: 0.32,
  });
  parsed = gen.json;
  tokensIn += gen.tokensIn;
  tokensOut += gen.tokensOut;
  modelUsed = gen.model;
  await report("title", "done");
  await report("header", "done");
  await report("summary", "done");
  await report("skills", "done");
  await report("impact", "done");

  // Pass 2 if project count wrong OR any project has fewer than 8 bullets
  const thinProjects = (parsed.projects || []).filter(
    (p) => !Array.isArray(p.bullets) || p.bullets.length < 8
  );
  const needMoreProjects =
    anchors.length > 1 &&
    (!parsed.projects || parsed.projects.length < anchors.length);
  if ((needMoreProjects || thinProjects.length > 0) && passes < MAX_PASSES) {
    passes++;
    const fix = await chatJson({
      system,
      user: `Fix and return FULL JSON.
- projects.length MUST be ${anchors.length}. Clients: ${anchors.map((a) => a.client).join(" | ")}.
- EVERY project must have 8–10 bullets (you had thin: ${thinProjects.map((p) => `${p.client || p.i}:${p.bullets?.length || 0}`).join(", ") || "n/a"}).
- Expand by rephrasing distinct master achievements toward JD language — do not invent employers.
Prior JSON:
${gen.raw.slice(0, 12000)}`,
      model: cfg.model,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      temperature: 0.2,
    });
    parsed = fix.json;
    tokensIn += fix.tokensIn;
    tokensOut += fix.tokensOut;
    modelUsed = fix.model;
  }

  const contact = extractContactFromMaster(input.master, input.email);
  const contactLine =
    formatContactLine(contact) || input.email || contact.email || "";

  // Grounded first; pack already has masterOnly + light jdOnly — no third JD re-extract
  const aiSkills = asArr(parsed.skills).filter(
    (s) =>
      s.length > 1 && s.length < 70 && !isOffDomainText(s, domain, policy)
  );
  const skills = Array.from(
    new Set([...groundedPack, ...aiSkills, ...pack, ...critical])
  )
    .filter((s) => s.length > 1 && s.length < 70)
    .filter((s) => !isOffDomainText(s, domain, policy))
    .slice(0, 40);

  await report("projects_all", "active");
  await report("project_1", "active");
  let projects;
  try {
    projects = buildProjects({
      anchors,
      ai: parsed.projects || [],
      jobTitle,
      domain,
      groundedSkills: groundedPack,
      skills,
      supportiveTitles: asArr(parsed.supportiveTitles),
      policy,
    });
  } catch (e) {
    // One more AI pass focused only on bullet density, then hard-fail
    if (passes < Math.max(MAX_PASSES, 3)) {
      passes++;
      await report("projects_all", "active");
      const fixBullets = await chatJson({
        system,
        user: `MANDATORY: every project must have ${MIN_BULLETS_PER_PROJECT}–10 bullets. Return FULL JSON only.
Clients: ${anchors.map((a) => a.client).join(" | ")}.
Prior output was rejected for thin bullets. Expand each projects[i].bullets to at least ${MIN_BULLETS_PER_PROJECT} distinct achievements (rephrase master; do not invent employers).
Prior JSON:
${JSON.stringify(parsed).slice(0, 14000)}`,
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        temperature: 0.25,
      });
      parsed = fixBullets.json;
      tokensIn += fixBullets.tokensIn;
      tokensOut += fixBullets.tokensOut;
      modelUsed = fixBullets.model;
      projects = buildProjects({
        anchors,
        ai: parsed.projects || [],
        jobTitle,
        domain,
        groundedSkills: groundedPack,
        skills,
        supportiveTitles: asArr(parsed.supportiveTitles),
        policy,
      });
    } else {
      throw e;
    }
  }
  if (projects.length === 0) {
    throw new Error("AI resume has zero projects after merge — cannot deliver");
  }
  // Strip SAP ritual bullets on clinical packs; top up if scrub thins density
  projects = projects.map((p) => {
    let bullets = scrubSapRitualFromBullets(p.bullets || [], domain);
    if (bullets.length < MIN_BULLETS_PER_PROJECT) {
      const extra = domainProofBullets(
        domain,
        p.era === "recent" ? "recent" : p.era === "early" ? "early" : "mid",
        p.client,
        jobTitle,
        groundedPack.length ? groundedPack : skills,
        policy
      );
      const merged = dedupeBullets([...bullets, ...extra]).slice(
        0,
        Math.max(MIN_BULLETS_PER_PROJECT, policy.bullets.recent)
      );
      bullets = scrubSapRitualFromBullets(merged, domain);
    }
    return { ...p, bullets };
  });
  // Final hard gate before any layout/DOCX work
  assertMandatoryBulletDensity(projects, MIN_BULLETS_PER_PROJECT);
  await report("project_1", "done");
  await report("project_2", "done");
  await report("projects_rest", "done");
  await report("specialty", "active");

  const yearsHint = yearsFromMasterAndProjects(
    input.master,
    anchors.map((a) => a.startYear)
  );
  const coherentSkills = skills.slice(0, 28);

  const summary = buildCoherentSummary({
    candidateName: input.candidateName,
    jobTitle,
    domain,
    yearsHint,
    skills: coherentSkills,
    critical,
    aiSummary: asArr(parsed.summary).filter((s) => !/@/.test(s)),
    policy,
    master: input.master,
    lowOverlap,
  });

  let impact = asArr(parsed.impact)
    .filter((b) => !isNoisyBullet(b) && !isOffDomainText(b, domain, policy))
    .slice(0, 5);
  if (impact.length < 3) {
    impact = domainProofBullets(
      domain,
      "recent",
      projects[0]?.client || "clients",
      jobTitle,
      groundedPack.length ? groundedPack : coherentSkills,
      policy
    ).slice(0, 4);
  }

  // Education/certs: master-grounded only — never invent degrees/certs
  const masterLc = (input.master || "").toLowerCase();
  const educationFromAi = [
    ...asArr(parsed.education),
    ...asArr(parsed.certifications),
  ]
    .filter((line) => {
      const t = line.trim();
      if (t.length < 4 || t.length > 200) return false;
      const needle = t.toLowerCase().slice(0, Math.min(48, t.length));
      return masterLc.includes(needle);
    })
    .slice(0, 10);
  const education =
    educationFromAi.length > 0
      ? educationFromAi
      : extractEducationLinesFromMaster(input.master);

  await report("specialty", "done");
  await report("layout", "active");

  let structured = buildStructuredFromLayout({
    candidateName: input.candidateName,
    headline: jobTitle.slice(0, 120),
    contactLine,
    summaryLines: summary,
    skills: coherentSkills,
    impactLines: impact,
    methodologyLines: (() => {
      const fromAi = asArr(parsed.methodology).filter(
        (l) => !isOffDomainText(l, domain, policy)
      );
      return fromAi.length
        ? fromAi
        : policy.methodologyDefaults.slice(0, 5);
    })(),
    projects,
    // Empty is honest — omit section rather than invent "Bachelor's"
    educationLines: education,
    jobTitle,
    domain,
    yearsHint,
    layoutId: layout.id,
    vendorName: input.vendorName,
  });
  await report("layout", "done");
  await report("qa", "active");

  // One QA + scrub + optional keyword line + single ATS score
  const qa = qaAndRepairResume(structured);
  structured = scrubContradictionsInStructured(
    qa.fixed,
    domain,
    jobTitle,
    policy
  );
  let text = renderPlainFromStructured(structured);

  if (
    policy.specialtyInject &&
    !hasCriticalJdCoverage(text, critical, 0.35) &&
    critical.length >= 3
  ) {
    const inject = `JD keywords: ${critical.slice(0, 10).join(" · ")}`;
    structured.sections = structured.sections.map((sec) => {
      if (!/skill|matrix|competenc|stack|instrument|capability/i.test(sec.heading))
        return sec;
      if (sec.lines.some((l) => /JD keywords:/i.test(l))) return sec;
      return { ...sec, lines: [inject, ...sec.lines] };
    });
    text = renderPlainFromStructured(structured);
  }

  const ats = scoreResume({
    resumeText: text,
    jd: input.jd,
    jobTitle,
    recentProjectCount: Math.min(2, projects.length),
    temporalViolations: 0,
    earlyCareerOversell: false,
  });
  structured.meta.atsScore = ats.score;
  structured.meta.skillFingerprint = skillFingerprint(input.jd, jobTitle);
  structured.meta.jobTitle = jobTitle;
  await report("qa", "done");
  await report("rules", "active");

  const rulesGate = runRulesGate({
    text,
    structured,
    jd: input.jd,
    masterProjectCount: anchors.length,
    usedOpenAi: true,
    model: modelUsed,
    policy,
  });
  await report("rules", "done");

  structured.meta.progressiveNotes = [
    `AI ENGINE: OpenAI ${modelUsed}`,
    `Domain: ${domain} · Layout: ${layout.name}`,
    `Projects: ${projects.length}/${anchors.length || projects.length}`,
    `Honesty: grounded ${groundedPack.length} · JD-only ${honest.jdOnly.length} · years ${yearsHint || "unknown"}`,
    `Rules: ${rulesGate.pass ? "PASS" : "FAIL"} (${rulesGate.score}%)`,
    ...rulesGate.checks.filter((c) => !c.ok).map((c) => `FAIL ${c.id}: ${c.message}`),
    ...qa.issues.slice(0, 4).map((i) => `${i.code}: ${i.message}`),
  ];

  text += `\n\n— Role Forge AI · OPENAI · ${modelUsed} · Domain: ${domain} · Layout: ${layout.name} · Projects: ${projects.length}/${anchors.length || projects.length} · Rules: ${rulesGate.pass ? "PASS" : "FAIL"} · ATS: ${ats.score}/100 —\n`;

  return {
    structured,
    text,
    ats,
    usedLlm: true,
    model: modelUsed,
    tokensIn,
    tokensOut,
    promptVersionNote: "makeover: honest AI+rules+layout+gate",
    qaIssues: qa.issues,
    rulesGate,
    passes,
    matchGate: {
      pass: rulesGate.pass,
      reasons: rulesGate.checks.filter((c) => !c.ok).map((c) => c.message),
    },
  };
}
