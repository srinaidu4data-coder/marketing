/**
 * One content STRUCTURE per layout — different section order, labels, density, and rhetoric.
 *
 * Design rule: no two layouts may share the same reading spine.
 *
 * Literature anchors:
 * - Psychology: primacy/recency, fluency, schema match, dual-process, peak-end, narrative identity,
 *   construal level, cognitive load / chunking, regulatory focus, thin-slicing, F-pattern scanning
 * - Mathematics / decision science: serial position curves, information hierarchy (pyramid),
 *   sparse signals (high SNR), modular decomposition, progressive disclosure
 * - Business: Minto pyramid, McKinsey SCQA, AIDA, consulting case decks, product one-pager,
 *   capability matrix / RFP response, standard HR taxonomy
 */

import type { ResumeLayoutId, ResumeSection } from "./templates";
import type { DomainHint } from "./jd-parse";
import { LAYOUT_RHETORIC } from "./research-foundations";

/** Minimal project shape — avoids circular import with progressive-tailor */
export type StructureProject = {
  title: string;
  client: string;
  location: string;
  startYear: number;
  endYear: number | "Present";
  bullets: string[];
  skills: string[];
  era: "early" | "mid" | "recent";
};

export type StructureCtx = {
  layoutId: ResumeLayoutId;
  candidateName: string;
  headline: string;
  vendorName: string;
  domain: DomainHint;
  yearsHint: number;
  cleanSkills: string[];
  summaryLines: string[];
  skillLines: string[];
  impactLines: string[];
  projects: StructureProject[];
  bullet: string;
  skillSeparator: string;
};

export type StructureDef = {
  id: ResumeLayoutId;
  name: string;
  /** Human-readable structure identity */
  structureName: string;
  /** One-line “why it feels different” */
  feel: string;
  /** Reading spine in plain English (for UI + RT agents) */
  spine: string;
  /** Literature anchors (short) */
  literature: string[];
  /** Ordered section headings (for validation) */
  expectedHeadings: string[];
};

/**
 * Six spines — intentionally non-isomorphic:
 *
 * 1. ats_classic        IDENTITY → CLAIM → SKILLS → ALL ROLES → CLOSE
 * 2. executive_serif    ANSWER → SUPPORTING POINTS → DETAIL → COMPETENCIES → CRED
 * 3. technical_dense    MATRIX → INTERFACES → METRICS → DEEP-DIVES → PRACTICES
 * 4. timeline_progressive  STORY HOOK → CHRONO CHAPTERS → EVOLUTION → PEAKS → ROOTS
 * 5. modern_minimal     PROOF WORK → KEYWORDS → ONE-LINE PITCH → ARCHIVE → FOOTNOTE
 * 6. consultant_band    SITUATION → CASE DECK → OUTCOMES → METHOD → COMMERCIAL CTA
 */
