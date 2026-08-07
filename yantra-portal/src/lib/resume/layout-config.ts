/**
 * Role Forge flagship layouts (5) — psychology-backed, user-selectable.
 * One generation prompt for all; layout only changes structure + visual DNA.
 *
 * Default: signal_classic
 */

export type SectionKey =
  | "summary"
  | "skills"
  | "impact"
  | "experience"
  | "education"
  | "methodology"
  | "highlights";

export type LayoutSectionConfig = {
  key: SectionKey;
  heading: string;
  enabled: boolean;
  order: number;
};

export type LayoutConfig = {
  id: string;
  name: string;
  tagline: string;
  researchSpine: string;
  literature: string[];
  /** Short picker line: reading order */
  scanPath: string;
  /** Best-for label in UI */
  bestFor: string;
  sections: LayoutSectionConfig[];
  style: {
    nameSize: number;
    headlineSize: number;
    headingSize: number;
    bodySize: number;
    accent: string;
    muted: string;
    soft: string;
    headingCase: "upper" | "title";
    bullet: string;
    divider: "line" | "space" | "double" | "accent-bar";
    headerBand: boolean;
    leftRail: boolean;
    skillSeparator: string;
    nameFont: "sans" | "serif";
    bodyFont: "sans" | "serif";
    sectionBar: boolean;
    boldJobTitles: boolean;
    badge?: string;
  };
};

/** Product default — highest dual pass (ATS + 7s skim). */
export const DEFAULT_LAYOUT_ID = "signal_classic";

function secs(
  rows: [SectionKey, string, number][]
): LayoutSectionConfig[] {
  return rows.map(([key, heading, order]) => ({
    key,
    heading,
    enabled: true,
    order,
  }));
}

/**
 * Five non-isomorphic templates from psychology research brief.
 * Content still produced by the same ACTIVE prompt; layout shapes render only.
 */
