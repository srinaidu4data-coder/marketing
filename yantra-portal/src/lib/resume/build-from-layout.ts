/**
 * Map AI content + master anchors into layout-config section order.
 * 4–5 page density: recent 12–18 bullets, all projects, JD jargon first.
 */

import type { DomainHint } from "./jd-parse";
import { getLayoutConfig, type LayoutConfig, type SectionKey } from "./layout-config";
import type { StructureProject } from "./layout-structures";
import type { ResumeSection, StructuredResume } from "./templates";

export type ContentBundle = {
  candidateName: string;
  headline: string;
  contactLine: string;
  summaryLines: string[];
  skills: string[];
  impactLines: string[];
  methodologyLines: string[];
  projects: StructureProject[];
  educationLines: string[];
  jobTitle: string;
  domain: DomainHint;
  yearsHint: number;
  layoutId: string;
  vendorName: string;
};

function expBlock(
  projects: StructureProject[],
  skills: string[],
  bullet: string,
  sep: string,
  stackLabel: string
): string[] {
  const out: string[] = [];
  for (const p of projects) {
    const end = p.endYear === "Present" ? "Present" : String(p.endYear);
    out.push(p.title);
    out.push(`Employer / Client: ${p.client}`);
    const loc = (p.location || "").trim();
    // Omit invented/unknown years (0) and empty locations — never stamp defaults
    const hasYears = p.startYear >= 1980;
    const datePart = hasYears ? `${p.startYear} – ${end}` : "";
    if (loc && datePart) out.push(`${loc}  |  ${datePart}`);
    else if (loc) out.push(loc);
    else if (datePart) out.push(datePart);
    // Modules = this project's skills only — never stamp global JD pack on every role
    const stack = Array.from(new Set(p.skills.filter(Boolean))).slice(0, 10);
    if (stack.length) out.push(`${stackLabel}: ${stack.join(sep)}`);
    out.push("");
    for (const b of p.bullets) {
      const t = b.replace(/^[•▸→–\-\*◆›]\s*/, "").trim();
      if (t) out.push(`${bullet} ${t}`);
    }
    out.push("");
    out.push("");
  }
  return out;
}

function sectionLines(
  key: SectionKey,
  cfg: LayoutConfig,
  c: ContentBundle
): string[] {
  const bullet = cfg.style.bullet;
  const sep = cfg.style.skillSeparator;
  // Use only content-derived skills — never inject canned domain packs
  const skills = Array.from(new Set(c.skills.filter(Boolean))).slice(0, 40);

  switch (key) {
    case "summary":
      return c.summaryLines.slice(0, 12);
    case "skills": {
      // Strip accidental section prefixes from skill tokens (avoid "Core: Core: …")
      const clean = skills
        .map((s) =>
          String(s)
            .replace(
              /^(core|platforms?\s*&\s*integration|methods?|primary|secondary|extended|jd keywords)\s*:\s*/i,
              ""
            )
            .trim()
        )
        .filter(Boolean);
      if (cfg.id === "technical_dense" || cfg.id === "skills_first") {
        const third = Math.ceil(clean.length / 3) || 1;
        return [
          c.yearsHint > 0
            ? `${c.headline}  ·  ~${c.yearsHint}+ years progressive delivery`
            : c.headline,
          `PRIMARY  ::  ${clean.slice(0, third).join(sep)}`,
          `SECONDARY  ::  ${clean.slice(third, third * 2).join(sep)}`,
          `EXTENDED  ::  ${clean.slice(third * 2).join(sep)}`,
        ].filter((l) => !l.endsWith("::  "));
      }
      return [
        `Core: ${clean.slice(0, 14).join(sep)}`,
        clean.slice(14, 28).length
          ? `Platforms & Integration: ${clean.slice(14, 28).join(sep)}`
          : "",
        clean.slice(28).length
          ? `Methods: ${clean.slice(28).join(sep)}`
          : "",
      ].filter(Boolean);
    }
    case "impact":
      return c.impactLines.map((l) => {
        const body = l.replace(/^[•▸→–\-\*◆›]\s*/, "").trim();
        return body.startsWith(bullet) ? body : `${bullet} ${body}`;
      });
    case "experience": {
      const label =
        cfg.id === "technical_dense"
          ? "Modules"
          : cfg.id === "timeline_progressive"
            ? "Chapter stack"
            : "Environment";
      return expBlock(c.projects, skills, bullet, sep, label);
    }
    case "education":
      // Defaults come from admin policy (passed in as educationLines when empty upstream)
      return c.educationLines.slice(0, 10);
    case "methodology":
      return c.methodologyLines.length
        ? c.methodologyLines
        : skills.length
          ? [`JD focus: ${skills.slice(0, 8).join(sep)}.`]
          : c.jobTitle
            ? [`Role focus: ${c.jobTitle}.`]
            : [];
    case "highlights":
      return c.impactLines.slice(0, 6);
    default:
      return [];
  }
}

/** Build structured resume from content + layout config section order */
export function buildStructuredFromLayout(c: ContentBundle): StructuredResume {
  const cfg = getLayoutConfig(c.layoutId);
  const ordered = [...cfg.sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);

  const sections: ResumeSection[] = [];
  for (const s of ordered) {
    const lines = sectionLines(s.key, cfg, c).filter(
      (l) => l !== undefined && l !== null
    );
    if (!lines.some((l) => String(l).trim())) continue;
    sections.push({ heading: s.heading, lines });
  }

  return {
    candidateName: c.candidateName,
    headline: c.headline,
    contactLine: c.contactLine,
    layoutId: cfg.id,
    sections,
    meta: {
      atsScore: 0,
      skillFingerprint: "",
      jobTitle: c.jobTitle,
      progressiveNotes: [
        `Layout: ${cfg.name} · ${cfg.researchSpine}`,
        `Projects: ${c.projects.length}`,
      ],
    },
  };
}

export function renderPlainFromStructured(s: StructuredResume): string {
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