export const STRUCTURE_CATALOG: StructureDef[] = [
  {
    id: "ats_classic",
    name: "ATS Classic",
    structureName: "Canonical Linear Checklist",
    feel: "Strict corporate order recruiters and parsers expect — no surprises.",
    spine: LAYOUT_RHETORIC.ats_classic.spine + " · Summary → Skills → Impact → Experience → Education",
    literature: [
      "Schema matching + processing fluency (System-1 6s scan)",
      "Serial position: JD proof primacy on page 1",
      "TF–IDF / ATS keyword gate density",
      "Standard HR taxonomy (summary–skills–experience–edu)",
      LAYOUT_RHETORIC.ats_classic.principle,
    ],
    expectedHeadings: [
      "Professional Summary",
      "Core Competencies",
      "Selected Impact Snapshot",
      "Professional Experience",
      "Education",
    ],
  },
  {
    id: "executive_serif",
    name: "Executive Serif",
    structureName: "Minto Pyramid Brief",
    feel: "Answer-first leadership memo — conclusion before evidence.",
    spine: LAYOUT_RHETORIC.executive_serif.spine + " · Answer → Wins → Engagements → Competencies → Credentials",
    literature: [
      "Barbara Minto pyramid principle (top-down argument)",
      "Construal level: abstract → concrete (Trope & Liberman)",
      LAYOUT_RHETORIC.executive_serif.principle,
      "Signaling theory for credentials / claim specificity (Spence)",
      "Dual-process: System-1 fit then System-2 proof (Kahneman)",
    ],
    expectedHeadings: [
      "Executive Brief",
      "Signature Achievements",
      "Leadership Engagements",
      "Board-Level Competencies",
      "Credentials",
    ],
  },
  {
    id: "technical_dense",
    name: "Technical Dense",
    structureName: "Stack-First Modular Spec",
    feel: "Engineer one-pager: capability matrix and interfaces before story.",
    spine: "Capability Matrix → Systems Surface → Delivery Metrics → Deep-Dives → Practices",
    literature: [
      "Cognitive load / chunking (Sweller CLT; Miller 7±2; Cowan ~4)",
      "High signal-to-noise information design",
      "Modular decomposition (systems engineering)",
      "Business: technical capability matrix / RFP response packs",
    ],
    expectedHeadings: [
      "Capability Matrix",
      "Systems & Integration Surface",
      "Delivery Metrics",
      "Deep-Dive Engagements",
      "Engineering Practices",
    ],
  },
  {
    id: "timeline_progressive",
    name: "Timeline Progressive",
    structureName: "Narrative Growth Arc",
    feel: "Career as a story of progressive mastery over time.",
    spine: "Career Arc → Chapter Timeline → Skill Evolution → Defining Milestones → Foundation",
    literature: [
      "Narrative identity (McAdams)",
      "Progressive disclosure (UX complexity management)",
      "Peak-end rule across career chapters (Kahneman)",
      "Business: career path / transformation journey maps",
    ],
    expectedHeadings: [
      "Career Arc",
      "Chapter Timeline",
      "Skill Evolution",
      "Defining Milestones",
      "Foundation",
    ],
  },
  {
    id: "modern_minimal",
    name: "Modern Minimal",
    structureName: "Proof-First Dense One-Pager",
    feel: "F-pattern product sheet — dense pitch + keywords, then selected work proof.",
    spine: "Pitch → Keywords → Selected Work → Prior Roles → Footnotes",
    literature: [
      "Eye-tracking F-pattern (Nielsen-style scanning; left-edge primacy)",
      "Thin-slicing first impressions (Ambady)",
      "Less-is-more aesthetics / fluency under low cognitive load",
      "Business: product one-pager / personal brand sheet (proof above fold)",
    ],
    expectedHeadings: [
      "Pitch",
      "Keywords",
      "Selected Work",
      "Prior Roles",
      "Footnotes",
    ],
  },
  {
    id: "consultant_band",
    name: "Consultant Band",
    structureName: "Impact-Led Professional Pack",
    feel: "Bold header band with clean professional sections — summary, skills, achievements, experience.",
    spine: "Profile Summary → Core Skills → Key Achievements → Professional Experience → Education",
    literature: [
      "Peak-end achievements before full history",
      "Schema match via skills block",
      "Consulting delivery evidence without sales-deck framing",
      "Primacy of recent proof for enterprise buyers",
    ],
    expectedHeadings: [
      "Profile Summary",
      "Core Skills",
      "Key Achievements",
      "Professional Experience",
      "Education",
    ],
  },
];

function expLines(
  projects: StructureProject[],
  cleanSkills: string[],
  bullet: string,
  sep: string,
  opts: {
    recentOnly?: boolean;
    earlyLabel?: boolean;
    caseLabel?: boolean;
    maxBullets?: number;
    stackLabel?: string;
    titleStyle?: "em" | "plain" | "case";
  } = {}
): string[] {
  const list = opts.recentOnly
    ? projects.filter((p) => p.era === "recent" || p.era === "mid")
    : projects;
  const out: string[] = [];
  for (const p of list) {
    const end = p.endYear === "Present" ? "Present" : String(p.endYear);
    const client = (p.client || "").trim() || "Client organization (see master)";
    // Role title (always separate from employer so client name cannot be dropped)
    let title: string;
    if (opts.titleStyle === "case" || opts.caseLabel) {
      title = `Case · ${p.title}`;
    } else if (opts.titleStyle === "plain") {
      title = p.title;
    } else {
      title = p.title;
    }
    if (opts.earlyLabel && p.era === "early") {
      out.push(`[Foundation] ${title}`);
    } else if (opts.earlyLabel && p.era === "mid") {
      out.push(`[Growth] ${title}`);
    } else if (opts.earlyLabel && p.era === "recent") {
      out.push(`[Recent leadership] ${title}`);
    } else {
      out.push(title);
    }
    // MANDATORY: employer/client on its own line for every project (all layouts)
    out.push(`Employer / Client: ${client}`);
    out.push(`${p.location}  |  ${p.startYear} – ${end}`);
    const stack =
      p.era === "recent"
        ? Array.from(new Set([...cleanSkills.slice(0, 12), ...p.skills])).slice(0, 14)
        : p.skills.slice(0, 10);
    out.push(`${opts.stackLabel || "Stack"}: ${stack.join(sep)}`);
    out.push("");
    // ONE LAW: never render more than 12 bullets per employer
    const bulletCap = Math.min(12, opts.maxBullets ?? 12);
    const bullets = p.bullets.slice(0, bulletCap);
    for (const b of bullets) out.push(`${bullet} ${b}`);
    out.push("");
    out.push("");
  }
  return out;
}

