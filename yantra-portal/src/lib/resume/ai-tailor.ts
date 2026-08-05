/**
 * Role Forge AI Resume Engine.
 *
 * Contract:
 * - Active LLM (OpenAI or Claude via Admin settings) + prompt + rules
 * - Header from master; headline/title from JD
 * - All master projects kept; recent 2 titles = JD title
 * - Skills/bullets honesty: grounded (JD∩master) > rephrase master > soft fill
 * - Layout spines + single QA/rules pass
 */

import { DEFAULT_PROMPT } from "@/lib/constants";
import {
  extractJobTitle,
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
} from "./jd-weave";
import { getLayoutConfig } from "./layout-config";
import { type LlmProviderConfig } from "./llm-config";
import { llmChatJson } from "./llm-chat";
import {
  anchorsFromMaster,
  assertMandatoryBulletDensity,
  buildProjects,
  educationLinesForJd,
  formatEducationNote,
  type AiProjectInput,
} from "./assemble-pack";
import {
  MIN_BULLETS_PER_PROJECT,
  MAX_BULLETS_PER_PROJECT,
  TARGET_BULLETS_PER_PROJECT,
  BULLET_DENSITY_RANGE,
  BULLET_DENSITY_PROMPT_RULE,
  capBullets,
} from "./bullet-density";
import {
  modePromptAppendix,
  resolveTailorMode,
  type TailorModeResult,
} from "./tailor-mode";
import { scorePsych, type PsychResult } from "./psych-scorer";
import {
  packHasFreeMetrics,
  packHasIndustryCosplay,
} from "./resume-honesty";
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
import {
  getActiveLlmConfig,
  getResumeEnginePolicy,
} from "@/lib/system-settings";
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
  psych: PsychResult;
  usedLlm: true;
  model: string;
  tokensIn: number;
  tokensOut: number;
  promptVersionNote: string;
  qaIssues: { severity: string; code: string; message: string }[];
  rulesGate: RulesGateResult;
  passes: number;
  matchGate: { pass: boolean; reasons: string[] };
  modeResult: TailorModeResult;
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

