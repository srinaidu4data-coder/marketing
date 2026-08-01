/**
 * Pre-delivery QA for structured resumes.
 * Catches duplicate sections, identity leaks under Professional Summary,
 * empty experience, missing employer lines, etc. before user download.
 */

import type { ResumeSection, StructuredResume } from "./templates";

export type QaIssue = {
  severity: "error" | "warn";
  code: string;
  message: string;
};

export type QaResult = {
  ok: boolean;
  issues: QaIssue[];
  fixed: StructuredResume;
};

const IDENTITY_OR_CONTACT =
  /@|linkedin\.com|\+?\d[\d\s().-]{8,}\d|remote\s*\(?us\)?|work authorization|green card|h-?1b/i;

const SECTION_HEADING_RE =
  /^(professional summary|summary|career summary|executive summary|core competencies|technical skills|skills|selected impact|impact snapshot|professional experience|work experience|experience|employment history|education|certifications?|credentials|capability matrix|systems|delivery metrics|deep-dive|executive brief|signature|leadership|board-level|career arc|chapter|proof|portfolio|situation|case|outcomes|methodology|how i deliver|cross-engagement|highlights)\b/i;

/** Lines that belong only in the document header, never inside a section body */
export function isIdentityLeakLine(
  line: string,
  opts: { candidateName: string; headline: string; jobTitle?: string }
): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^employer\s*\/\s*client:/i.test(t)) return false;
  if (/^[•▸→–\-\*]/.test(t)) return false;

  const name = (opts.candidateName || "").trim();
  if (name && new RegExp(`^${escapeRe(name)}$`, "i").test(t)) return true;
  if (name && t.toUpperCase() === name.toUpperCase()) return true;

  const hl = (opts.headline || "").trim();
  const jt = (opts.jobTitle || hl).trim();
  if (hl && t === hl) return true;
  if (jt && t === jt) return true;
  // Job-title-like alone on a line under summary
  if (
    /^SAP\b/i.test(t) &&
    t.length < 120 &&
    !/with |including |specializing |years of/i.test(t) &&
    (t.includes(hl.slice(0, 20)) || t.includes(jt.slice(0, 20)) || /consultant|developer|architect|lead/i.test(t))
  ) {
    // Only treat as leak if short title-like (not a summary sentence)
    if (t.length < 100 && !/\.\s/.test(t) && t.split(/\s+/).length <= 14) return true;
  }

  if (IDENTITY_OR_CONTACT.test(t) && t.length < 160 && !/^[•▸→–\-\*]/.test(t)) {
    // Contact strip: email | remote | cert
    if (/@/.test(t) || /\|/.test(t) && /remote|certified|phone/i.test(t)) return true;
  }

  // Nested section heading as body line
  if (SECTION_HEADING_RE.test(t) && t.length < 80) return true;

  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHeadingKey(h: string): string {
  const t = h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/summary|brief|arc|situation|pitch/.test(t) && !/skill|experience|impact|case/.test(t))
    return "summary";
  if (/skill|competenc|matrix|toolkit|capability/.test(t)) return "skills";
  if (/impact|achievement|metric|outcome|highlight|proof|signature/.test(t))
    return "impact";
  if (/experience|engagement|employment|chapter|deep.?dive|leadership engagement|case deck|portfolio/.test(t))
    return "experience";
  if (/education|credential|certif/.test(t)) return "education";
  return t;
}

/**
 * Sanitize structured resume: remove identity leaks, merge duplicate section types,
 * drop empty sections, ensure single Professional Summary block content.
 */