function firstName(name: string) {
  return name.split(/\s+/)[0] || name;
}

/** Build sections unique to layout structure */
export function buildSectionsForLayout(ctx: StructureCtx): ResumeSection[] {
  switch (ctx.layoutId) {
    case "ats_classic":
      return buildAtsClassic(ctx);
    case "executive_serif":
      return buildExecutivePyramid(ctx);
    case "technical_dense":
      return buildTechModular(ctx);
    case "timeline_progressive":
      return buildTimelineNarrative(ctx);
    case "modern_minimal":
      return buildMinimalSparse(ctx);
    case "consultant_band":
      return buildScqaCasePortfolio(ctx);
    default:
      return buildAtsClassic(ctx);
  }
}

/** 1) Canonical HR order — dense first page: summary + skills + impact + experience */
function buildAtsClassic(ctx: StructureCtx): ResumeSection[] {
  return [
    { heading: "Professional Summary", lines: ctx.summaryLines.slice(0, 10) },
    {
      heading: "Core Competencies",
      lines: [
        ctx.cleanSkills.slice(0, 22).join(ctx.skillSeparator),
        ...ctx.skillLines,
      ].filter(Boolean),
    },
    {
      heading: "Selected Impact Snapshot",
      lines: ctx.impactLines,
    },
    {
      heading: "Professional Experience",
      lines: expLines(ctx.projects, ctx.cleanSkills, ctx.bullet, ctx.skillSeparator, {
        stackLabel: "Environment",
      }),
    },
    {
      heading: "Education",
      lines: [
        "Bachelor's degree or equivalent professional experience.",
        "Continuous learning in SAP process and delivery methods.",
      ],
    },
  ];
}

/**
 * 2) Minto Pyramid: ANSWER → SUPPORTING POINTS → DETAIL
 * Distinct from consultant: abstract recommendation opens; cases come third.
 */
function buildExecutivePyramid(ctx: StructureCtx): ResumeSection[] {
  return [
    {
      heading: "Executive Brief",
      lines: [
        `${ctx.headline} profile with ~${ctx.yearsHint > 0 ? ctx.yearsHint + "+" : "multi-year"} years progressive enterprise delivery.`,
        `Strengths: functional ownership, stakeholder governance, and release accountability.`,
        `Core skills: ${ctx.cleanSkills.slice(0, 14).join(ctx.skillSeparator)}`,
        ...ctx.summaryLines.slice(0, 8),
      ].filter(Boolean),
    },
    {
      heading: "Signature Achievements",
      lines: ctx.impactLines.map((l) => {
        const body = l.replace(/^[•▸→–\-◆]\s*/, "").replace(/^OP-\d+\s+/i, "");
        return `${ctx.bullet || "•"} ${body}`;
      }),
    },
    {
      heading: "Leadership Engagements",
      lines: expLines(ctx.projects, ctx.cleanSkills, ctx.bullet, ctx.skillSeparator, {
        maxBullets: 12,
        stackLabel: "Program stack",
      }),
    },
    {
      heading: "Board-Level Competencies",
      lines: [
        `Strategic: ${ctx.cleanSkills.slice(0, 14).join(ctx.skillSeparator)}`,
        `JD-aligned toolkit: ${ctx.cleanSkills.slice(14, 28).join(ctx.skillSeparator)}`,
        "Governance: workstream status, risk escalation, go/no-go readiness, audit-friendly evidence.",
        "Influence: workshops with business owners, PMO cadence, multi-vendor coordination.",
        "Integrity: era-honest tooling; progressive claims matched to tenure.",
      ].filter((l) => !l.endsWith(": ")),
    },
    {
      heading: "Credentials",
      lines: [
        "Formal education and professional development consistent with senior consulting delivery.",
        "References and detailed annex available for qualified opportunities.",
      ],
    },
  ];
}

