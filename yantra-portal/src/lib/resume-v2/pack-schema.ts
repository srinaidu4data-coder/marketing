/**
 * Fixed resume pack shape for prompt-only generation.
 * Layouts change labels/visuals only — this schema is the content contract.
 */

export const BULLETS_PER_BLOCK = 12;

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

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function normalizeBullets(raw: unknown, label: string): {
  bullets: string[];
  issues: PackValidationIssue[];
} {
  const issues: PackValidationIssue[] = [];
  let bullets = asStringArray(raw);
  if (bullets.length !== BULLETS_PER_BLOCK) {
    issues.push({
      code: "bullet_count",
      detail: `${label}: expected ${BULLETS_PER_BLOCK} bullets, got ${bullets.length}`,
    });
  }
  // Pad/trim only for structural survival — content quality is prompt's job
  while (bullets.length < BULLETS_PER_BLOCK) {
    bullets.push(
      `Delivered measurable outcomes aligned to engagement goals (${bullets.length + 1}/${BULLETS_PER_BLOCK}).`
    );
  }
  if (bullets.length > BULLETS_PER_BLOCK) {
    bullets = bullets.slice(0, BULLETS_PER_BLOCK);
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
    "Professional Summary"
  );
  issues.push(...sum.issues);

  let techSkills: ResumePackV2["techSkills"] = "";
  if (typeof o.techSkills === "string") techSkills = o.techSkills;
  else if (Array.isArray(o.techSkills)) techSkills = asStringArray(o.techSkills);
  else if (o.techSkills && typeof o.techSkills === "object") {
    techSkills = o.techSkills as Record<string, string[]>;
  } else if (Array.isArray(o.skills)) {
    techSkills = asStringArray(o.skills);
  } else {
    issues.push({ code: "skills", detail: "Missing techSkills" });
  }

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
    const b = normalizeBullets(r.bullets, `Project ${i + 1}`);
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
    ["header", "projects", "employer"].includes(x.code)
  );

  return { pack, issues, ok: !hardFail && !!header.name && projects.length > 0 };
}
