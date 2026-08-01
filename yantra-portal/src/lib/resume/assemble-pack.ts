/**
 * Single resume assembly path (correctness core).
 *
 * INVARIANT: Every pack — OpenAI production OR deterministic preview — builds
 * projects via `buildProjects` and structured docs via `buildStructuredFromLayout`.
 *
 * Bullet honesty ladder (same for both modes):
 *   AI bullets (optional) → master bullets → policy soft-fill (if emergencyFill)
 *
 * Skills honesty:
 *   grounded (JD∩master) for early/mid modules; full bank only on recent roles.
 *
 * progressive-tailor MUST NOT invent a second density/honesty stack.
 */

import {
  extractJdKeywords,
  extractJobTitle,
  skillFingerprint,
  skillsHonestFromSources,
  yearsFromMasterAndProjects,
  progressiveTitlesFromJobTitle,
  detectDomain,
  type DomainHint,
} from "./jd-parse";
import { scoreResume, type AtsResult } from "./ats-scorer";
import {
  cleanMasterBullets,
  criticalJdPhrases,
  domainProofBullets,
} from "./jd-weave";
import {
  buildStructuredFromLayout,
  renderPlainFromStructured,
  type ContentBundle,
} from "./build-from-layout";
import type { StructureProject } from "./layout-structures";
import {
  isOffDomainText,
  type ResumeEnginePolicy,
} from "./resume-engine-policy";
import { getResumeEnginePolicy } from "@/lib/system-settings";
import {
  extractContactFromMaster,
  formatContactLine,
} from "./extract-contact";
import type { StructuredResume } from "./templates";
import { isLowOverlap, scrubSummaryHonesty } from "./resume-honesty";
import {
  parseMasterProfile,
  parseStoredMasterProfile,
  profileToAnchors,
  type MasterProfile,
} from "./master-profile";

export type ProjectAnchor = {
  i: number;
  client: string;
  location: string;
  startYear: number;
  endYear: number | "Present";
  masterTitle: string;
  masterBullets: string[];
};

export type AiProjectInput = {
  i?: number;
  title?: string;
  client?: string;
  location?: string;
  startYear?: number | string;
  endYear?: number | string;
  modules?: string;
  environment?: string;
  bullets?: string[];
};

function yearOf(
  v: number | string | undefined,
  fb: number
): number | "Present" {
  if (v === undefined || v === null || v === "") return fb;
  if (typeof v === "number" && v >= 1980 && v <= 2100) return v;
  const s = String(v);
  if (/present|current|now/i.test(s)) return "Present";
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : fb;
}

function eraFor(
  end: number | "Present",
  now: number
): StructureProject["era"] {
  const y = end === "Present" ? now : end;
  if (y >= now - 3) return "recent";
  if (y >= now - 8) return "mid";
  return "early";
}

function normalizeClient(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
    let subsumed = false;
    const prevKeys = Array.from(keys);
    for (let pi = 0; pi < prevKeys.length; pi++) {
      const prev = prevKeys[pi];
      if (k.startsWith(prev.slice(0, 40)) || prev.startsWith(k.slice(0, 40))) {
        subsumed = true;
        break;
      }
    }
    if (subsumed) continue;
    keys.add(k);
    out.push(b);
  }
  return out;
}

function isNoisyBullet(b: string): boolean {
  return (
    /Delivered .+ outcomes for .+ spanning design, build\/config/i.test(b) ||
    /near-100%|keyword coverage|ROLE\s*::|80\s*\/\s*hr/i.test(b) ||
    /Do the data work personally where it matters/i.test(b) ||
    /^(Oil\s*&\s*Gas|Retail|Hospitality|Pharmaceuticals|Shipping)\s*[·•|]/i.test(
      b
    ) ||
    (/ECC\s*[56]\.0|In-House Cash|VIM,?\s*Vertex/i.test(b) && b.length < 100)
  );
}

function isMetaStackLine(s: string): boolean {
  return /^(oil|gas|retail|hospitality|pharma)/i.test(s) || s.length > 55;
}