/**
 * 3) Stack-first modular engineering spec
 * Distinct: matrix opens; no prose summary block at all.
 */
function buildTechModular(ctx: StructureCtx): ResumeSection[] {
  const third = Math.ceil(ctx.cleanSkills.length / 3) || 1;
  const primary = ctx.cleanSkills.slice(0, third).join("  |  ");
  const secondary = ctx.cleanSkills.slice(third, third * 2).join("  |  ");
  const extended = ctx.cleanSkills.slice(third * 2).join("  |  ");
  return [
    {
      heading: "Capability Matrix",
      lines: [
        // No "ROLE" / "JD" meta labels — professional matrix only
        `${ctx.headline}  ·  ~${ctx.yearsHint}+ years progressive SAP delivery`,
        primary ? `PRIMARY  ::  ${primary}` : "",
        secondary ? `SECONDARY  ::  ${secondary}` : "",
        extended ? `EXTENDED  ::  ${extended}` : "",
      ].filter(Boolean),
    },
    {
      heading: "Systems & Integration Surface",
      lines: [
        ctx.skillLines.find((l) => /Tools|platforms/i.test(l)) ||
          "Platforms: SAP GUI · integration monitoring · ALM/Jira · documentation suites",
        ...ctx.skillLines.filter(
          (l) =>
            !/Tools|platforms/i.test(l) &&
            !/\bJD\b|near-100%|keyword coverage|80\s*\/\s*hr/i.test(l)
        ),
        "Interfaces: IDoc / RFC / EDI patterns as applicable to engagement scope.",
        "Quality gates: unit → SIT → UAT traceability; transport discipline; peer review on critical objects.",
      ].filter(Boolean),
    },
    {
      heading: "Delivery Metrics",
      lines: ctx.impactLines.map((l) => l.replace(/^[•▸→–\-]\s*/, "→ ")),
    },
    {
      heading: "Deep-Dive Engagements",
      // ALL master projects — never recentOnly (that dropped mid/early history)
      lines: expLines(ctx.projects, ctx.cleanSkills, "▸", "  |  ", {
        stackLabel: "Modules",
        maxBullets: 12,
      }),
    },
    {
      heading: "Engineering Practices",
      lines: [
        "Spec → build → test → release → hypercare → AMS KT.",
        "Prefer standard SAP capability; document gaps with impact and approval path.",
        "Temporal integrity on tooling; progressive ownership claims by era.",
      ],
    },
  ];
}

/**
 * 4) Narrative growth chapters — only layout that uses chapter framing
 */
function buildTimelineNarrative(ctx: StructureCtx): ResumeSection[] {
  const fn = firstName(ctx.candidateName);
  const recent = ctx.projects.filter((p) => p.era === "recent");
  const mid = ctx.projects.filter((p) => p.era === "mid");
  const early = ctx.projects.filter((p) => p.era === "early");
  return [
    {
      heading: "Career Arc",
      lines: [
        `${fn} progressed from foundation delivery to expanding ownership to recent leadership as ${ctx.headline}.`,
        `Core focus across the arc: ${ctx.cleanSkills.slice(0, 12).join(", ")}.`,
        `Recent chapters concentrate specialized depth; earlier chapters establish fundamentals without oversell.`,
        ...ctx.summaryLines.slice(0, 4),
      ].filter(Boolean),
    },
    {
      heading: "Chapter Timeline",
      lines: [
        ...expLines(recent, ctx.cleanSkills, ctx.bullet, ctx.skillSeparator, {
          earlyLabel: true,
          stackLabel: "Chapter stack",
        }),
        ...expLines(mid, ctx.cleanSkills, ctx.bullet, ctx.skillSeparator, {
          earlyLabel: true,
          stackLabel: "Chapter stack",
          maxBullets: 12,
        }),
        ...expLines(early, ctx.cleanSkills, ctx.bullet, ctx.skillSeparator, {
          earlyLabel: true,
          stackLabel: "Chapter stack",
          maxBullets: 12,
        }),
      ],
    },
    {
      heading: "Skill Evolution",
      lines: [
        `Foundation: core SAP navigation, testing discipline, documentation, guided configuration.`,
        `Growth: functional ownership, specs, SIT/UAT leadership support, cross-team coordination.`,
        `Recent: workstream leadership, ${ctx.cleanSkills.slice(0, 10).join(", ")}, release accountability with ${ctx.vendorName}-style vendor ecosystems.`,
        `Full toolkit: ${ctx.cleanSkills.join(ctx.skillSeparator)}`,
      ],
    },
    {
      heading: "Defining Milestones",
      lines: ctx.impactLines,
    },
    {
      heading: "Foundation",
      lines: [
        "Education and continuous professional development supporting long-horizon consulting careers.",
        "References available for milestone verification on request.",
      ],
    },
  ];
}

