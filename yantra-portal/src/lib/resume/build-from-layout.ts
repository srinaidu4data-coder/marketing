/**
 * Map AI content + master anchors into layout-specific STRUCTURE + style.
 *
 * Critical: the 6 core layouts use `buildSectionsForLayout` so section order,
 * headings, and rhetoric actually differ (not color-only reskins).
 */

import type { DomainHint } from "./jd-parse";
import { getLayoutConfig, type LayoutConfig, type SectionKey } from "./layout-config";
import {
  buildSectionsForLayout,
  STRUCTURE_CATALOG,
  type StructureProject,
} from "./layout-structures";
import { filterEnvironmentTokens } from "./environment-stack";
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

/** Layouts with a dedicated non-isomorphic structure builder */
const STRUCTURE_LAYOUT_IDS = new Set(STRUCTURE_CATALOG.map((s) => s.id));

function cleanSkillTokens(skills: string[]): string[] {
  return Array.from(new Set(skills.filter(Boolean)))
    .map((s) =>
      String(s)
        .replace(
          /^(core|platforms?\s*&\s*integration|methods?|primary|secondary|extended|jd keywords|jd focus phrases)\s*:\s*/i,
          ""
        )
        .trim()
    )
    .filter((s) => s.length > 1 && s.length < 60)
    .slice(0, 40);
}

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
    const hasYears = p.startYear >= 1980;
    const datePart = hasYears ? `${p.startYear} – ${end}` : "";
    if (loc && datePart) out.push(`${loc}  |  ${datePart}`);
    else if (loc) out.push(loc);
    else if (datePart) out.push(datePart);
    // Tools only — soft skills / title fragments never on Environment
    const stack = filterEnvironmentTokens(p.skills || [], { max: 10 });
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
  const skills = cleanSkillTokens(c.skills);

  switch (key) {
    case "summary":
      return c.summaryLines.slice(0, 12);
    case "skills": {
      if (cfg.id === "technical_dense" || cfg.id === "skills_first") {
        const third = Math.ceil(skills.length / 3) || 1;
        return [
          c.yearsHint > 0
            ? `${c.headline}  ·  ~${c.yearsHint}+ years progressive delivery`
            : c.headline,
          `PRIMARY  ::  ${skills.slice(0, third).join(sep)}`,
          `SECONDARY  ::  ${skills.slice(third, third * 2).join(sep)}`,
          `EXTENDED  ::  ${skills.slice(third * 2).join(sep)}`,
        ].filter((l) => !l.endsWith("::  "));
      }
      return [
        `Core: ${skills.slice(0, 14).join(sep)}`,
        skills.slice(14, 28).length
          ? `Platforms & Integration: ${skills.slice(14, 28).join(sep)}`
          : "",
        skills.slice(28).length
          ? `Methods: ${skills.slice(28).join(sep)}`
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
      return c.educationLines.slice(0, 10);
    case "methodology":
      return c.methodologyLines.length
        ? c.methodologyLines
        : skills.length
          ? // Real skill tokens only — never "JD focus:" with location/position crumbs
            [`Methods: ${skills.slice(0, 8).join(sep)}.`]
          : c.jobTitle
            ? [`Role methods aligned to ${c.jobTitle}.`]
            : [];
    case "highlights":
      return c.impactLines.slice(0, 6);
    default:
      return [];
  }
}

/**
 * Build structured resume.
 * Prefer `buildSectionsForLayout` for the 6 non-isomorphic spines so Preview / DOCX / PDF
 * actually open with different first sections and rhetoric.
 */
export function buildStructuredFromLayout(c: ContentBundle): StructuredResume {
  const cfg = getLayoutConfig(c.layoutId);
  const cleanSkills = cleanSkillTokens(c.skills);
  let sections: ResumeSection[] = [];
  let structureNote = `Layout: ${cfg.name} · ${cfg.researchSpine}`;

  if (STRUCTURE_LAYOUT_IDS.has(cfg.id)) {
    sections = buildSectionsForLayout({
      layoutId: cfg.id,
      candidateName: c.candidateName,
      headline: c.headline,
      vendorName: c.vendorName || "",
      domain: c.domain,
      yearsHint: c.yearsHint,
      cleanSkills,
      summaryLines: c.summaryLines.slice(0, 12),
      skillLines: c.methodologyLines.slice(0, 4),
      impactLines: c.impactLines.slice(0, 10),
      projects: c.projects,
      bullet: cfg.style.bullet,
      skillSeparator: cfg.style.skillSeparator,
    });
    // Prefer real education from master over hardcoded placeholders
    if (c.educationLines?.length) {
      sections = sections.map((sec) => {
        if (
          /education|credential|foundation|footnotes|background/i.test(
            sec.heading
          )
        ) {
          return { ...sec, lines: c.educationLines.slice(0, 10) };
        }
        return sec;
      });
    }
    structureNote = `Layout: ${cfg.name} · structure=${cfg.id} · ${cfg.researchSpine}`;
  } else {
    // Extra layouts: config-driven section order (still distinct headings/styles)
    const ordered = [...cfg.sections]
      .filter((s) => s.enabled)
      .sort((a, b) => a.order - b.order);
    for (const s of ordered) {
      const lines = sectionLines(s.key, cfg, c).filter(
        (l) => l !== undefined && l !== null
      );
      if (!lines.some((l) => String(l).trim())) continue;
      sections.push({ heading: s.heading, lines });
    }
  }

  // Drop empty sections
  sections = sections.filter((s) =>
    s.lines.some((l) => String(l || "").trim())
  );

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
        structureNote,
        `Projects: ${c.projects.length}`,
        `First section: ${sections[0]?.heading || "(none)"}`,
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