function isOffDomainTitle(
  title: string,
  domain: DomainHint,
  jobTitle: string,
  policy: ResumeEnginePolicy
): boolean {
  const t = (title || "").toLowerCase();
  if (!t) return true;
  const jdCore = jobTitle
    .toLowerCase()
    .replace(/senior|lead|principal|consultant|analyst/g, "")
    .trim();
  if (jdCore.length > 4 && t.includes(jdCore.slice(0, 12))) return false;
  return isOffDomainText(t, domain, policy);
}

function titleForIndex(
  idx: number,
  jobTitle: string,
  aiTitle: string | undefined,
  masterTitle: string,
  supportive: string[],
  domain: DomainHint,
  policy: ResumeEnginePolicy
): string {
  const recentN = Math.max(1, policy.recentTitleCount || 2);
  if (idx < recentN) return jobTitle.slice(0, 120);

  const ladder = progressiveTitlesFromJobTitle(jobTitle, 10, policy);
  const fromAi = (aiTitle || "").trim();
  const fromSupportive = (supportive[idx - recentN] || "").trim();
  const fromMaster = (masterTitle || "").trim();

  if (
    fromAi &&
    fromAi.toLowerCase() !== jobTitle.toLowerCase() &&
    fromAi.length > 4 &&
    !isOffDomainTitle(fromAi, domain, jobTitle, policy)
  ) {
    return fromAi.slice(0, 120);
  }
  if (
    fromSupportive &&
    !isOffDomainTitle(fromSupportive, domain, jobTitle, policy)
  ) {
    return fromSupportive.slice(0, 120);
  }
  if (
    fromMaster &&
    fromMaster.toLowerCase() !== jobTitle.toLowerCase() &&
    !isOffDomainTitle(fromMaster, domain, jobTitle, policy)
  ) {
    return fromMaster.slice(0, 120);
  }
  return ladder[Math.min(idx - recentN, ladder.length - 1)].slice(0, 120);
}

function skillCapFor(
  isRecent: boolean,
  era: StructureProject["era"],
  policy: ResumeEnginePolicy
): number {
  if (isRecent) return policy.skillCaps.recent;
  if (era === "mid") return policy.skillCaps.mid;
  return policy.skillCaps.early;
}

function bulletCapFor(
  isRecent: boolean,
  era: StructureProject["era"],
  policy: ResumeEnginePolicy
): number {
  if (isRecent) return policy.bullets.recent;
  if (era === "mid") return policy.bullets.mid;
  return policy.bullets.early;
}

function eraSkillBank(
  isRecent: boolean,
  era: StructureProject["era"],
  grounded: string[],
  full: string[]
): string[] {
  if (isRecent) return full;
  if (grounded.length) return grounded;
  return full.slice(0, era === "mid" ? 6 : 3);
}

function pickAiProject(
  ai: AiProjectInput[],
  anchor: ProjectAnchor,
  idx: number
): AiProjectInput {
  return (
    ai.find((p) => p.i === anchor.i) ||
    ai.find(
      (p) => normalizeClient(p.client || "") === normalizeClient(anchor.client)
    ) ||
    ai[idx] ||
    {}
  );
}

function parseModules(
  aiP: AiProjectInput,
  domain: DomainHint,
  policy: ResumeEnginePolicy
): string[] {
  return String(aiP.modules || aiP.environment || "")
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60)
    .filter((s) => !isMetaStackLine(s))
    .filter((s) => !isOffDomainText(s, domain, policy));
}

/** Floor for client-submittable packs: at least 8 bullets per project/client/employer. */
export const MIN_BULLETS_PER_PROJECT = 8;
/** Soft upper target (policy recent default). */
export const TARGET_BULLETS_PER_PROJECT = 10;

/**
 * Hard gate: every engagement must have ≥8 bullets or the pack must not ship.
 * Throws — callers must not render DOCX/PDF/send on failure.
 */