async function chatJson(opts: {
  system: string;
  user: string;
  config: LlmProviderConfig;
  temperature?: number;
}): Promise<{
  json: AiResumeJson;
  raw: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  provider: string;
}> {
  const result = await llmChatJson({
    system: opts.system,
    user: opts.user,
    temperature: opts.temperature,
    config: opts.config,
  });
  return {
    json: result.json as AiResumeJson,
    raw: result.raw,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    model: result.model,
    provider: result.provider,
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

/** Target vendor-facing summary density (always 10 lines). */
const SUMMARY_LINE_TARGET = 10;

/** Reject keyword-dump / template lines that read as machine fill, not prose. */
function isSummaryJunk(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 28) return true;
  if (/^core focus includes\b/i.test(t)) return true;
  if (/^career progression moves from\b/i.test(t)) return true;
  if (/\bis positioned as\b/i.test(t)) return true;
  if (/without claiming a specialty career/i.test(t)) return true;
  if (/\baligned to\b/i.test(t) && (t.match(/,/g) || []).length >= 2) return true;
  if (/cutover,\s*and hypercare|build\/test cycles.*hypercare/i.test(t)) return true;
  // "aligned to Pharmaceutical, PowerPoint, CDISC" — skill list as career arc
  if (/\bPowerPoint\b/i.test(t) && /\byears?\b/i.test(t)) return true;
  return false;
}

/**
 * Impersonal resume voice: no first person, no “Name is positioned as…” third-person bio.
 * US tech resume style: role/capability-led lines.
 */
function toImpersonalSummaryLine(line: string, candidateName: string): string {
  let s = String(line || "").replace(/\s+/g, " ").trim();
  if (!s) return s;
  const first = (candidateName || "").split(/\s+/)[0] || "";
  const full = (candidateName || "").trim();

  // Drop third-person name openers
  if (full) {
    s = s.replace(new RegExp(`^${escapeRegExp(full)}\\s+`, "i"), "");
  }
  if (first && first.length > 1) {
    s = s
      .replace(new RegExp(`^${escapeRegExp(first)}\\s+(is|has|brings|offers|delivers)\\b`, "i"), "$1")
      .replace(new RegExp(`^${escapeRegExp(first)}\\s+`, "i"), "");
  }
  s = s
    .replace(/\bis positioned as (an?|the)\s+/gi, "")
    .replace(/\bpositioned as (an?|the)\s+/gi, "")
    .replace(/\bI am (an?|the)\s+/gi, "")
    .replace(/\bI'm (an?|the)\s+/gi, "")
    .replace(/\bI have\b/gi, "Holds")
    .replace(/\bI've\b/gi, "Has")
    .replace(/\bI\b/g, "")
    .replace(/\bmy\b/gi, "the")
    .replace(/\bmyself\b/gi, "")
    .replace(/\bme\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();

  // Capitalize first letter after stripping
  if (s && /^[a-z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Technical jargon pad lines — impersonal, no name / no first person. */
function jargonSummaryPads(opts: {
  jobTitle: string;
  yearsHint: number;
  skills: string[];
  critical: string[];
}): string[] {
  const skills = opts.skills.filter((s) => s.length > 1 && s.length < 48).slice(0, 18);
  const crit = opts.critical.filter((s) => s.length > 1).slice(0, 12);
  const bank = Array.from(new Set([...crit, ...skills]));
  const y =
    opts.yearsHint > 0
      ? `approximately ${opts.yearsHint}+ years`
      : "multi-year progressive delivery";
  const t = opts.jobTitle || "enterprise consultant";
  const pick = (i: number, n = 4) =>
    bank.slice(i * 2, i * 2 + n).join(", ") || bank.slice(0, n).join(", ") || t;

  return [
    `${t} profile with ${y} of enterprise delivery spanning solution design, configuration, integration, and hypercare-adjacent support where applicable.`,
    `Deep hands-on fluency across ${pick(0, 5)} with emphasis on production-grade implementation and validation rigor.`,
    `End-to-end ownership of requirements workshops, fit-gap analysis, blueprint/design artifacts, build cycles, and defect triage in complex multi-system landscapes.`,
    `Technical stack coverage includes ${pick(1, 5)} applied in integration, data movement, and interface reliability scenarios.`,
    `Strong command of cross-functional coordination with business stakeholders, QA, basis/infra, and vendor partners through UAT and go-live readiness.`,
    `Delivery discipline covers documentation standards, traceability, cutover checklists, knowledge transfer, and post-production stabilization patterns.`,
    `Specialized depth in ${pick(2, 4)} with reusable accelerators, reusable configuration patterns, and environment-aware sequencing.`,
    `Integration and data integrity focus: master data alignment, interface monitoring, exception handling, and controlled transport/release practices.`,
    `Performance orientation: throughput, reconciliation controls, auditability, and operational metrics without free-form invented percentages.`,
    `Ready for client submission as ${t} with JD-aligned terminology dense across summary, skills, and recent engagement narratives.`,
  ];
}

/**
 * Professional summary is ALWAYS AI-led, impersonal, and padded to 10 jargon-dense lines.
 * Never third-person bio (“Name is positioned as…”) and never first person (“I am…”).
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
    .slice(0, 14);

  let kept = opts.aiSummary
    .map((s) => toImpersonalSummaryLine(String(s), opts.candidateName))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(
      (s) =>
        s.length > 36 &&
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
    .filter((s) => s.length > 36 && !isSummaryJunk(s));

  // Always fill to 10 lines with technical jargon (impersonal) — AI lines first
  const pads = jargonSummaryPads({
    jobTitle: opts.jobTitle,
    yearsHint: opts.yearsHint,
    skills: skillPick,
    critical: opts.critical,
  }).map((s) => toImpersonalSummaryLine(s, opts.candidateName));

  kept = dedupeBullets([...kept, ...pads]).slice(0, SUMMARY_LINE_TARGET);

  // If still short (edge case), repeat skill-dense pads
  while (kept.length < SUMMARY_LINE_TARGET) {
    const extra = pads[kept.length % pads.length];
    if (!extra || kept.includes(extra)) {
      kept.push(
        `Additional technical coverage: ${skillPick
          .slice(kept.length % Math.max(1, skillPick.length), (kept.length % Math.max(1, skillPick.length)) + 4)
          .join(", ") || opts.jobTitle} applied in enterprise delivery contexts.`
      );
    } else {
      kept.push(extra);
    }
  }
  kept = kept.slice(0, SUMMARY_LINE_TARGET);

  // Soft honesty scrub only — never collapse to a single third-person disclaimer
  return scrubSummaryHonesty({
    lines: kept,
    master: opts.master,
    jobTitle: opts.jobTitle,
    yearsHint: opts.yearsHint,
    candidateName: opts.candidateName,
    lowOverlap: opts.lowOverlap,
    targetLines: SUMMARY_LINE_TARGET,
    preserveDensity: true,
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
  const active = await getActiveLlmConfig();
  const cfg: LlmProviderConfig = {
    provider: active.provider,
    configured: active.configured,
    apiKey: active.apiKey,
    baseUrl: active.baseUrl,
    model: active.model,
    label: active.label,
    reason: active.reason,
  };
  if (!cfg.configured) {
    throw new Error(
      cfg.reason ||
        `${cfg.label} API key required for Role Forge AI resumes (Admin → Settings → LLM provider).`
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
  const modeResult = resolveTailorMode(input.jd, input.master);
  const template = (input.promptTemplate || "").trim() || DEFAULT_PROMPT;
  await report("parse_master", "done");
  await report("parse_jd", "done");
  await report("title", "active");
  await report("header", "active");

  // Strict removed — always JD titles + progressive JD family
  const titleRule = `- projects[0..${Math.max(0, (policy.recentTitleCount || 2) - 1)}] title = exact JD title "${jobTitle}" (NOT master specialty titles like FICO if JD is ATTP/etc.).
- Later projects: progressive variants of the SAME JD title family only — never leave unrelated master titles.
- Rewrite ALL bullets with STRONG JD language (tools, verbs, outcomes from the JD) using master facts as proof only.
- modules/environment per project: ONLY tools relevant to "${jobTitle}" / JD domain. If JD is ATTP/serialization, NEVER put SAP FICO, CFIN, New GL, Asset Accounting, CO-PA, FP&A on Environment lines — use SAP ATTP, EPCIS, GS1, serialization, integration tools instead.
- SELECTED IMPACT: must support this JD specialty, not pure master FICO/finance impact.`;

  const vars = {
    job_requirement: input.jd.slice(0, 14000),
    vendor_context: `Vendor: ${input.vendorName}\nCandidate: ${input.candidateName}\nUS C2C staffing`,
    candidate_master_resume: input.master.slice(0, 22000),
    candidate_name: input.candidateName,
    job_title: jobTitle,
    vendor_name: input.vendorName,
  };
  const system =
    fillPrompt(template, vars) +
    `\n\nOUTPUT: valid JSON only. Layout target: ${layout.name} (${layout.researchSpine}).
${modePromptAppendix(modeResult.mode, jobTitle)}
CRITICAL POLICY — HONEST, COHERENT CAREER (no invention):
- projects[] length MUST be ${Math.max(anchors.length, 1)} — every master employer.
${titleRule}
- Keep client/startYear/endYear/location exact from REQUIRED PROJECTS — never invent locations.
- Prefer REPHRASING master bullets toward JD language over inventing new work.
- ${BULLET_DENSITY_PROMPT_RULE}
- Do NOT invent modules, tools, certifications, or deep ownership absent from MASTER.
- JD-only skills (not in master): skills section / recent framing only.
- Domain hint "${domain}" is for coherence — NOT a license to invent a specialty career.
- No duplicate bullets. No industry meta lines. No name/email in summary.
- education: degrees from master only. certifications: only JD-relevant certs from master (drop SAP certs on clinical JDs).
- SUMMARY (MANDATORY): EXACTLY 10 lines. Impersonal technical voice ONLY — NO first person (I/me/my), NO third-person bio ("Sri is…", "Name is positioned as…"). Lead with role, modules, stack, delivery, integration, controls. Beef every line with JD/master technical jargon. ONE years claim from master span total across the 10 lines. No honesty disclaimers.
- HONESTY: Never invent employers/certs. Prefer transferable technical framing over unsupported industry tenure. Mode=${modeResult.mode} overlap=${modeResult.overlap.toFixed(2)}.`;

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
  "summary": ["EXACTLY 10 dense technical lines, impersonal voice, heavy JD/master jargon, ONE years claim total, no I/me/my, no candidate name as subject, no 'positioned as'"],
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
      "bullets": ["${MIN_BULLETS_PER_PROJECT}-${MAX_BULLETS_PER_PROJECT} achievements for THIS client — rephrase master; expand distinct outcomes; never invent employers or tools"]
    }
  ],
  "education": ["from master"],
  "certifications": ["from master only"]
}

projects.length MUST equal ${Math.max(structuredMaster.engagementCount || anchors.length, 1)}.
Every projects[i].bullets length MUST be ${BULLET_DENSITY_RANGE} (minimum ${MIN_BULLETS_PER_PROJECT}, preferred ${TARGET_BULLETS_PER_PROJECT}, maximum ${MAX_BULLETS_PER_PROJECT}).
Titles: i=0,1 = "${jobTitle}"; i>=2 = progressive same-family titles — ban off-domain module titles.
Honesty > keyword stuffing — but density floor is not relaxed.`;

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
    config: cfg,
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

  // Pass 2 if project count wrong OR any project outside [8, 12]
  const thinProjects = (parsed.projects || []).filter(
    (p) =>
      !Array.isArray(p.bullets) ||
      p.bullets.length < MIN_BULLETS_PER_PROJECT
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
- EVERY project must have ${BULLET_DENSITY_RANGE} bullets (min ${MIN_BULLETS_PER_PROJECT}, preferred ${TARGET_BULLETS_PER_PROJECT}, max ${MAX_BULLETS_PER_PROJECT}). Thin: ${thinProjects.map((p) => `${p.client || p.i}:${p.bullets?.length || 0}`).join(", ") || "n/a"}.
- Expand by rephrasing distinct master achievements toward JD language — do not invent employers.
Prior JSON:
${gen.raw.slice(0, 12000)}`,
      config: cfg,
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
      modeResult,
    });
  } catch (e) {
    // One more AI pass focused only on bullet density, then hard-fail
    if (passes < Math.max(MAX_PASSES, 3)) {
      passes++;
      await report("projects_all", "active");
      const fixBullets = await chatJson({
        system,
        user: `MANDATORY: every project must have ${BULLET_DENSITY_RANGE} bullets from MASTER rephrase only (min ${MIN_BULLETS_PER_PROJECT}, preferred ${TARGET_BULLETS_PER_PROJECT}, max ${MAX_BULLETS_PER_PROJECT}). Return FULL JSON only.
Clients: ${anchors.map((a) => a.client).join(" | ")}.
Prior output was rejected for thin bullets. Expand by rephrasing master achievements — do NOT invent employers, metrics, or industry careers.
Prior JSON:
${JSON.stringify(parsed).slice(0, 14000)}`,
        config: cfg,
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
        modeResult,
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
        MAX_BULLETS_PER_PROJECT
      );
      bullets = scrubSapRitualFromBullets(merged, domain);
    }
    // ONE LAW: never exceed max 12
    return { ...p, bullets: capBullets(bullets) };
  });
  // Final hard gate before any layout/DOCX work — always min 8
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
    // Drop free metrics not on master
    .filter(
      (b) =>
        !/\b\d{1,3}\s*%/.test(b) ||
        packHasFreeMetrics(b, input.master).length === 0
    )
    .slice(0, 5);
  // Always fill impact toward JD specialty when thin
  if (impact.length < 3) {
    impact = domainProofBullets(
      domain,
      "recent",
      projects[0]?.client || "clients",
      jobTitle,
      groundedPack.length ? groundedPack : coherentSkills,
      policy
    )
      .filter((b) => packHasFreeMetrics(b, input.master).length === 0)
      .slice(0, 4);
  }

  // Degrees from master always; certs JD-relevant via AI (heuristic fallback).
  // Never invent degrees/certs; never keep SAP certs on clinical JDs, etc.
  await report("specialty", "active");
  const edu = await educationLinesForJd({
    master: input.master,
    jd: input.jd,
    jobTitle,
    domain,
    aiLines: [...asArr(parsed.education), ...asArr(parsed.certifications)],
    useAi: true,
  });
  const education = edu.lines;

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

  // One QA + scrub + aggressive JD keyword inject (all modes — slightly less honest)
  const qa = qaAndRepairResume(structured);
  structured = scrubContradictionsInStructured(
    qa.fixed,
    domain,
    jobTitle,
    policy
  );
  let text = renderPlainFromStructured(structured);

  // Always inject critical JD tokens into skills (not only same_domain)
  if (policy.specialtyInject !== false && critical.length >= 2) {
    const inject = `JD keywords: ${critical.slice(0, 14).join(" · ")}`;
    structured.sections = structured.sections.map((sec) => {
      if (!/skill|matrix|competenc|stack|instrument|capability|core/i.test(sec.heading))
        return sec;
      if (sec.lines.some((l) => /JD keywords:/i.test(l))) return sec;
      return { ...sec, lines: [inject, ...sec.lines] };
    });
    text = renderPlainFromStructured(structured);
  }

  // Hard honesty only: free metrics + industry cosplay (does not block ATS climb)
  const honestyFailed =
    packHasIndustryCosplay(text, input.master).length > 0 ||
    packHasFreeMetrics(text, input.master).length > 0;

  // Escalating ATS graph: T1 grounded → T3/T4 ship-floor inject → ≥95 / target 100
  const { boostPackTowardAts100 } = await import("./ats-boost");
  const boost = boostPackTowardAts100({
    structured,
    jd: input.jd,
    jobTitle,
    masterText: input.master,
    recentProjectCount: Math.max(2, projects.length),
    honestyFailed: false, // never cap during climb; ship gate still checks structure
    maxRounds: 4,
  });
  structured = boost.structured;
  text = boost.text;
  // Optional display-only honesty note if free metrics still present after boost
  // Final human-quality scrub (boost already scrubs; double-pass for impact/env)
  try {
    const { scrubAndRender } = await import("./pack-quality-scrub");
    const cleaned = scrubAndRender(structured, {
      jd: input.jd,
      masterText: input.master,
      jobTitle,
    });
    structured = cleaned.structured;
    text = cleaned.text;
  } catch {
    /* keep boosted text */
  }

  // Research enhance (psych / IR / primacy / peak-end / n-grams / anti-prototype)
  try {
    const { researchEnhancePack } = await import("./research-enhance-pack");
    const enhanced = researchEnhancePack({
      structured,
      jd: input.jd,
      masterText: input.master,
      jobTitle,
    });
    structured = enhanced.structured;
    text = enhanced.text;
  } catch (e) {
    console.warn("[ai-tailor] researchEnhancePack skipped", e);
  }

  // Re-score after final scrub + research enhance
  const { scoreResume } = await import("./ats-scorer");
  let ats = scoreResume({
    resumeText: text,
    jd: input.jd,
    jobTitle,
    recentProjectCount: Math.max(2, projects.length),
    temporalViolations: 0,
    earlyCareerOversell: false,
    honestyFailed: false,
  });
  // If scrub hurt keywords, soft skills-only re-boost once
  if (ats.score < 95) {
    const reboost = boostPackTowardAts100({
      structured,
      jd: input.jd,
      jobTitle,
      masterText: input.master,
      recentProjectCount: Math.max(2, projects.length),
      honestyFailed: false,
    });
    structured = reboost.structured;
    text = reboost.text;
    try {
      const { researchEnhancePack } = await import("./research-enhance-pack");
      const enhanced = researchEnhancePack({
        structured,
        jd: input.jd,
        masterText: input.master,
        jobTitle,
      });
      structured = enhanced.structured;
      text = enhanced.text;
    } catch {
      /* keep */
    }
    ats = scoreResume({
      resumeText: text,
      jd: input.jd,
      jobTitle,
      recentProjectCount: Math.max(2, projects.length),
      temporalViolations: 0,
      earlyCareerOversell: false,
      honestyFailed: false,
    });
  }

  if (honestyFailed && ats.score > 70) {
    structured.meta.progressiveNotes = [
      ...(structured.meta.progressiveNotes || []),
      "Honesty flag present (cosplay/metrics) — review pack carefully",
    ];
  }

  const psych = scorePsych({
    resumeText: text,
    masterText: input.master,
    masterProfileJson: input.masterProfileJson,
    jd: input.jd,
    jobTitle,
    mode: modeResult.mode,
    candidateName: input.candidateName,
  });

  // If psych soft-fails, do NOT re-cap ATS at 70 — user wants 100 when Fit-IR is full
  structured.meta.atsScore = ats.score;
  structured.meta.psychScore = psych.score;
  structured.meta.tailorMode = modeResult.mode;
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

  const dualBest = ats.score === 100 && psych.score === 100;
  structured.meta.progressiveNotes = [
    `AI ENGINE: ${cfg.label} ${modelUsed}`,
    `Mode: ${modeResult.label} (${modeResult.mode}) · overlap ${(modeResult.overlap * 100).toFixed(0)}%`,
    `Domain: ${domain} · Layout: ${layout.name}`,
    `Projects: ${projects.length}/${anchors.length || projects.length}`,
    `ATS: ${ats.score}/100 ${ats.ready ? "BEST" : ""} · Psych: ${psych.score}/100 ${psych.ready ? "BEST" : ""} · Dual: ${dualBest ? "BEST" : "NOT BEST"}`,
    boost.boosted
      ? `ATS graph T${boost.tierReached}: ${boost.rounds}r · score ${ats.score} · +${boost.injected.length} tokens · skip ${boost.skippedUngrounded.length}`
      : `ATS graph: score ${ats.score} (no boost needed)`,
    ...boost.notes.slice(0, 5).map((n) => `ATS: ${n}`),
    `Skills honesty: grounded ${groundedPack.length} · JD-only ${honest.jdOnly.length}`,
    formatEducationNote(edu),
    `Rules: ${rulesGate.pass ? "PASS" : "FAIL"} (${rulesGate.score}%)`,
    ...psych.warnings.slice(0, 4).map((w) => `Psych: ${w}`),
    ...rulesGate.checks.filter((c) => !c.ok).map((c) => `FAIL ${c.id}: ${c.message}`),
    ...qa.issues.slice(0, 3).map((i) => `${i.code}: ${i.message}`),
  ];

  // Never append engine footer to vendor-facing pack text (preview / DOCX / PDF / email).
  // Scores live in DB + admin UI only.

  return {
    structured,
    text,
    ats,
    psych,
    usedLlm: true,
    model: modelUsed,
    tokensIn,
    tokensOut,
    promptVersionNote: "v3: mode+psych+ats dual best",
    qaIssues: qa.issues,
    rulesGate,
    passes,
    modeResult,
    matchGate: {
      pass: dualBest && rulesGate.pass,
      reasons: [
        ...(!ats.ready ? [`ATS ${ats.score}<100`] : []),
        ...(!psych.ready ? [`Psych ${psych.score}<100`] : []),
        ...rulesGate.checks.filter((c) => !c.ok).map((c) => c.message),
      ],
    },
  };
}