export function qaAndRepairResume(
  structured: StructuredResume
): QaResult {
  const issues: QaIssue[] = [];
  const name = structured.candidateName;
  const headline = structured.headline;
  const jobTitle = structured.meta?.jobTitle || headline;

  // 1) Clean each section body
  // Identity/contact leaks only stripped from summary/skills/impact — NOT experience
  // (experience needs job-title lines for each project).
  let sections: ResumeSection[] = structured.sections.map((sec) => {
    const key = normalizeHeadingKey(sec.heading);
    const stripIdentity = key === "summary" || key === "skills" || key === "impact";
    const cleaned: string[] = [];
    let leaked = 0;
    for (const line of sec.lines) {
      if (
        stripIdentity &&
        isIdentityLeakLine(line, { candidateName: name, headline, jobTitle })
      ) {
        leaked++;
        continue;
      }
      // Always strip nested "PROFESSIONAL SUMMARY" heading text if it appears mid-body
      if (SECTION_HEADING_RE.test(line.trim()) && line.trim().length < 80) {
        leaked++;
        continue;
      }
      // Drop repeated blank lines
      if (!line.trim()) {
        if (cleaned.length && cleaned[cleaned.length - 1].trim() === "") continue;
        cleaned.push("");
        continue;
      }
      cleaned.push(line);
    }
    while (cleaned.length && !cleaned[0].trim()) cleaned.shift();
    while (cleaned.length && !cleaned[cleaned.length - 1].trim()) cleaned.pop();
    if (leaked > 0) {
      issues.push({
        severity: "warn",
        code: "IDENTITY_LEAK",
        message: `Removed ${leaked} header/contact/heading line(s) from section "${sec.heading}"`,
      });
    }
    return { heading: sec.heading, lines: cleaned };
  });

  // 2) Merge consecutive / duplicate section keys (e.g. two Professional Summary)
  const merged: ResumeSection[] = [];
  const seenKey = new Map<string, number>(); // key -> index in merged

  for (const sec of sections) {
    const key = normalizeHeadingKey(sec.heading);
    // Skip empty non-experience sections
    if (!sec.lines.some((l) => l.trim()) && key !== "experience") {
      issues.push({
        severity: "warn",
        code: "EMPTY_SECTION",
        message: `Dropped empty section "${sec.heading}"`,
      });
      continue;
    }
    const existingIdx = seenKey.get(key);
    if (existingIdx !== undefined && (key === "summary" || key === "skills")) {
      // Merge lines into first occurrence
      const prev = merged[existingIdx];
      const extra = sec.lines.filter(
        (l) => l.trim() && !prev.lines.some((p) => p.trim() === l.trim())
      );
      merged[existingIdx] = {
        heading: prev.heading, // keep first layout-correct heading
        lines: [...prev.lines, ...extra],
      };
      issues.push({
        severity: "error",
        code: "DUPLICATE_SECTION",
        message: `Merged duplicate "${sec.heading}" into "${prev.heading}"`,
      });
      continue;
    }
    // For experience, allow only one experience-type section
    if (key === "experience" && seenKey.has("experience")) {
      const prev = merged[seenKey.get("experience")!];
      merged[seenKey.get("experience")!] = {
        heading: prev.heading,
        lines: [...prev.lines, "", ...sec.lines],
      };
      issues.push({
        severity: "error",
        code: "DUPLICATE_EXPERIENCE",
        message: `Merged duplicate experience section "${sec.heading}"`,
      });
      continue;
    }
    seenKey.set(key, merged.length);
    merged.push(sec);
  }

  sections = merged;

  // 3) Never put name/headline as the only content of summary
  for (const sec of sections) {
    if (normalizeHeadingKey(sec.heading) !== "summary") continue;
    const body = sec.lines.filter((l) => l.trim());
    if (body.length === 0) {
      issues.push({
        severity: "error",
        code: "EMPTY_SUMMARY",
        message: "Professional Summary was empty after cleanup",
      });
    }
  }

  // 4) Experience should have Employer / Client somewhere
  const exp = sections.find((s) => normalizeHeadingKey(s.heading) === "experience");
  if (exp) {
    const empCount = exp.lines.filter((l) =>
      /^employer\s*\/\s*client:/i.test(l.trim())
    ).length;
    if (empCount === 0) {
      issues.push({
        severity: "warn",
        code: "MISSING_EMPLOYER_LINES",
        message: "Experience section has no 'Employer / Client:' lines",
      });
    }
  } else {
    issues.push({
      severity: "error",
      code: "NO_EXPERIENCE",
      message: "No Professional Experience section after QA",
    });
  }

  // 5) Drop internal QA notes from export
  sections = sections.filter(
    (s) => !/progressive experience notes|internal qa/i.test(s.heading)
  );

  const fixed: StructuredResume = {
    ...structured,
    // Canonical header only — never duplicated into sections
    candidateName: name,
    headline: headline || jobTitle,
    contactLine: structured.contactLine,
    sections,
    meta: {
      ...structured.meta,
      progressiveNotes: [
        ...(structured.meta.progressiveNotes || []),
        `QA: ${issues.length} issue(s) repaired before delivery`,
      ],
    },
  };

  const hasErrors = issues.some((i) => i.severity === "error");
  // ok if we still have usable content
  const ok =
    fixed.sections.length > 0 &&
    fixed.sections.some((s) => s.lines.some((l) => l.trim().length > 40));

  if (!ok) {
    issues.push({
      severity: "error",
      code: "UNUSABLE",
      message: "Resume failed QA: insufficient content after repair",
    });
  }

  void hasErrors;
  return { ok, issues, fixed };
}

/** Build clean plain text from structured (single header, no section dupes). */
export function renderCleanPlain(s: StructuredResume): string {
  const lines: string[] = [
    s.candidateName.toUpperCase(),
    s.headline,
    s.contactLine,
    "------------------------------",
    "",
  ];
  for (const sec of s.sections) {
    if (/progressive experience notes/i.test(sec.heading)) continue;
    lines.push(sec.heading.toUpperCase());
    lines.push(...sec.lines);
    lines.push("");
    lines.push("");
  }
  return lines.join("\n");
}
