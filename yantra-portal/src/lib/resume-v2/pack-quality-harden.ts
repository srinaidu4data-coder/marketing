/**
 * Phase A + C deterministic harden after LLM:
 * - no [object Object] skills
 * - diversify cloned techStack/environment across projects
 * - progressive role titles (not same senior title on every era)
 * - certs master-grounded
 * - banned filler / bio openers
 * - era-demote modern tokens on early roles
 */

import {
  OBJECT_OBJECT_RE,
  normalizeTechSkills,
  skillsTextIsUnusable,
  type ResumePackV2,
} from "./pack-schema";
import { skillsToLines } from "./render-pack";
import {
  scrubToToolNouns,
  toolsFromJd,
  normalizeStackEnvPair,
} from "./tools-nouns";
import {
  runStackEnvEngine,
  type StackEnvBankDoc,
} from "./stack-env";
import { groundPackToolsToThisChain } from "@/lib/resume/chain-isolation";

/** Expanded filler / bank / meta lines */
export const BANNED_BULLET_RE =
  /aligned to engagement goals\s*\(\d+\s*\/\s*\d+\)|engagement outcomes aligned to role expectations|Delivered measurable outcomes for|Supported .+ outcomes with quality delivery\s*\(\d+\s*\/\s*\d+\)|partner scorecards?|weekly partner scorecards?|finger-?pointing|single source of truth for decisions|commercial and delivery conversations stayed aligned|escalated systemic vendor risks with facts/i;

/** Summary bio openers that kill 6s skim */
export const BIO_OPENER_RE =
  /^(accomplished|seasoned|results-?driven|dynamic|motivated|passionate|dedicated|highly motivated|expert in|proven track record of|strong ability to|skilled in|experienced in leading|it professional with)/i;

function endYearFromDuration(duration: string): number | null {
  const d = duration || "";
  if (/present|current/i.test(d)) return new Date().getFullYear();
  const years: number[] = [];
  const re = /(19|20)\d{2}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    years.push(Number(m[0]));
  }
  if (!years.length) return null;
  return Math.max(...years);
}

function normKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Certs: keep only lines grounded in master text (substring 12+ chars or high token overlap).
 */
export function groundCertsToMaster(
  certs: string[],
  masterText: string
): string[] {
  const master = (masterText || "").toLowerCase();
  if (!master || master.length < 40) {
    // No master → drop invent-looking generic platform certs
    return (certs || []).filter(
      (c) =>
        c &&
        !/enterprise platform certified|advanced level$/i.test(c) &&
        c.length < 120
    );
  }
  const out: string[] = [];
  for (const raw of certs || []) {
    const c = String(raw || "").trim();
    if (!c || c.length < 4) continue;
    if (OBJECT_OBJECT_RE.test(c)) continue;
    const needle = c.toLowerCase().slice(0, Math.min(48, c.length));
    if (master.includes(needle.slice(0, 20))) {
      out.push(c);
      continue;
    }
    // Token overlap: at least 2 content words from cert in master
    const words = c
      .toLowerCase()
      .split(/[^a-z0-9/+]+/)
      .filter(
        (w) =>
          w.length > 3 &&
          !/^(certified|certificate|professional|associate|foundation|level|enterprise|platform)$/.test(
            w
          )
      );
    const hits = words.filter((w) => master.includes(w)).length;
    if (hits >= 2 || (words.length === 1 && hits === 1)) out.push(c);
  }
  return out.slice(0, 12);
}

/**
 * @deprecated Prefer runStackEnvEngine — kept for tests/callers.
 * Thin wrapper: full bank-backed diversify + anti-clone.
 */
export function diversifyCloneStacks(
  pack: ResumePackV2,
  jd?: string,
  masterText?: string,
  bank?: StackEnvBankDoc
): { pack: ResumePackV2; fixed: number } {
  const before = (pack.projects || []).map(
    (p) => `${normKey(p.techStack)}||${normKey(p.environment)}`
  );
  const r = runStackEnvEngine(pack, { jd, masterText, bank });
  const after = (r.pack.projects || []).map(
    (p) => `${normKey(p.techStack)}||${normKey(p.environment)}`
  );
  let fixed = 0;
  for (let i = 0; i < after.length; i++) {
    if (after[i] !== before[i]) fixed++;
  }
  return { pack: r.pack, fixed };
}

/**
 * If every role is the same senior title, progressive early titles.
 */
