/**
 * Layout-agnostic plain-text render of ResumePackV2.
 * Labels are standard; visual templates may rename later.
 */

import {
  coerceSkillToken,
  OBJECT_OBJECT_RE,
  skillsTextIsUnusable,
  type ResumePackV2,
} from "./pack-schema";
import type { StructuredResume, ResumeSection } from "@/lib/resume/templates";

export type SkillsRenderFallback = {
  /** Pre-scrubbed tool noun list (from JD/master) used when pack skills are unusable */
  toolNouns?: string;
};

function cleanSkillPiece(x: unknown): string {
  const t = coerceSkillToken(x);
  if (!t || OBJECT_OBJECT_RE.test(t)) return "";
  return t.replace(OBJECT_OBJECT_RE, "").trim();
}

/**
 * Harden skills → display lines.
 * Never String(object). Object items use name/skill/label via coerceSkillToken.
 */
export function skillsToLines(
  skills: ResumePackV2["techSkills"],
  fallback?: SkillsRenderFallback
): string {
  let out = "";
  if (typeof skills === "string") {
    out = cleanSkillPiece(skills);
  } else if (Array.isArray(skills)) {
    out = skills.map(cleanSkillPiece).filter(Boolean).join(", ");
  } else if (skills && typeof skills === "object") {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(skills)) {
      const key = cleanSkillPiece(k) || "Skills";
      let vals = "";
      if (Array.isArray(v)) {
        vals = v.map(cleanSkillPiece).filter(Boolean).join(", ");
      } else {
        vals = cleanSkillPiece(v);
      }
      if (vals) lines.push(`${key}: ${vals}`);
    }
    out = lines.join("\n");
  }

  if (skillsTextIsUnusable(out)) {
    const fb = (fallback?.toolNouns || "").trim();
    if (fb && !skillsTextIsUnusable(fb)) return fb;
    return "";
  }
  return out;
}

export function skillsLines(
  skills: ResumePackV2["techSkills"],
  fallback?: SkillsRenderFallback
): string[] {
  const text = skillsToLines(skills, fallback);
  if (!text) return [];
  // Keep group lines separate when multi-line; single line otherwise
  if (text.includes("\n")) {
    return text.split("\n").map((l) => l.trim()).filter(Boolean);
  }
  return [text];
}

export function renderPackText(
  pack: ResumePackV2,
  fallback?: SkillsRenderFallback
): string {
  const h = pack.header;
  const parts: string[] = [];

  parts.push(h.jobTitle || "Professional");
  parts.push(h.name || "");
  const contact = [h.phone, h.email, h.location, h.linkedin]
    .filter(Boolean)
    .join(" | ");
  if (contact) parts.push(contact);
  parts.push("");

  parts.push("PROFESSIONAL SUMMARY");
  for (const b of pack.professionalSummary.bullets) {
    parts.push(`• ${b.replace(/^[•\-–*]\s*/, "")}`);
  }
  parts.push("");

  parts.push("TECHNICAL SKILLS");
  parts.push(skillsToLines(pack.techSkills, fallback));
  parts.push("");

  parts.push("PROFESSIONAL EXPERIENCE");
  for (const p of pack.projects) {
    parts.push("");
    parts.push(p.role || "Consultant");
    parts.push(`Employer / Client: ${p.employerOrClient}`);
    const locDur = [p.location, p.duration].filter(Boolean).join(" | ");
    if (locDur) parts.push(locDur);
    if (p.techStack) parts.push(`Tech Stack: ${p.techStack}`);
    if (p.environment) parts.push(`Environment: ${p.environment}`);
    for (const b of p.bullets) {
      parts.push(`• ${b.replace(/^[•\-–*]\s*/, "")}`);
    }
  }
  parts.push("");

  if (pack.education?.length) {
    parts.push("EDUCATION");
    for (const e of pack.education) {
      if (e.raw) parts.push(e.raw);
      else {
        parts.push(
          [e.degree, e.school, e.year].filter(Boolean).join(" — ")
        );
      }
    }
    parts.push("");
  }

  if (pack.certifications?.length) {
    parts.push("CERTIFICATIONS");
    for (const c of pack.certifications) {
      parts.push(`• ${c.replace(/^[•\-–*]\s*/, "")}`);
    }
    parts.push("");
  }

  return parts.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/** Build StructuredResume for existing DOCX/PDF/layout pipeline */
export function packToStructuredResume(
  pack: ResumePackV2,
  layoutId = "ats_classic",
  fallback?: SkillsRenderFallback
): StructuredResume {
  const h = pack.header;
  const contactLine = [h.phone, h.email, h.location, h.linkedin]
    .filter(Boolean)
    .join(" · ");

  const sections: ResumeSection[] = [
    {
      heading: "Professional Summary",
      lines: pack.professionalSummary.bullets.map(
        (b) => `• ${b.replace(/^[•\-–*]\s*/, "")}`
      ),
    },
    {
      heading: "Technical Skills",
      lines: skillsLines(pack.techSkills, fallback),
    },
  ];

  const expLines: string[] = [];
  for (const p of pack.projects) {
    expLines.push(p.role || "Consultant");
    expLines.push(`Employer / Client: ${p.employerOrClient}`);
    const locDur = [p.location, p.duration].filter(Boolean).join(" | ");
    if (locDur) expLines.push(locDur);
    if (p.techStack) expLines.push(`Tech Stack: ${p.techStack}`);
    if (p.environment) expLines.push(`Environment: ${p.environment}`);
    for (const b of p.bullets) {
      expLines.push(`• ${b.replace(/^[•\-–*]\s*/, "")}`);
    }
    expLines.push("");
  }
  sections.push({ heading: "Professional Experience", lines: expLines });

  if (pack.education?.length) {
    sections.push({
      heading: "Education",
      lines: pack.education.map((e) =>
        e.raw || [e.degree, e.school, e.year].filter(Boolean).join(" — ")
      ),
    });
  }
  if (pack.certifications?.length) {
    sections.push({
      heading: "Certifications",
      lines: pack.certifications.map((c) => `• ${c.replace(/^[•\-–*]\s*/, "")}`),
    });
  }

  return {
    candidateName: h.name || "Candidate",
    headline: h.jobTitle || "Professional",
    contactLine,
    sections,
    layoutId,
    meta: {
      atsScore: 0,
      psychScore: 0,
      skillFingerprint: "",
      jobTitle: h.jobTitle || "",
      progressiveNotes: pack.meta?.notes || [],
      tailorMode: "transfer",
    },
  };
}

/** @deprecated alias */
export const packToLegacyStructured = packToStructuredResume;