/**
 * 5) Proof-first sparse one-pager (P0 fix: NOT summary→skills→exp)
 * Work opens; pitch is a single line late; no "chapters" language (timeline owns that).
 */
function buildMinimalSparse(ctx: StructureCtx): ResumeSection[] {
  const fn = firstName(ctx.candidateName);
  const recent = ctx.projects.filter((p) => p.era === "recent");
  const prior = ctx.projects.filter((p) => p.era !== "recent");
  const bullet = ctx.bullet || "•";
  return [
    {
      heading: "Pitch",
      lines: [
        `${fn} — ${ctx.headline}. ~${ctx.yearsHint}+ years progressive SAP delivery.`,
        `Skills: ${ctx.cleanSkills.slice(0, 14).join(" · ")}.`,
        ...ctx.summaryLines.slice(2, 5),
      ].filter(Boolean),
    },
    {
      heading: "Keywords",
      lines: [
        ctx.cleanSkills.slice(0, 20).join("    ·    "),
        ctx.cleanSkills.slice(20).join("    ·    "),
      ].filter(Boolean),
    },
    {
      heading: "Selected Work",
      lines: [
        ...ctx.impactLines.slice(0, 4).map((l) => {
          const body = l.replace(/^[•▸→–\-◆]\s*/, "").replace(/^OP-\d+\s+/i, "");
          return `${bullet} ${body}`;
        }),
        "",
        ...expLines(recent, ctx.cleanSkills, bullet, " · ", {
          maxBullets: 12,
          stackLabel: "Tools",
          titleStyle: "plain",
        }),
      ],
    },
    {
      heading: "Prior Roles",
      lines: expLines(prior, ctx.cleanSkills, bullet, " · ", {
        maxBullets: 10,
        stackLabel: "Tools",
        titleStyle: "plain",
      }),
    },
    {
      heading: "Footnotes",
      lines: ["Education and professional development available on request."],
    },
  ];
}

/**
 * 6) Consultant band — professional impact-led pack (no sales-deck SCQA chatter).
 */
function buildScqaCasePortfolio(ctx: StructureCtx): ResumeSection[] {
  const bullet = ctx.bullet || "•";
  return [
    {
      heading: "Profile Summary",
      lines: ctx.summaryLines.slice(0, 8),
    },
    {
      heading: "Core Skills",
      lines: [
        ctx.cleanSkills.slice(0, 20).join(ctx.skillSeparator),
        ctx.cleanSkills.slice(20).join(ctx.skillSeparator),
        ...ctx.skillLines.filter((l) => !/^JD /i.test(l)),
      ].filter(Boolean),
    },
    {
      heading: "Key Achievements",
      lines: ctx.impactLines.map((l) => {
        const body = l.replace(/^[•▸→–\-◆]\s*/, "").replace(/^OP-\d+\s+/i, "");
        return `${bullet} ${body}`;
      }),
    },
    {
      heading: "Professional Experience",
      lines: expLines(ctx.projects, ctx.cleanSkills, bullet, ctx.skillSeparator, {
        stackLabel: "Environment",
        maxBullets: 12,
      }),
    },
    {
      heading: "Education",
      lines: [
        "Bachelor's degree or equivalent professional experience.",
        "Continuous professional development in SAP process and delivery methods.",
      ],
    },
  ];
}

export function getStructureDef(layoutId: string): StructureDef {
  return (
    STRUCTURE_CATALOG.find((s) => s.id === layoutId) || STRUCTURE_CATALOG[0]
  );
}

/** First-section headings must all differ — RT uniqueness gate */
export function firstSectionHeadings(): string[] {
  return STRUCTURE_CATALOG.map((s) => s.expectedHeadings[0]);
}
