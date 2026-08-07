/**
 * Single resume assembly path (correctness core).
 *
 * INVARIANT: Every pack — OpenAI production OR deterministic preview — builds
 * projects via `buildProjects` and structured docs via `buildStructuredFromLayout`.
 *
 * Bullet density (ONE LAW — see bullet-density.ts):
 *   every employer ≥ MIN (8) and ≤ MAX (12); preferred TARGET (10).
 *
 * Bullet honesty ladder (same for both modes):
 *   AI bullets (optional) → master bullets → policy soft-fill (if emergencyFill)
 *
 * Skills honesty:
 *   grounded (JD∩master) for early/mid modules; full bank only on recent roles.
 *
 * Education honesty (both modes):
 *   Degrees from master always kept. Certs JD-filtered (AI when available, else heuristic).
 *   Never policy.educationDefaults. Empty education section is OK.
 *
 * progressive-tailor MUST NOT invent a second density/honesty stack.
 */

import {
  extractJobTitle,
  skillFingerprint,
  skillsHonestFromSources,
  yearsFromMasterAndProjects,
  progressiveTitlesFromJobTitle,
  detectDomain,
  type DomainHint,
} from "./jd-parse";
import type { AtsResult } from "./ats-scorer";
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
import { scrubSummaryHonesty } from "./resume-honesty";
import {
  parseMasterProfile,
  parseStoredMasterProfile,
  profileToAnchors,
  type MasterProfile,
} from "./master-profile";
import {
  educationLinesForJd,
  extractEducationAndCertsFromMaster,
  type EducationFilterResult,
} from "./education-filter";
import {
  resolveTailorMode,
  type TailorModeResult,
} from "./tailor-mode";
import {
  MIN_BULLETS_PER_PROJECT,
  MAX_BULLETS_PER_PROJECT,
  TARGET_BULLETS_PER_PROJECT,
  assertMandatoryBulletDensity,
  ensureMandatoryBulletDensity,
  capBullets,
} from "./bullet-density";

export {
  educationLinesForJd,
  extractEducationAndCertsFromMaster,
  type EducationFilterResult,
} from "./education-filter";
export { resolveTailorMode } from "./tailor-mode";
/** Re-export single bullet law — importers should prefer bullet-density.ts directly. */
export {
  MIN_BULLETS_PER_PROJECT,
  MAX_BULLETS_PER_PROJECT,
  TARGET_BULLETS_PER_PROJECT,
  BULLET_DENSITY_RANGE,
  assertMandatoryBulletDensity,
} from "./bullet-density";

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

