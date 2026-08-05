/**
 * Layout-agnostic plain-text render of ResumePackV2.
 * Labels are standard; visual templates may rename later.
 */

import type { ResumePackV2 } from "./pack-schema";
import type { StructuredResume, ResumeSection } from "@/lib/resume/templates";

function skillsToLines(skills: ResumePackV2["techSkills"]): string {
  if (typeof skills === "string") return skills.trim();
  if (Array.isArray(skills)) return skills.join(", ");
  const lines: string[] = [];
  for (const [k, v] of Object.entries(skills || {})) {
    const vals = Array.isArray(v) ? v.join(", ") : String(v || "");
    if (vals.trim()) lines.push(`${k}: ${vals}`);
  }
  return lines.join("\n");
}

export function renderPackText(pack: ResumePackV2): string {
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
  parts.push(skillsToLines(pack.techSkills));
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

function skillsLines(skills: ResumePackV2["techSkills"]): string[] {
  if (typeof skills === "string") return skills ? [skills] : [];
  if (Array.isArray(skills)) return skills.length ? [skills.join(", ")] : [];
  return Object.entries(skills || {}).map(
    ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`
  );
}

/** Build StructuredResume for existing DOCX/PDF/layout pipeline */
export function packToStructuredResume(
  pack: ResumePackV2,
  layoutId = "ats_classic"
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
      lines: skillsLines(pack.techSkills),
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