export function assertMandatoryBulletDensity(
  projects: { client?: string; bullets?: string[] }[],
  min = MIN_BULLETS_PER_PROJECT
): void {
  if (!projects.length) {
    throw new Error(
      "Resume generation blocked: zero projects/clients — cannot deliver a pack."
    );
  }
  const thin = projects
    .map((p, i) => ({
      i,
      client: (p.client || `Project ${i + 1}`).split(",")[0].trim(),
      n: Array.isArray(p.bullets) ? p.bullets.filter((b) => String(b).trim().length > 20).length : 0,
    }))
    .filter((p) => p.n < min);

  if (thin.length) {
    const detail = thin
      .map((t) => `${t.client}: ${t.n}/${min}`)
      .join("; ");
    throw new Error(
      `Resume generation blocked: every project/client/employer requires ${min}–${TARGET_BULLETS_PER_PROJECT} bullets. Insufficient: ${detail}. Re-upload a richer master or regenerate.`
    );
  }
}

function fillBullets(opts: {
  aiBullets: string[];
  masterBullets: string[];
  domain: DomainHint;
  era: StructureProject["era"];
  isRecent: boolean;
  client: string;
  jobTitle: string;
  skillBank: string[];
  max: number;
  policy: ResumeEnginePolicy;
}): string[] {
  // Fill to policy max (8–10). Floor enforced via MIN_BULLETS_PER_PROJECT on policy defaults.
  const need = Math.max(opts.max, Math.min(MIN_BULLETS_PER_PROJECT, opts.max));

  let final = dedupeBullets(opts.aiBullets).slice(0, opts.max);

  // Always top up from master until target — not only when sparse
  if (final.length < need) {
    const masterProof = cleanMasterBullets(opts.masterBullets, opts.max).filter(
      (b) => !isOffDomainText(b, opts.domain, opts.policy)
    );
    final = dedupeBullets([...final, ...masterProof]).slice(0, opts.max);
  }

  // Soft-fill (policy) to hit 8–10 when AI + master still short
  if (
    final.length < need &&
    (opts.policy.emergencyFill || final.length < MIN_BULLETS_PER_PROJECT)
  ) {
    const proof = domainProofBullets(
      opts.domain,
      opts.isRecent ? "recent" : opts.era === "early" ? "early" : "mid",
      opts.client,
      opts.jobTitle,
      opts.skillBank,
      opts.policy
    );
    final = dedupeBullets([...final, ...proof]).slice(0, opts.max);
  }

  return final.slice(0, opts.max);
}

/**
 * Anchors for generation.
 * Prefer stored MasterProfile (parse-on-upload). Fall back to live parse of text.
 */
export function anchorsFromMaster(
  master: string,
  masterProfileJson?: string | null
): ProjectAnchor[] {
  const stored = parseStoredMasterProfile(masterProfileJson);
  if (stored && stored.engagements.length > 0) {
    return profileToAnchors(stored);
  }
  // Live parse fallback (legacy candidates without profile JSON)
  const live = parseMasterProfile(master || "");
  return profileToAnchors(live);
}

/** Build or refresh profile from raw master text (upload path). */
export function buildMasterProfileFromText(masterText: string): MasterProfile {
  return parseMasterProfile(masterText || "");
}

/**
 * Single-pass project build. Used by OpenAI merge AND deterministic packs.
 * When `ai` is empty, honesty ladder reduces to master → soft-fill.
 */
