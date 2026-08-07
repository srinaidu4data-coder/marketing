/**
 * Resume pack shape for prompt-primary generation.
 * Bullet counts are free (floors only). Locks: name, employers, dates — enforced in Bible.
 */

/** Soft target for UI hints; not a hard pad target. */
export const BULLETS_PER_BLOCK = 10;
/** Minimum bullets before we flag thin (no generic pad invent). */
export const MIN_SUMMARY_BULLETS = 4;
export const MIN_PROJECT_BULLETS = 3;
export const MAX_BULLETS_SOFT = 20;

export type ResumePackV2 = {
  header: {
    jobTitle: string;
    name: string;
    phone: string;
    email: string;
    location: string;
    linkedin: string;
  };
  professionalSummary: {
    bullets: string[];
  };
  /** Prompt decides format — string, list, or grouped */
  techSkills: string | string[] | Record<string, string[]>;
  education: Array<{
    school?: string;
    degree?: string;
    year?: string;
    raw?: string;
  }>;
  certifications: string[];
  projects: Array<{
    role: string;
    employerOrClient: string;
    location: string;
    duration: string;
    techStack: string;
    environment: string;
    bullets: string[];
  }>;
  meta?: {
    model?: string;
    provider?: string;
    promptVersionId?: string;
    attempts?: number;
    notes?: string[];
  };
};

export type PackValidationIssue = {
  code: string;
  detail: string;
};

/** Detect String(object) garbage from bad LLM shapes. */
export const OBJECT_OBJECT_RE = /\[object\s+Object\]/i;

const SKILL_NAME_KEYS = [
  "name",
  "skill",
  "label",
  "title",
  "value",
  "tool",
  "technology",
  "tech",
  "item",
  "text",
] as const;

/**
 * Coerce one skill token to a clean string.
 * Never use String(obj) — that yields "[object Object]".
 */
export function coerceSkillToken(x: unknown, depth = 0): string {
  if (x == null || depth > 4) return "";
  if (typeof x === "string") {
    const t = x.trim();
    if (!t || OBJECT_OBJECT_RE.test(t)) return "";
    return t;
  }
  if (typeof x === "number" || typeof x === "boolean") {
    return String(x).trim();
  }
  if (Array.isArray(x)) {
    return x
      .map((item) => coerceSkillToken(item, depth + 1))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof x === "object") {
    const o = x as Record<string, unknown>;
    for (const key of SKILL_NAME_KEYS) {
      if (key in o) {
        const raw = o[key];
        // Named skill fields: strings preferred; ignore nested junk
        if (typeof raw === "string" || typeof raw === "number") {
          const v = coerceSkillToken(raw, depth + 1);
          if (v && !/^\d+$/.test(v)) return v;
          if (v && typeof raw === "string") return v;
        }
      }
    }
    // First non-empty string field only (never invent from numbers/booleans)
    for (const v of Object.values(o)) {
      if (typeof v === "string") {
        const t = v.trim();
        if (t && !OBJECT_OBJECT_RE.test(t)) return t;
      }
    }
  }
  return "";
}

/** Map unknown array items to strings without String(object). */
export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => coerceSkillToken(x))
    .map((s) => s.trim())
    .filter((s) => s && !OBJECT_OBJECT_RE.test(s));
}

/**
 * Normalize techSkills into string | string[] | Record<string, string[]>.
 * Pulls name/skill/label from object items; never leaves [object Object].
 */
export function normalizeTechSkills(raw: unknown): {
  techSkills: ResumePackV2["techSkills"];
  issues: PackValidationIssue[];
} {
  const issues: PackValidationIssue[] = [];

  const stripLeak = (s: string): string =>
    s
      .replace(OBJECT_OBJECT_RE, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .trim();

  if (typeof raw === "string") {
    let t = raw.trim();
    if (OBJECT_OBJECT_RE.test(t)) {
      issues.push({
        code: "skills_object_leak",
        detail: 'techSkills string contained "[object Object]"',
      });
      t = stripLeak(t);
    }
    if (!t) {
      issues.push({ code: "skills", detail: "Missing techSkills" });
    }
    return { techSkills: t, issues };
  }

  if (Array.isArray(raw)) {
    const hadObjects = raw.some((x) => x != null && typeof x === "object");
    const arr = asStringArray(raw).map(stripLeak).filter(Boolean);
    if (hadObjects && arr.length === 0 && raw.length > 0) {
      issues.push({
        code: "skills_object_leak",
        detail:
          "techSkills was an array of objects with no name/skill/label — coerced empty",
      });
    }
    if (arr.some((s) => OBJECT_OBJECT_RE.test(s))) {
      issues.push({
        code: "skills_object_leak",
        detail: 'techSkills array leaked "[object Object]"',
      });
    }
    const clean = arr.filter((s) => s && !OBJECT_OBJECT_RE.test(s));
    if (!clean.length) {
      issues.push({ code: "skills", detail: "Missing techSkills" });
    }
    return { techSkills: clean, issues };
  }

  if (raw && typeof raw === "object") {
    const out: Record<string, string[]> = {};
    let anyLeak = false;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const key = stripLeak(String(k || "").trim()) || "Skills";
      let vals: string[] = [];
      if (Array.isArray(v)) {
        vals = asStringArray(v);
      } else if (typeof v === "string") {
        vals = v
          .split(/[,;|]/)
          .map((s) => stripLeak(s))
          .filter(Boolean);
      } else {
        const t = coerceSkillToken(v);
        vals = t ? [t] : [];
      }
      vals = vals.map(stripLeak).filter((s) => s && !OBJECT_OBJECT_RE.test(s));
      if (
        Array.isArray(v) &&
        v.some((x) => x != null && typeof x === "object") &&
        vals.length === 0 &&
        v.length > 0
      ) {
        anyLeak = true;
      }
      if (vals.length) out[key] = vals;
    }
    if (anyLeak) {
      issues.push({
        code: "skills_object_leak",
        detail:
          "techSkills groups had object items without name/skill/label",
      });
    }
    if (!Object.keys(out).length) {
      issues.push({ code: "skills", detail: "Missing techSkills" });
      return { techSkills: "", issues };
    }
    return { techSkills: out, issues };
  }

  issues.push({ code: "skills", detail: "Missing techSkills" });
  return { techSkills: "", issues };
}