export function progressiveRoles(pack: ResumePackV2): {
  pack: ResumePackV2;
  fixed: number;
} {
  const projects = [...(pack.projects || [])];
  if (projects.length < 3) return { pack, fixed: 0 };
  const roles = projects.map((p) => normKey(p.role));
  const first = roles[0] || "";
  if (!first || first.length < 8) return { pack, fixed: 0 };
  const same = roles.filter((r) => r === first).length;
  if (same < projects.length - 1 && same < 3) return { pack, fixed: 0 };

  let fixed = 0;
  const baseTitle = projects[0]?.role || pack.header.jobTitle || "Consultant";
  // Strip senior adjectives for junior forms
  const core = baseTitle
    .replace(/\b(Senior|Lead|Principal|Techno-Functional|Techno Functional)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  for (let i = 1; i < projects.length; i++) {
    const p = projects[i]!;
    if (normKey(p.role) !== first && normKey(p.role).length > 8) continue;
    const endY = endYearFromDuration(p.duration);
    let nextRole = p.role;
    if (i === 1 || (endY != null && endY >= 2015 && endY < 2020)) {
      nextRole = core || p.role;
    } else if (endY != null && endY >= 2008 && endY < 2015) {
      nextRole = `Consultant – Enterprise Applications`;
    } else if (endY != null && endY < 2008) {
      nextRole = `Business Analyst – Financial Systems`;
    } else if (i >= projects.length - 2) {
      nextRole = `Business Analyst – Financial Systems`;
    } else {
      nextRole = `Consultant – Enterprise Applications`;
    }
    if (nextRole !== p.role) {
      projects[i] = { ...p, role: nextRole };
      fixed++;
    }
  }
  return { pack: { ...pack, projects }, fixed };
}

export function stripBioAndBanned(
  pack: ResumePackV2
): { pack: ResumePackV2; removed: number } {
  let removed = 0;
  const summary = (pack.professionalSummary?.bullets || []).filter((b) => {
    const t = String(b || "").trim();
    if (!t) return false;
    if (BANNED_BULLET_RE.test(t) || BIO_OPENER_RE.test(t)) {
      removed++;
      return false;
    }
    return true;
  });
  const projects = (pack.projects || []).map((p) => ({
    ...p,
    bullets: (p.bullets || []).filter((b) => {
      const t = String(b || "").trim();
      if (!t) return false;
      if (BANNED_BULLET_RE.test(t)) {
        removed++;
        return false;
      }
      return true;
    }),
  }));
  return {
    pack: {
      ...pack,
      professionalSummary: { bullets: summary },
      projects,
    },
    removed,
  };
}

export function assertNoObjectObject(text: string): boolean {
  return !OBJECT_OBJECT_RE.test(text || "");
}

/**
 * Full Phase A harden pipeline (mutates via return).
 */
export function hardenPackQuality(
  pack: ResumePackV2,
  opts: { masterText?: string; jd?: string; bank?: StackEnvBankDoc }
): {
  pack: ResumePackV2;
  notes: string[];
} {
  const notes: string[] = [];
  let p = { ...pack, projects: [...(pack.projects || [])] };

  // Skills coerce (pre-engine; engine may rebuild skills groups)
  {
    const n = normalizeTechSkills(p.techSkills);
    p.techSkills = n.techSkills;
    if (n.issues.some((i) => i.code === "skills_object_leak")) {
      notes.push("skills: coerced object items");
    }
    const fb =
      toolsFromJd(opts.jd, 14) || toolsFromJd(opts.masterText, 14) || "";
    const rendered = skillsToLines(p.techSkills, { toolNouns: fb });
    if (skillsTextIsUnusable(rendered)) {
      p.techSkills = fb || scrubToToolNouns(String(p.techSkills), 12) || "";
      notes.push("skills: replaced unusable with JD/master tools");
    }
  }

  // Certs
  {
    const before = (p.certifications || []).length;
    p.certifications = groundCertsToMaster(
      p.certifications || [],
      opts.masterText || ""
    );
    if (p.certifications.length < before) {
      notes.push(
        `certs: dropped ${before - p.certifications.length} ungrounded`
      );
    }
  }

  // Bio / filler
  {
    const r = stripBioAndBanned(p);
    p = r.pack;
    if (r.removed) notes.push(`filler/bio: removed ${r.removed} lines`);
  }

  // Progressive roles (before stack engine so titles don't depend on stacks)
  {
    const r = progressiveRoles(p);
    p = r.pack;
    if (r.fixed) notes.push(`roles: progressive titles on ${r.fixed} project(s)`);
  }

  // StackEnv Engine — bank-backed assign, anti-clone, era honesty, category lanes
  {
    const r = runStackEnvEngine(p, {
      jd: opts.jd,
      masterText: opts.masterText,
      bank: opts.bank,
    });
    p = r.pack;
    notes.push(...r.notes.map((n) => `stack-env: ${n}`));
    if (!r.report.passed) {
      notes.push(
        `stack-env: ship checks soft-fail maxJ=${r.report.maxPairJaccard.toFixed(2)} sigs=${r.report.uniqueSignatures}`
      );
    } else {
      notes.push(
        `stack-env: ship checks passed sigs=${r.report.uniqueSignatures}`
      );
    }
  }

  // Fresh-chain tool isolation — strip tools not in THIS JD ∪ THIS master
  {
    const iso = groundPackToolsToThisChain(p, {
      jd: opts.jd || "",
      masterText: opts.masterText || "",
    });
    p = iso.pack;
    if (iso.droppedCount) {
      notes.push(`chain-iso: dropped ${iso.droppedCount} ungrounded tool token(s)`);
    } else {
      notes.push("chain-iso: tools grounded to this JD+master");
    }
  }

  // Light scrub only (do NOT re-pad all projects from the same JD bag)
  p.projects = (p.projects || []).map((proj) => {
    const pair = normalizeStackEnvPair(
      proj.techStack || "",
      proj.environment || "",
      undefined, // no JD pad here — engine already assigned
      { minStack: 2, minEnv: 2 }
    );
    return {
      ...proj,
      techStack: pair.techStack || proj.techStack,
      environment: pair.environment || proj.environment,
    };
  });

  // Header location normalize
  if (p.header?.location) {
    p.header = {
      ...p.header,
      location: p.header.location
        .replace(/\s+,/g, ",")
        .replace(/,\s*/g, ", ")
        .replace(/\bTEXAS\b/i, "TX")
        .trim(),
    };
  }

  return { pack: p, notes };
}