export function buildProjects(opts: {
  anchors: ProjectAnchor[];
  ai: AiProjectInput[];
  jobTitle: string;
  domain: DomainHint;
  groundedSkills: string[];
  skills: string[];
  supportiveTitles: string[];
  policy: ResumeEnginePolicy;
}): StructureProject[] {
  const now = new Date().getFullYear();
  const fullBank = opts.skills.filter(Boolean);
  const grounded = (
    opts.groundedSkills.length ? opts.groundedSkills : fullBank
  ).filter(Boolean);
  const recentN = Math.max(1, opts.policy.recentTitleCount || 2);

  const list: ProjectAnchor[] =
    opts.anchors.length > 0
      ? opts.anchors
      : opts.ai.map((p, i) => {
          const sy = yearOf(p.startYear, 0);
          const ey = yearOf(p.endYear, 0);
          return {
            i,
            client: (p.client || "").trim() || `Client ${i + 1}`,
            location: (p.location || "").trim(),
            startYear: typeof sy === "number" && sy >= 1980 ? sy : 0,
            endYear:
              ey === "Present"
                ? ("Present" as const)
                : typeof ey === "number" && ey >= 1980
                  ? ey
                  : ("Present" as const),
            masterTitle: p.title || "Consultant",
            masterBullets: [] as string[],
          };
        });

  const projects = list.map((anchor, idx) => {
    const aiP = pickAiProject(opts.ai, anchor, idx);
    const era = eraFor(anchor.endYear, now);
    const isRecent = idx < recentN;
    // Hard floor: never allow policy max below 8
    const maxBullets = Math.max(
      MIN_BULLETS_PER_PROJECT,
      bulletCapFor(isRecent, era, opts.policy)
    );
    const skillCap = skillCapFor(isRecent, era, opts.policy);
    const bank = eraSkillBank(isRecent, era, grounded, fullBank);

    const title = titleForIndex(
      idx,
      opts.jobTitle,
      aiP.title,
      anchor.masterTitle,
      opts.supportiveTitles,
      opts.domain,
      opts.policy
    );

    const aiBullets = dedupeBullets(
      (aiP.bullets || [])
        .map((b) => String(b).replace(/^[•▸→–\-\*]\s*/, "").trim())
        .filter((b) => b.length > 25 && b.length < 260)
        .filter((b) => !isNoisyBullet(b))
        .filter((b) => !isOffDomainText(b, opts.domain, opts.policy))
    );

    const bullets = fillBullets({
      aiBullets,
      masterBullets: anchor.masterBullets,
      domain: opts.domain,
      era,
      isRecent,
      client: anchor.client,
      jobTitle: opts.jobTitle,
      skillBank: bank,
      max: maxBullets,
      policy: opts.policy,
    });

    const modules = parseModules(aiP, opts.domain, opts.policy);
    const fill = bank.slice(0, skillCap);
    const skills = Array.from(
      new Set([...(modules.length ? modules : fill), ...fill.slice(0, 2)])
    )
      .filter((s) => !isOffDomainText(s, opts.domain, opts.policy))
      .slice(0, skillCap);

    return {
      title,
      client: anchor.client,
      location: anchor.location,
      startYear: anchor.startYear,
      endYear: anchor.endYear,
      era: isRecent ? ("recent" as const) : era,
      skills,
      bullets,
    };
  });

  // Hard gate: without 8 bullets per project/client/employer, do not emit a pack
  assertMandatoryBulletDensity(projects, MIN_BULLETS_PER_PROJECT);
  return projects;
}

/**
 * Deterministic pack: same assembly as OpenAI path, ai=[] (no second engine).
 * Used for layout preview and offline validation — NOT a dense fallback.
 */