/** True when rendered skills text is unusable garbage. */
export function skillsTextIsUnusable(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  if (OBJECT_OBJECT_RE.test(t)) return true;
  // only punctuation / commas
  if (!/[A-Za-z0-9]/.test(t)) return true;
  return false;
}

function normalizeBullets(
  raw: unknown,
  label: string,
  minBullets: number
): {
  bullets: string[];
  issues: PackValidationIssue[];
} {
  const issues: PackValidationIssue[] = [];
  let bullets = asStringArray(raw);
  // Free count — never invent filler pads; only soft-trim extreme length
  if (bullets.length > MAX_BULLETS_SOFT) {
    bullets = bullets.slice(0, MAX_BULLETS_SOFT);
    issues.push({
      code: "bullet_trim",
      detail: `${label}: trimmed to ${MAX_BULLETS_SOFT} bullets`,
    });
  }
  if (bullets.length < minBullets) {
    issues.push({
      code: "bullet_count",
      detail: `${label}: thin content (${bullets.length} bullets; prefer ≥${minBullets})`,
    });
  }
  return { bullets, issues };
}

/** Parse unknown LLM JSON into ResumePackV2 + validation issues. */
export function parseAndValidatePack(raw: unknown): {
  pack: ResumePackV2;
  issues: PackValidationIssue[];
  ok: boolean;
} {
  const issues: PackValidationIssue[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const headerIn = (o.header && typeof o.header === "object"
    ? o.header
    : {}) as Record<string, unknown>;
  const summaryIn = (o.professionalSummary &&
  typeof o.professionalSummary === "object"
    ? o.professionalSummary
    : o.summary && typeof o.summary === "object"
      ? o.summary
      : {}) as Record<string, unknown>;

  const header = {
    jobTitle: String(headerIn.jobTitle || headerIn.title || "").trim(),
    name: String(headerIn.name || "").trim(),
    phone: String(headerIn.phone || "").trim(),
    email: String(headerIn.email || "").trim(),
    location: String(headerIn.location || "").trim(),
    linkedin: String(headerIn.linkedin || headerIn.linkedIn || "").trim(),
  };

  if (!header.jobTitle) issues.push({ code: "header", detail: "Missing jobTitle" });
  if (!header.name) issues.push({ code: "header", detail: "Missing name" });
  if (!header.email) issues.push({ code: "header", detail: "Missing email" });

  const sum = normalizeBullets(
    summaryIn.bullets ?? o.summaryBullets,
    "Professional Summary",
    MIN_SUMMARY_BULLETS
  );
  issues.push(...sum.issues);

  const skillsRaw =
    o.techSkills !== undefined && o.techSkills !== null
      ? o.techSkills
      : o.skills !== undefined && o.skills !== null
        ? o.skills
        : undefined;
  const skillsNorm = normalizeTechSkills(skillsRaw);
  issues.push(...skillsNorm.issues);
  const techSkills = skillsNorm.techSkills;

  const educationRaw = Array.isArray(o.education) ? o.education : [];
  const education = educationRaw.map((e) => {
    if (typeof e === "string") return { raw: e };
    const r = (e || {}) as Record<string, unknown>;
    return {
      school: r.school ? String(r.school) : undefined,
      degree: r.degree ? String(r.degree) : undefined,
      year: r.year ? String(r.year) : undefined,
      raw: r.raw ? String(r.raw) : undefined,
    };
  });

  const certifications = asStringArray(o.certifications ?? o.certs);

  const projectsRaw = Array.isArray(o.projects) ? o.projects : [];
  if (!projectsRaw.length) {
    issues.push({ code: "projects", detail: "No projects returned" });
  }

  const projects = projectsRaw.map((p, i) => {
    const r = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const b = normalizeBullets(r.bullets, `Project ${i + 1}`, MIN_PROJECT_BULLETS);
    issues.push(...b.issues);
    const employer = String(
      r.employerOrClient || r.employer || r.client || ""
    ).trim();
    if (!employer) {
      issues.push({
        code: "employer",
        detail: `Project ${i + 1}: missing employerOrClient`,
      });
    }
    return {
      role: String(r.role || r.title || "").trim(),
      employerOrClient: employer,
      location: String(r.location || "").trim(),
      duration: String(r.duration || r.dates || "").trim(),
      techStack: String(r.techStack || r.stack || r.modules || "").trim(),
      environment: String(r.environment || r.env || "").trim(),
      bullets: b.bullets,
    };
  });

  const pack: ResumePackV2 = {
    header,
    professionalSummary: { bullets: sum.bullets },
    techSkills,
    education,
    certifications,
    projects,
  };

  const hardFail = issues.some((x) =>
    ["header", "projects", "employer", "skills_object_leak"].includes(x.code)
  );

  return { pack, issues, ok: !hardFail && !!header.name && projects.length > 0 };
}