export const LAYOUT_CONFIGS: LayoutConfig[] = [
  {
    id: "signal_classic",
    name: "Signal Classic",
    tagline: "Modern corporate fluency — default shortlist pack",
    researchSpine:
      "Processing fluency + schema match + F-pattern (7.4s recruiter skim)",
    literature: [
      "TheLadders eye-tracking (6–7.4s)",
      "Schema match / ATS single-column",
      "Primacy of page-1 JD proof",
    ],
    scanPath: "Summary → Skills → Impact → Experience → Education",
    bestFor: "Most SAP / corporate vendor submissions",
    sections: secs([
      ["summary", "Professional Summary", 1],
      ["skills", "Core Competencies", 2],
      ["impact", "Selected Impact", 3],
      ["experience", "Professional Experience", 4],
      ["education", "Education", 5],
    ]),
    style: {
      nameSize: 24,
      headlineSize: 11,
      headingSize: 10,
      bodySize: 10,
      accent: "#0f172a",
      muted: "#64748b",
      soft: "#f8fafc",
      headingCase: "upper",
      bullet: "•",
      divider: "accent-bar",
      headerBand: false,
      leftRail: false,
      skillSeparator: "  ·  ",
      nameFont: "serif",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "pyramid_brief",
    name: "Pyramid Brief",
    tagline: "Answer-first leadership memo (Minto)",
    researchSpine:
      "Minto pyramid + construal level: claim before evidence",
    literature: [
      "Barbara Minto pyramid principle",
      "Trope & Liberman construal level",
      "Serif = trust / executive signal",
    ],
    scanPath: "Executive Brief → Achievements → Engagements → Competencies",
    bestFor: "Architect, program lead, director-level packs",
    sections: secs([
      ["summary", "Executive Brief", 1],
      ["impact", "Signature Achievements", 2],
      ["experience", "Leadership Engagements", 3],
      ["skills", "Board-Level Competencies", 4],
      ["education", "Credentials", 5],
    ]),
    style: {
      nameSize: 26,
      headlineSize: 11,
      headingSize: 11,
      bodySize: 10,
      accent: "#1e3a5f",
      muted: "#64748b",
      soft: "#f0f4f8",
      headingCase: "title",
      bullet: "–",
      divider: "double",
      headerBand: false,
      leftRail: false,
      skillSeparator: "  ·  ",
      nameFont: "serif",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "stack_spec",
    name: "Stack Spec",
    tagline: "Interface-first technical credibility",
    researchSpine:
      "Domain fluency signaling + chunked capability matrix before narrative",
    literature: [
      "Cognitive load / chunking (Sweller)",
      "High SNR information design",
      "Tech recruiter stack-first skim",
    ],
    scanPath: "Capability Matrix → Systems → Metrics → Deep-Dives",
    bestFor: "BASIS, ABAP, integration, data, ATTP technical JDs",
    sections: secs([
      ["skills", "Capability Matrix", 1],
      ["impact", "Delivery Metrics", 2],
      ["experience", "Deep-Dive Engagements", 3],
      ["summary", "Technical Positioning", 4],
      ["education", "Credentials", 5],
    ]),
    style: {
      nameSize: 20,
      headlineSize: 10,
      headingSize: 9,
      bodySize: 9,
      accent: "#0e7490",
      muted: "#64748b",
      soft: "#ecfeff",
      headingCase: "upper",
      bullet: "▸",
      divider: "line",
      headerBand: false,
      leftRail: true,
      skillSeparator: "  |  ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
      badge: "TECH PACK",
    },
  },
  {
    id: "arc_timeline",
    name: "Arc Timeline",
    tagline: "Career as progressive growth story",
    researchSpine:
      "Narrative identity + progressive disclosure + peak–end across chapters",
    literature: [
      "McAdams narrative identity",
      "Peak-end rule (Kahneman)",
      "Progressive tenure psychology",
    ],
    scanPath: "Career Arc → Recent → Growth → Foundation → Skills",
    bestFor: "Transfer candidates and long multi-module careers",
    sections: secs([
      ["summary", "Career Arc", 1],
      ["experience", "Chapter Timeline", 2],
      ["skills", "Skill Evolution", 3],
      ["impact", "Defining Milestones", 4],
      ["education", "Foundation", 5],
    ]),
    style: {
      nameSize: 24,
      headlineSize: 11,
      headingSize: 10,
      bodySize: 10,
      accent: "#059669",
      muted: "#6b7280",
      soft: "#ecfdf5",
      headingCase: "title",
      bullet: "•",
      divider: "accent-bar",
      headerBand: false,
      leftRail: true,
      skillSeparator: "  ·  ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "impact_banner",
    name: "Impact Banner",
    tagline: "High-signal vendor submit pack",
    researchSpine:
      "Peak–end + schema-matched title in hot zone + System-1 header band",
    literature: [
      "Peak-end rule on recent outcomes",
      "Title isomorphism to JD",
      "Halo from polished submit artifact",
    ],
    scanPath: "Header band → Pitch → Skills → Impact Experience",
    bestFor: "Aggressive vendor email packs that must sell in one viewport",
    sections: secs([
      ["summary", "Pitch", 1],
      ["skills", "Core Skills", 2],
      ["impact", "Peak Outcomes", 3],
      ["experience", "Engagements", 4],
      ["education", "Education", 5],
    ]),
    style: {
      nameSize: 24,
      headlineSize: 11,
      headingSize: 10,
      bodySize: 10,
      accent: "#c2410c",
      muted: "#78716c",
      soft: "#fff7ed",
      headingCase: "upper",
      bullet: "•",
      divider: "accent-bar",
      headerBand: true,
      leftRail: false,
      skillSeparator: "  ·  ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
      badge: "SUBMIT PACK",
    },
  },
];

/**
 * Legacy IDs (DB, chains, seeds) → flagship id.
 * One prompt still generates content; layout only remaps structure/style.
 */
export const LAYOUT_ID_ALIASES: Record<string, string> = {
  ats_classic: "signal_classic",
  executive_serif: "pyramid_brief",
  technical_dense: "stack_spec",
  timeline_progressive: "arc_timeline",
  modern_minimal: "signal_classic",
  consultant_band: "impact_banner",
  // Older research set → nearest flagship
  pyramid_brief: "pyramid_brief",
  skills_first: "stack_spec",
  peak_end_case: "impact_banner",
  f_pattern: "signal_classic",
  board_memo: "pyramid_brief",
  research_compact: "stack_spec",
  // Identity aliases
  signal_classic: "signal_classic",
  stack_spec: "stack_spec",
  arc_timeline: "arc_timeline",
  impact_banner: "impact_banner",
};

export function resolveLayoutId(id?: string | null): string {
  const raw = (id || "").trim() || DEFAULT_LAYOUT_ID;
  return LAYOUT_ID_ALIASES[raw] || DEFAULT_LAYOUT_ID;
}

export function getLayoutConfig(id?: string | null): LayoutConfig {
  const resolved = resolveLayoutId(id);
  return (
    LAYOUT_CONFIGS.find((l) => l.id === resolved) || LAYOUT_CONFIGS[0]!
  );
}

export function allLayoutIds(): string[] {
  return LAYOUT_CONFIGS.map((l) => l.id);
}

export function layoutConfigForIndex(i: number): LayoutConfig {
  return LAYOUT_CONFIGS[i % LAYOUT_CONFIGS.length]!;
}

/** Reorder/rename sections (admin customization hook) */
export function applySectionOverrides(
  base: LayoutConfig,
  overrides?: Partial<
    Record<SectionKey, { heading?: string; enabled?: boolean; order?: number }>
  >
): LayoutConfig {
  if (!overrides) return base;
  const sections = base.sections.map((s) => {
    const o = overrides[s.key];
    if (!o) return s;
    return {
      ...s,
      heading: o.heading ?? s.heading,
      enabled: o.enabled ?? s.enabled,
      order: o.order ?? s.order,
    };
  });
  sections.sort((a, b) => a.order - b.order);
  return { ...base, sections };
}