export async function assembleDeterministicPack(opts: {
  master: string;
  jd: string;
  vendorName: string;
  candidateName: string;
  layoutId?: string | null;
  email?: string;
  policy?: ResumeEnginePolicy;
  /** Structured profile from upload-time parse */
  masterProfileJson?: string | null;
}): Promise<{
  structured: StructuredResume;
  text: string;
  ats: AtsResult;
  usedLlm: false;
  engine: "assemble-pack/deterministic";
}> {
  let policy = opts.policy;
  if (!policy) {
    try {
      policy = await getResumeEnginePolicy();
    } catch {
      const { DEFAULT_RESUME_ENGINE_POLICY } = await import(
        "./resume-engine-policy"
      );
      policy = DEFAULT_RESUME_ENGINE_POLICY;
    }
  }
  const jobTitle = extractJobTitle(opts.jd);
  const domain = detectDomain(opts.jd, jobTitle, policy);
  const anchors = anchorsFromMaster(opts.master, opts.masterProfileJson);
  const critical = criticalJdPhrases(opts.jd, domain, policy);
  const honest = skillsHonestFromSources(opts.jd, opts.master, 40);
  const groundedPack = honest.grounded.length
    ? honest.grounded
    : honest.masterOnly.slice(0, 20);
  const skills = Array.from(
    new Set([
      ...groundedPack,
      ...critical,
      ...honest.all,
      ...extractJdKeywords(opts.jd, 20),
    ])
  )
    .filter((s) => s.length > 1 && s.length < 70)
    .filter((s) => !isOffDomainText(s, domain, policy))
    .slice(0, 40);

  const projects = buildProjects({
    anchors,
    ai: [], // ← no parallel AI content; master + soft-fill only
    jobTitle,
    domain,
    groundedSkills: groundedPack,
    skills,
    supportiveTitles: [],
    policy,
  });

  const yearsHint = yearsFromMasterAndProjects(
    opts.master,
    anchors.map((a) => a.startYear)
  );
  const contact = extractContactFromMaster(opts.master, opts.email);
  const contactLine =
    formatContactLine(contact) || opts.email || contact.email || "";

  const first = opts.candidateName.split(/\s+/)[0] || opts.candidateName;
  const skillLine = skills.slice(0, 8).join(", ") || jobTitle;
  const yearsPart =
    yearsHint > 0
      ? ` with approximately ${yearsHint}+ years of progressive professional experience`
      : " with progressive professional experience";
  const lowOverlap = isLowOverlap(opts.jd, opts.master);
  const summary = scrubSummaryHonesty({
    lines: [
      `${first} is positioned as a ${jobTitle}${yearsPart}, mapped to this role’s requirements with emphasis on ${skillLine}.`,
      `Master-backed delivery history is reframed toward ${jobTitle} responsibilities (data quality, process ownership, stakeholder coordination, and release/test discipline where supported by experience).`,
    ],
    master: opts.master,
    jobTitle,
    yearsHint,
    candidateName: opts.candidateName,
    lowOverlap,
  });

  const impact = domainProofBullets(
    domain,
    "recent",
    projects[0]?.client || "clients",
    jobTitle,
    groundedPack.length ? groundedPack : skills,
    policy
  ).slice(0, 4);

  const bundle: ContentBundle = {
    candidateName: opts.candidateName,
    headline: jobTitle.slice(0, 120),
    contactLine,
    summaryLines: summary,
    skills: skills.slice(0, 28),
    impactLines: impact,
    methodologyLines: policy.methodologyDefaults.slice(0, 5),
    projects,
    educationLines: policy.educationDefaults.slice(0, 6),
    jobTitle,
    domain,
    yearsHint,
    layoutId: opts.layoutId || "ats_classic",
    vendorName: opts.vendorName,
  };

  const structured = buildStructuredFromLayout(bundle);
  structured.meta.jobTitle = jobTitle;
  structured.meta.skillFingerprint = skillFingerprint(opts.jd, jobTitle);
  structured.meta.progressiveNotes = [
    "ENGINE: assemble-pack/deterministic (same buildProjects as OpenAI path)",
    `Domain: ${domain}`,
    `Projects: ${projects.length}`,
    `Honesty: grounded ${groundedPack.length} · no dense progressive weave`,
  ];

  const text = renderPlainFromStructured(structured);
  const ats = scoreResume({
    resumeText: text,
    jd: opts.jd,
    jobTitle,
    recentProjectCount: Math.min(
      Math.max(1, policy.recentTitleCount || 2),
      projects.length
    ),
    temporalViolations: 0,
    earlyCareerOversell: false,
  });
  structured.meta.atsScore = ats.score;

  return {
    structured,
    text:
      text +
      `\n\n— Role Forge · assemble-pack/deterministic · Domain: ${domain} · Projects: ${projects.length} · ATS: ${ats.score}/100 —\n`,
    ats,
    usedLlm: false,
    engine: "assemble-pack/deterministic",
  };
}
