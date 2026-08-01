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
 * Education honesty (both modes):
 *   Degrees from master always kept. Certs JD-filtered (AI when available, else heuristic).
 *   Never policy.educationDefaults. Empty education section is OK.
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
import {
  educationLinesForJd,
  extractEducationAndCertsFromMaster,
  type EducationFilterResult,
} from "./education-filter";
import {
  resolveTailorMode,
  type TailorModeResult,
} from "./tailor-mode";

export {
  educationLinesForJd,
  extractEducationAndCertsFromMaster,
  type EducationFilterResult,
} from "./education-filter";
export { resolveTailorMode } from "./tailor-mode";

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
  policy: ResumeEnginePolicy,
  /** same_domain only — transfer/strict keep master titles on recent roles */
  jdTitlesOnRecent = true
): string {
  const recentN = Math.max(1, policy.recentTitleCount || 2);
  const fromMaster = (masterTitle || "").trim();
  const ladder = progressiveTitlesFromJobTitle(jobTitle, 10, policy);
  const fromAi = (aiTitle || "").trim();
  const fromSupportive = (supportive[Math.max(0, idx - recentN)] || "").trim();

  // Transfer/strict: never force JD title onto career history
  if (!jdTitlesOnRecent) {
    if (
      fromMaster &&
      fromMaster.length > 3 &&
      !isOffDomainTitle(fromMaster, domain, jobTitle, policy)
    ) {
      return fromMaster.slice(0, 120);
    }
    if (
      fromAi &&
      fromAi.length > 4 &&
      !isOffDomainTitle(fromAi, domain, jobTitle, policy)
    ) {
      return fromAi.slice(0, 120);
    }
    return (fromMaster || ladder[Math.min(idx, ladder.length - 1)] || jobTitle).slice(
      0,
      120
    );
  }

  if (idx < recentN) return jobTitle.slice(0, 120);

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
  /** Never invent template bullets when false (default for all modes) */
  allowEmergencyFill?: boolean;
}): string[] {
  const need = Math.max(1, Math.min(opts.max, opts.max));

  // Honesty ladder: AI rephrase → master only. No domainProof invent by default.
  let final = dedupeBullets(opts.aiBullets).slice(0, opts.max);

  if (final.length < need) {
    const masterProof = cleanMasterBullets(opts.masterBullets, opts.max).filter(
      (b) => !isOffDomainText(b, opts.domain, opts.policy)
    );
    final = dedupeBullets([...final, ...masterProof]).slice(0, opts.max);
  }

  // Soft-fill ONLY if explicitly allowed (same_domain emergency — still off by default)
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
  const minBullets = modeResult?.minBullets ?? MIN_BULLETS_PER_PROJECT;
  const allowEmergencyFill = modeResult?.allowEmergencyFill === true;

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
    // Cap by policy but do not invent to fill — min enforced at assert with mode floor
    const maxBullets = Math.max(
      minBullets,
      Math.min(
        bulletCapFor(isRecent, era, opts.policy),
        allowEmergencyFill ? MIN_BULLETS_PER_PROJECT : bulletCapFor(isRecent, era, opts.policy)
      )
    );
    const skillCap = skillCapFor(isRecent, era, opts.policy);
    // Transfer/strict: grounded skills only (never full JD bank on early roles)
    const bank =
      modeResult?.mode === "same_domain"
        ? eraSkillBank(isRecent, era, grounded, fullBank)
        : grounded.length
          ? grounded
          : fullBank.slice(0, isRecent ? 8 : 4);

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

  // Hard gate: mode-aware min (honest thinner packs OK; never invent to hit 8)
  assertMandatoryBulletDensity(projects, minBullets);
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

  const first = opts.candidateName.split(/\s+/)[0] || opts.candidateName;
  const skillLine = groundedPack.slice(0, 6).join(", ") || jobTitle;
  const yearsPart =
    yearsHint > 0
      ? ` with approximately ${yearsHint}+ years of progressive professional experience`
      : " with progressive professional experience";
  const lowOverlap =
    modeResult.mode === "strict" || modeResult.mode === "transfer";
  const summary = scrubSummaryHonesty({
    lines: [
      `${first} is positioned as a ${jobTitle}${yearsPart}, mapped to this role’s requirements with emphasis on ${skillLine}.`,
      `Master-backed delivery history is reframed toward ${jobTitle} responsibilities where honestly supported by experience.`,
    ],
    master: opts.master,
    jobTitle,
    yearsHint,
    candidateName: opts.candidateName,
    lowOverlap,
  });

  // No invented impact templates on transfer/strict
  const impact =
    modeResult.mode === "same_domain"
      ? domainProofBullets(
          domain,
          "recent",
          projects[0]?.client || "clients",
          jobTitle,
          groundedPack.length ? groundedPack : skills,
          policy
        ).slice(0, 4)
      : projects[0]?.bullets.slice(0, 3).map((b) => b.replace(/^[•\-]\s*/, "")) ||
        [];

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

  const structured = buildStructuredFromLayout(bundle);
  structured.meta.jobTitle = jobTitle;
  structured.meta.skillFingerprint = skillFingerprint(opts.jd, jobTitle);
  structured.meta.tailorMode = modeResult.mode;

  const text = renderPlainFromStructured(structured);

  const { scorePsych } = await import("./psych-scorer");
  const {
    packHasFreeMetrics,
    packHasIndustryCosplay,
    packHasMasterResidueLeak,
  } = await import("./resume-honesty");
  const honestyFailed =
    packHasIndustryCosplay(text, opts.master).length > 0 ||
    packHasFreeMetrics(text, opts.master).length > 0 ||
    packHasMasterResidueLeak(text, opts.jd, modeResult.mode).length > 0;

  const psych = scorePsych({
    resumeText: text,
    masterText: opts.master,
    masterProfileJson: opts.masterProfileJson,
    jd: opts.jd,
    jobTitle,
    mode: modeResult.mode,
    candidateName: opts.candidateName,
  });
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
    honestyFailed: honestyFailed || !psych.ready,
  });
  structured.meta.atsScore = ats.score;
  structured.meta.psychScore = psych.score;
  const dualBest = ats.score === 100 && psych.score === 100;
  structured.meta.progressiveNotes = [
    "ENGINE: assemble-pack/deterministic",
    `Mode: ${modeResult.label} (${modeResult.mode}) · overlap ${(modeResult.overlap * 100).toFixed(0)}%`,
    `Domain: ${domain} · Projects: ${projects.length}`,
    `ATS: ${ats.score}/100 · Psych: ${psych.score}/100 · Dual: ${dualBest ? "BEST" : "REVIEW"}`,
    formatEducationNote(edu),
    ...psych.warnings.slice(0, 3).map((w) => `Psych: ${w}`),
  ];

  return {
    structured,
    text:
      text +
      `\n\n— Role Forge · deterministic · Mode: ${modeResult.mode} · ATS: ${ats.score}/100 · Psych: ${psych.score}/100 · Dual: ${dualBest ? "BEST" : "REVIEW"} —\n`,
    ats,
    psych,
    modeResult,
    usedLlm: false,
    engine: "assemble-pack/deterministic",
  };
}
