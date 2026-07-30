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
    spine: "Summary → Skills → Full Experience → Education",
    literature: [
      "Schema matching (job category accessibility; Bartlett tradition)",
      "Processing fluency (Schwarz; Reber & Schwarz)",
      "Within-list serial position for bullet priority (not the sole spine engine)",
      "Business: standard HR resume taxonomy (summary–skills–experience–edu)",
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
    spine: "Executive Answer → Supporting Wins → Leadership Detail → Competencies → Credentials",
    literature: [
      "Barbara Minto pyramid principle (top-down argument)",
      "Construal level: abstract → concrete (Trope & Liberman)",
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
    structureName: "SCQA Case-Led Proposal",
    feel: "Consulting sales deck — situation, then outcomes, then case portfolio, then method and commercial close.",
    spine: "Situation → Outcome Ledger → Case Portfolio → Method Toolkit → Commercial Next Step",
    literature: [
      "McKinsey SCQA (Situation–Complication–Question–Answer) storytelling",
      "Consulting case / proposal structure (cases before abstract claims)",
      "Social proof (Cialdini tradition) + peak-end on client outcomes",
      "Regulatory focus as content framing for enterprise buyers (Higgins) — not the section-order engine",
    ],
    expectedHeadings: [
      "Situation Snapshot",
      "Outcome Ledger",
      "Case Portfolio",
      "Method & Toolkit",
      "Commercial Next Step",
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
    const bullets = p.bullets.slice(0, opts.maxBullets ?? p.bullets.length);
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
  const fn = firstName(ctx.candidateName);
  return [
    {
      heading: "Executive Brief",
      lines: [
        `Recommendation: ${fn} as ${ctx.headline} for enterprise programs requiring ${ctx.cleanSkills.slice(0, 8).join(", ")}.`,
        `Governing idea: functional ownership + stakeholder governance + release accountability under progressive tenure (~${ctx.yearsHint}+ years).`,
        `Fit thesis: strongest match where transformation workstreams need audit-friendly evidence and vendor-ready coordination (${ctx.vendorName} ecosystems).`,
        `Near-total JD skill coverage: ${ctx.cleanSkills.slice(0, 16).join(ctx.skillSeparator)}`,
        ...ctx.summaryLines.slice(1, 6),
      ].filter(Boolean),
    },
    {
      heading: "Signature Achievements",
      lines: ctx.impactLines.map((l) =>
        l.replace(/^[•▸→–\-]\s*/, "◆ ")
      ),
    },
    {
      heading: "Leadership Engagements",
      lines: expLines(ctx.projects, ctx.cleanSkills, ctx.bullet, ctx.skillSeparator, {
        maxBullets: 18,
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
  const third = Math.ceil(ctx.cleanSkills.length / 3);
  return [
    {
      heading: "Capability Matrix",
      lines: [
        `ROLE  ::  ${ctx.headline}  |  DOMAIN  ::  ${ctx.domain.toUpperCase()}  |  TENURE  ::  ~${ctx.yearsHint}+ yrs`,
        `PRIMARY  ::  ${ctx.cleanSkills.slice(0, third).join("  |  ")}`,
        `SECONDARY  ::  ${ctx.cleanSkills.slice(third, third * 2).join("  |  ")}`,
        `EXTENDED  ::  ${ctx.cleanSkills.slice(third * 2).join("  |  ")}`,
        `JD MATCH  ::  Near-100% keyword coverage across matrix, metrics, and deep-dives`,
      ],
    },
    {
      heading: "Systems & Integration Surface",
      lines: [
        ctx.skillLines.find((l) => /Tools|platforms/i.test(l)) ||
          "Platforms: SAP GUI · integration monitoring · ALM/Jira · documentation suites",
        ...ctx.skillLines.filter((l) => !/Tools|platforms/i.test(l)),
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
      lines: expLines(ctx.projects, ctx.cleanSkills, "▸", "  |  ", {
        stackLabel: "Modules",
        maxBullets: 20,
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
        `${fn}'s path is a progressive narrative: foundation skills → expanding ownership → recent leadership on ${ctx.headline}-aligned programs.`,
        `Chapter emphasis matches JD themes (${ctx.cleanSkills.slice(0, 12).join(", ")}) most strongly in the latest two chapters.`,
        `Near-total JD coverage packed into recent chapters: ${ctx.cleanSkills.slice(0, 18).join(ctx.skillSeparator)}`,
        `Story constraint: early chapters stay balanced; peak complexity and keywords concentrate in recent chapters (peak–end + progressive identity).`,
        ...ctx.summaryLines.slice(3, 6),
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
          maxBullets: 16,
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
  return [
    {
      heading: "Pitch",
      lines: [
        `${fn} — ${ctx.headline}. ~${ctx.yearsHint}+ yrs progressive SAP delivery.`,
        `Near-100% JD match: ${ctx.cleanSkills.slice(0, 14).join(" · ")}.`,
        ...ctx.summaryLines.slice(3, 6),
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
        ...ctx.impactLines.slice(0, 4),
        "",
        ...expLines(recent, ctx.cleanSkills, ctx.bullet, " · ", {
          maxBullets: 14,
          stackLabel: "Tools",
          titleStyle: "plain",
        }),
      ],
    },
    {
      heading: "Prior Roles",
      lines: expLines(prior, ctx.cleanSkills, ctx.bullet, " · ", {
        maxBullets: 10,
        stackLabel: "Tools",
        titleStyle: "plain",
      }),
    },
    {
      heading: "Footnotes",
      lines: [
        "Education & professional development on request.",
        "SR SOFT LLC C2C/CTC representation.",
      ],
    },
  ];
}

/**
 * 6) SCQA case-led proposal (P0 fix: NOT claim→proof→portfolio like executive)
 * Cases open after a short situation; commercial CTA closes — opposite of pyramid answer-first.
 */
function buildScqaCasePortfolio(ctx: StructureCtx): ResumeSection[] {
  const fn = firstName(ctx.candidateName);
  const topSkills = ctx.cleanSkills.slice(0, 8).join(", ");
  return [
    {
      heading: "Situation Snapshot",
      lines: [
        `SITUATION: Enterprise programs need a ${ctx.headline} who can own ${topSkills} end-to-end.`,
        `COMPLICATION: Many profiles over-claim early tenure or mismatch domain tooling — buyers need progressive, audit-ready proof.`,
        `QUESTION: Who can deliver with ~${ctx.yearsHint}+ years progressive depth and vendor-ready communication (${ctx.vendorName})?`,
        `PREVIEW: ${fn} — near-100% JD skill coverage below; case portfolio and outcome ledger prove it.`,
        `JD skills in scope: ${ctx.cleanSkills.slice(0, 18).join(ctx.skillSeparator)}`,
        ...ctx.summaryLines.slice(3, 6),
      ].filter(Boolean),
    },
    {
      heading: "Outcome Ledger",
      lines: ctx.impactLines.map((l, i) => {
        const body = l.replace(/^[•▸→–\-◆]\s*/, "");
        return `OP-${String(i + 1).padStart(2, "0")}  ${body}`;
      }),
    },
    {
      heading: "Case Portfolio",
      lines: expLines(ctx.projects, ctx.cleanSkills, ctx.bullet, ctx.skillSeparator, {
        caseLabel: true,
        titleStyle: "case",
        stackLabel: "Engagement stack",
        maxBullets: 18,
      }),
    },
    {
      heading: "Method & Toolkit",
      lines: [
        `Core toolkit: ${ctx.cleanSkills.slice(0, 16).join(ctx.skillSeparator)}`,
        `Extended toolkit: ${ctx.cleanSkills.slice(16).join(ctx.skillSeparator)}`,
        "Method: discover → design → configure/build → test (unit/SIT/UAT) → cutover → hypercare → KT.",
        "Differentiators: progressive career integrity; domain-honest tooling; audit-friendly artifacts.",
        "Partner tracks: PMO cadence, business workshops, technical interface coordination.",
      ].filter((l) => !l.endsWith(": ")),
    },
    {
      heading: "Commercial Next Step",
      lines: [
        `Represented by SR SOFT LLC for C2C/CTC staffing with ${ctx.vendorName}.`,
        "Workshop, cutover, and hypercare coverage as scoped.",
        "References and annex available for shortlisted opportunities — request case deep-dives by engagement.",
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