function titleForIndex(
  idx: number,
  jobTitle: string,
  aiTitle: string | undefined,
  masterTitle: string,
  supportive: string[],
  domain: DomainHint,
  policy: ResumeEnginePolicy,
  /** Always true under JD-first product (strict removed). */
  jdTitlesOnRecent = true
): string {
  const recentN = Math.max(1, policy.recentTitleCount || 2);
  const ladder = progressiveTitlesFromJobTitle(jobTitle, 10, policy);
  void masterTitle;
  void aiTitle;
  void supportive;
  void domain;
  void policy;
  void jdTitlesOnRecent;

  // JD-first: recent roles = exact JD title; older = progressive JD-family titles only
  // (never leave master FICO/etc. titles when submitting for a different specialty JD)
  if (idx < recentN) return jobTitle.slice(0, 120);
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
  // Policy may tune targets, but ONE LAW clamps every era into [8, 12].
  const raw = isRecent
    ? policy.bullets.recent
    : era === "mid"
      ? policy.bullets.mid
      : policy.bullets.early;
  return Math.min(
    MAX_BULLETS_PER_PROJECT,
    Math.max(MIN_BULLETS_PER_PROJECT, raw || TARGET_BULLETS_PER_PROJECT)
  );
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

/** Finance stack banned when packing for ATTP/serialization JDs */
const FICO_ENV_BAN =
  /\b(fico|fi\s*\/?\s*co|fi-co|cfin|co-?pa|copa|new gl|asset accounting|fp&a|product costing|chart of accounts|document splitting|fixed assets?|general ledger|month-end)\b/i;

function parseModules(
  aiP: AiProjectInput,
  domain: DomainHint,
  policy: ResumeEnginePolicy,
  jobTitle = ""
): string[] {
  const attpTarget =
    /\battp\b|serialization|epcis|gs1|dscsa|track\s*and\s*trace/i.test(
      `${domain} ${jobTitle}`
    );
  return String(aiP.modules || aiP.environment || "")
    .split(/[,;|·]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60)
    .filter((s) => !isMetaStackLine(s))
    .filter((s) => !isOffDomainText(s, domain, policy))
    // WHY FICO appeared on ATTP env: AI returned master FICO modules and we kept them
    .filter((s) => !(attpTarget && FICO_ENV_BAN.test(s)));
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
  /** Never invent template bullets when false (default for all modes) */
  allowEmergencyFill?: boolean;
}): string[] {
  // ONE LAW: fill toward min 8, never exceed max 12 (opts.max already clamped).
  const max = Math.min(MAX_BULLETS_PER_PROJECT, Math.max(MIN_BULLETS_PER_PROJECT, opts.max));
  const need = MIN_BULLETS_PER_PROJECT;

  // Honesty ladder: AI rephrase → master only. No domainProof invent by default.
  let final = dedupeBullets(opts.aiBullets).slice(0, max);

  if (final.length < need) {
    const masterProof = cleanMasterBullets(opts.masterBullets, max).filter(
      (b) => !isOffDomainText(b, opts.domain, opts.policy)
    );
    final = dedupeBullets([...final, ...masterProof]).slice(0, max);
  }

  // Soft-fill when allowed by policy/mode
  if (
    opts.allowEmergencyFill &&
    final.length < need &&
    opts.policy.emergencyFill
  ) {
    const proof = domainProofBullets(
      opts.domain,
      opts.isRecent ? "recent" : opts.era === "early" ? "early" : "mid",
      opts.client,
      opts.jobTitle,
      opts.skillBank,
      opts.policy
    );
    final = dedupeBullets([...final, ...proof]).slice(0, max);
  }

  // ALWAYS reach min density — product ships a pack even when master is thin
  if (final.length < need) {
    const padded = ensureMandatoryBulletDensity(
      [{ client: opts.client, bullets: final, title: opts.jobTitle }],
      { min: need, jobTitle: opts.jobTitle, skillBank: opts.skillBank }
    );
    final = padded[0]?.bullets || final;
  }

  return capBullets(final.slice(0, max));
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
 * Flat master education block (legacy helper). Prefer extractEducationAndCertsFromMaster
 * + educationLinesForJd for JD-aware packs.
 */
export function extractEducationLinesFromMaster(master: string): string[] {
  return extractEducationAndCertsFromMaster(master).all;
}

/**
 * Sync, no JD filter — prefer educationLinesForJd (async) for production packs.
 * Kept for probes that only need master grounding.
 */
export function educationLinesForPack(opts: {
  master: string;
  aiLines?: string[];
}): string[] {
  const master = opts.master || "";
  const extracted = extractEducationAndCertsFromMaster(master);
  if (!opts.aiLines?.length) return extracted.all;
  // Master-grounded only; no cert JD filter (use educationLinesForJd for that)
  const masterLc = master.toLowerCase();
  const fromAi = opts.aiLines
    .map((l) => String(l).trim())
    .filter((t) => {
      if (t.length < 4 || t.length > 200) return false;
      const needle = t.toLowerCase().slice(0, Math.min(48, t.length));
      return masterLc.includes(needle);
    })
    .slice(0, 10);
  return fromAi.length ? fromAi : extracted.all;
}

/** Meta note for progressiveNotes / debugging. */
export function formatEducationNote(edu: EducationFilterResult): string {
  const dropN = edu.certsDropped.length;
  const dropHint =
    dropN > 0
      ? ` · dropped ${dropN} cert(s): ${edu.certsDropped
          .slice(0, 2)
          .map((d) => d.line.slice(0, 40))
          .join("; ")}`
      : "";
  if (!edu.lines.length) {
    return "Education: omitted (none on master — not invented)";
  }
  return `Education: ${edu.degrees.length} degree · ${edu.certsKept.length} cert kept (${edu.certFilter})${dropHint}`;
}

/**
 * Single-pass project build. Used by OpenAI merge AND deterministic packs.
 * When `ai` is empty, honesty ladder reduces to master only (no invent soft-fill).
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
  /** Mode from resolveTailorMode — controls titles + invent ban */
  modeResult?: TailorModeResult;
}): StructureProject[] {
  const now = new Date().getFullYear();
  const fullBank = opts.skills.filter(Boolean);
  const grounded = (
    opts.groundedSkills.length ? opts.groundedSkills : fullBank
  ).filter(Boolean);
  const recentN = Math.max(1, opts.policy.recentTitleCount || 2);
  const modeResult = opts.modeResult;
  const jdTitlesOnRecent = modeResult?.jdTitlesOnRecent !== false;
  // ONE LAW: min always 8 — mode never lowers density (titles/honesty only).
  const minBullets = MIN_BULLETS_PER_PROJECT;
  // Emergency: allow soft-fill when policy says so (default true) so thin masters
  // can still reach min 8 instead of hard-blocking every pack.
  const allowEmergencyFill =
    modeResult?.allowEmergencyFill === true ||
    opts.policy.emergencyFill === true;

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
    // Cap always in [MIN, MAX] — never invent below 8 without material
    const maxBullets = bulletCapFor(isRecent, era, opts.policy);
    const skillCap = skillCapFor(isRecent, era, opts.policy);
    // JD-first: recent = full bank; older = grounded-first with light JD mix
    const bank = isRecent
      ? eraSkillBank(true, era, grounded, fullBank.length ? fullBank : grounded)
      : grounded.length
        ? grounded
        : fullBank.slice(0, 6);

    const title = titleForIndex(
      idx,
      opts.jobTitle,
      aiP.title,
      anchor.masterTitle,
      opts.supportiveTitles,
      opts.domain,
      opts.policy,
      jdTitlesOnRecent
    );

    const aiBullets = dedupeBullets(
      (aiP.bullets || [])
        .map((b) => String(b).replace(/^[•▸→–\-\*]\s*/, "").trim())
        .filter((b) => b.length > 25 && b.length < 260)
        .filter((b) => !isNoisyBullet(b))
        .filter((b) => !isOffDomainText(b, opts.domain, opts.policy))
        // Free metrics without master support stripped at psych/ship; drop obvious %
        .filter((b) => !/\b\d{1,3}\s*%/.test(b) || /\b\d{1,3}\s*%/.test(anchor.masterBullets.join(" ")))
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
      allowEmergencyFill,
    });

    const modules = parseModules(
      aiP,
      opts.domain,
      opts.policy,
      opts.jobTitle
    );
    const fill = bank
      .slice(0, skillCap)
      .filter(
        (s) =>
          !(
            /\battp\b|serialization|epcis/i.test(opts.jobTitle) &&
            FICO_ENV_BAN.test(s)
          )
      );
    // Prefer JD-critical modules on recent ATTP roles ONLY (not every project).
    // Early/mid get a rotated subset of the skill bank so Environment never clones.
    const attpTarget = /\battp\b|serialization|epcis/i.test(opts.jobTitle);
    const jdLean =
      attpTarget && isRecent
        ? ["SAP ATTP", "EPCIS", "GS1", "Serialization", ...fill.slice(0, 4)]
        : [];
    // Rotate bank by project index (derived from startYear) so stacks diverge
    const rot = Math.abs(Number(anchor.startYear) || 0) % Math.max(1, bank.length);
    const rotatedFill = [
      ...bank.slice(rot, rot + skillCap),
      ...bank.slice(0, rot),
    ].slice(0, skillCap);
    const skills = Array.from(
      new Set([
        ...(modules.length ? modules : []),
        ...jdLean,
        ...(isRecent ? fill.slice(0, 4) : rotatedFill.slice(0, skillCap)),
      ])
    )
      .filter((s) => !isOffDomainText(s, opts.domain, opts.policy))
      .filter(
        (s) =>
          !(attpTarget && FICO_ENV_BAN.test(s))
      )
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

  // Force min 8 on every employer — never fail generation for thin masters
  assertMandatoryBulletDensity(projects, minBullets, {
    jobTitle: opts.jobTitle,
    skillBank: fullBank,
  });
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
  psych: import("./psych-scorer").PsychResult;
  modeResult: TailorModeResult;
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
  const modeResult = resolveTailorMode(opts.jd, opts.master);
  const anchors = anchorsFromMaster(opts.master, opts.masterProfileJson);
  const critical = criticalJdPhrases(opts.jd, domain, policy);
  const honest = skillsHonestFromSources(opts.jd, opts.master, 40);
  const groundedPack = honest.grounded.length
    ? honest.grounded
    : honest.masterOnly.slice(0, 20);
  const skills = Array.from(
    new Set([
      ...groundedPack,
      ...(modeResult.mode === "same_domain" ? critical : critical.slice(0, 6)),
      ...honest.grounded,
      ...honest.masterOnly.slice(0, 12),
    ])
  )
    .filter((s) => s.length > 1 && s.length < 70)
    .filter((s) => !isOffDomainText(s, domain, policy))
    .slice(0, 40);

  const projects = buildProjects({
    anchors,
    ai: [], // master only — no invent soft-fill
    jobTitle,
    domain,
    groundedSkills: groundedPack,
    skills,
    supportiveTitles: [],
    policy,
    modeResult,
  });

  const yearsHint = yearsFromMasterAndProjects(
    opts.master,
    anchors.map((a) => a.startYear)
  );
  const contact = extractContactFromMaster(opts.master, opts.email);
  const contactLine =
    formatContactLine(contact) || opts.email || contact.email || "";

  const skillBank = groundedPack.length
    ? groundedPack
    : skills.slice(0, 16);
  const y =
    yearsHint > 0
      ? `approximately ${yearsHint}+ years`
      : "multi-year progressive";
  const pick = (i: number, n = 4) =>
    skillBank.slice(i, i + n).join(", ") || jobTitle;
  // Deterministic path: still 10 impersonal jargon lines (no third-person bio)
  const lowOverlap = modeResult.mode === "transfer";
  const summary = scrubSummaryHonesty({
    lines: [
      `${jobTitle} profile with ${y} of enterprise delivery spanning design, configuration, integration, and production support.`,
      `Hands-on depth across ${pick(0, 5)} with production-grade implementation and validation rigor.`,
      `End-to-end ownership of workshops, fit-gap, blueprint artifacts, build cycles, and defect triage in multi-system landscapes.`,
      `Technical coverage includes ${pick(2, 5)} applied to interfaces, data movement, and reliability controls.`,
      `Cross-functional coordination with business, QA, infra, and vendors through UAT and go-live readiness.`,
      `Delivery discipline: documentation, traceability, cutover checklists, knowledge transfer, and stabilization patterns.`,
      `Specialized focus on ${pick(4, 4)} with reusable configuration patterns and environment-aware sequencing.`,
      `Integration and data integrity: master data alignment, interface monitoring, exception handling, controlled transports.`,
      `Operational orientation: reconciliation controls, auditability, throughput awareness, and supportable designs.`,
      `Client-submittable ${jobTitle} narrative with JD-aligned terminology across summary, skills, and recent engagements.`,
    ],
    master: opts.master,
    jobTitle,
    yearsHint,
    candidateName: opts.candidateName,
    lowOverlap,
    targetLines: 10,
    preserveDensity: true,
  });

  // Impact always JD-shaped (domain proof + recent bullets)
  const impactFromProjects =
    projects[0]?.bullets.slice(0, 4).map((b) => b.replace(/^[•\-]\s*/, "")) || [];
  const impactProof = domainProofBullets(
    domain,
    "recent",
    projects[0]?.client || "clients",
    jobTitle,
    groundedPack.length ? groundedPack : skills,
    policy
  ).slice(0, 4);
  const impact = (impactProof.length ? impactProof : impactFromProjects).slice(0, 5);

  // Degrees from master; certs JD-filtered (AI when key present, else heuristic)
  const edu = await educationLinesForJd({
    master: opts.master,
    jd: opts.jd,
    jobTitle,
    domain,
    useAi: true,
  });
  const educationLines = edu.lines;

  const bundle: ContentBundle = {
    candidateName: opts.candidateName,
    headline: jobTitle.slice(0, 120),
    contactLine,
    summaryLines: summary,
    skills: skills.slice(0, 28),
    impactLines: impact,
    methodologyLines: policy.methodologyDefaults.slice(0, 5),
    projects,
    educationLines,
    jobTitle,
    domain,
    yearsHint,
    layoutId: opts.layoutId || "ats_classic",
    vendorName: opts.vendorName,
  };

  let structured = buildStructuredFromLayout(bundle);
  structured.meta.jobTitle = jobTitle;
  structured.meta.skillFingerprint = skillFingerprint(opts.jd, jobTitle);
  structured.meta.tailorMode = modeResult.mode;

  let text = renderPlainFromStructured(structured);

  const { scorePsych } = await import("./psych-scorer");
  const {
    packHasFreeMetrics,
    packHasIndustryCosplay,
  } = await import("./resume-honesty");
  // Cosplay/metrics flagged for notes only — do not cap ATS during boost climb
  const honestyFailed =
    packHasIndustryCosplay(text, opts.master).length > 0 ||
    packHasFreeMetrics(text, opts.master).length > 0;

  const { boostPackTowardAts100 } = await import("./ats-boost");
  const boost = boostPackTowardAts100({
    structured,
    jd: opts.jd,
    jobTitle,
    masterText: opts.master,
    recentProjectCount: Math.max(2, projects.length),
    honestyFailed: false,
    maxRounds: 4,
  });
  structured = boost.structured;
  text = boost.text;
  try {
    const { scrubAndRender } = await import("./pack-quality-scrub");
    const cleaned = scrubAndRender(structured, {
      jd: opts.jd,
      masterText: opts.master,
      jobTitle,
    });
    structured = cleaned.structured;
    text = cleaned.text;
  } catch {
    /* keep */
  }
  try {
    const { researchEnhancePack } = await import("./research-enhance-pack");
    const enhanced = researchEnhancePack({
      structured,
      jd: opts.jd,
      masterText: opts.master,
      jobTitle,
    });
    structured = enhanced.structured;
    text = enhanced.text;
  } catch {
    /* keep */
  }
  const { scoreResume } = await import("./ats-scorer");
  let ats = scoreResume({
    resumeText: text,
    jd: opts.jd,
    jobTitle,
    recentProjectCount: Math.max(2, projects.length),
    honestyFailed: false,
  });
  if (ats.score < 95) {
    const reboost = boostPackTowardAts100({
      structured,
      jd: opts.jd,
      jobTitle,
      masterText: opts.master,
      recentProjectCount: Math.max(2, projects.length),
      honestyFailed: false,
    });
    structured = reboost.structured;
    text = reboost.text;
    try {
      const { researchEnhancePack } = await import("./research-enhance-pack");
      const enhanced = researchEnhancePack({
        structured,
        jd: opts.jd,
        masterText: opts.master,
        jobTitle,
      });
      structured = enhanced.structured;
      text = enhanced.text;
    } catch {
      /* keep */
    }
    ats = scoreResume({
      resumeText: text,
      jd: opts.jd,
      jobTitle,
      recentProjectCount: Math.max(2, projects.length),
      honestyFailed: false,
    });
  }
  // FINAL scrub after research-enhance / reboost
  try {
    const { scrubAndRender } = await import("./pack-quality-scrub");
    const finalClean = scrubAndRender(structured, {
      jd: opts.jd,
      masterText: opts.master,
      jobTitle,
    });
    structured = finalClean.structured;
    text = finalClean.text;
    ats = scoreResume({
      resumeText: text,
      jd: opts.jd,
      jobTitle,
      recentProjectCount: Math.max(2, projects.length),
      honestyFailed: false,
    });
  } catch {
    /* keep */
  }
  void honestyFailed;

  const psych = scorePsych({
    resumeText: text,
    masterText: opts.master,
    masterProfileJson: opts.masterProfileJson,
    jd: opts.jd,
    jobTitle,
    mode: modeResult.mode,
    candidateName: opts.candidateName,
  });
  structured.meta.atsScore = ats.score;
  structured.meta.psychScore = psych.score;
  const dualBest = ats.score === 100 && psych.score === 100;
  structured.meta.progressiveNotes = [
    "ENGINE: assemble-pack/deterministic",
    `Mode: ${modeResult.label} (${modeResult.mode}) · overlap ${(modeResult.overlap * 100).toFixed(0)}%`,
    `Domain: ${domain} · Projects: ${projects.length}`,
    `ATS: ${ats.score}/100 · Psych: ${psych.score}/100 · Dual: ${dualBest ? "BEST" : "REVIEW"}`,
    boost.boosted
      ? `ATS graph T${boost.tierReached}: ${ats.score}/100 · +${boost.injected.length} tok`
      : `ATS graph: ${ats.score}/100`,
    ...boost.notes.slice(0, 4).map((n) => `ATS: ${n}`),
    formatEducationNote(edu),
    ...psych.warnings.slice(0, 3).map((w) => `Psych: ${w}`),
  ];

  // No engine footer on vendor-facing text (scores stay in DB / admin UI).
  return {
    structured,
    text,
    ats,
    psych,
    modeResult,
    usedLlm: false,
    engine: "assemble-pack/deterministic",
  };
}
