/**
 * Configurable layout library (12 spines).
 * Section order/headings customizable per layout — research-backed, non-isomorphic.
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
    /** Visual badge under name (e.g. TECH PACK) */
    badge?: string;
  };
};

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

/** 12 distinct, research-oriented layouts — sharp, not clones */
export const LAYOUT_CONFIGS: LayoutConfig[] = [
  {
    id: "ats_classic",
    name: "ATS Classic",
    tagline: "Schema-first HR fluency",
    researchSpine: "Processing fluency + serial position (page-1 JD proof)",
    literature: ["Schema match", "ATS single-column parse safety", "Primacy"],
    sections: secs([
      ["summary", "Professional Summary", 1],
      ["skills", "Core Competencies", 2],
      ["impact", "Selected Impact", 3],
      ["experience", "Professional Experience", 4],
      ["education", "Education", 5],
    ]),
    style: {
      nameSize: 22,
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
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "executive_serif",
    name: "Executive Serif",
    tagline: "Minto answer-first leadership",
    researchSpine: "Minto pyramid — claim before evidence",
    literature: ["Minto", "Construal level abstract→concrete"],
    sections: secs([
      ["summary", "Executive Brief", 1],
      ["impact", "Signature Achievements", 2],
      ["experience", "Leadership Engagements", 3],
      ["skills", "Board-Level Competencies", 4],
      ["education", "Credentials", 5],
    ]),
    style: {
      nameSize: 24,
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
    id: "technical_dense",
    name: "Technical Dense",
    tagline: "Capability matrix / RFP response",
    researchSpine: "Modular decomposition — skills before prose",
    literature: ["Cognitive load chunking", "RFP matrix scan"],
    sections: secs([
      ["skills", "Capability Matrix", 1],
      ["methodology", "Systems & Integration", 2],
      ["impact", "Delivery Metrics", 3],
      ["experience", "Deep-Dive Engagements", 4],
      ["education", "Education", 5],
    ]),
    style: {
      nameSize: 18,
      headlineSize: 10,
      headingSize: 9,
      bodySize: 9,
      accent: "#0e7490",
      muted: "#64748b",
      soft: "#ecfeff",
      headingCase: "upper",
      bullet: "▸",
      divider: "accent-bar",
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
    id: "timeline_progressive",
    name: "Timeline Progressive",
    tagline: "Narrative identity chapters",
    researchSpine: "Progressive disclosure + peak–end",
    literature: ["McAdams narrative identity", "Peak-end rule"],
    sections: secs([
      ["summary", "Career Arc", 1],
      ["experience", "Chapter Timeline", 2],
      ["skills", "Skill Evolution", 3],
      ["impact", "Defining Milestones", 4],
      ["education", "Foundation", 5],
    ]),
    style: {
      nameSize: 20,
      headlineSize: 11,
      headingSize: 10,
      bodySize: 10,
      accent: "#047857",
      muted: "#64748b",
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
    id: "modern_minimal",
    name: "Modern Minimal",
    tagline: "High-SNR sparse proof",
    researchSpine: "Cognitive load reduction — proof first",
    literature: ["Sparse signals", "F-pattern scanning"],
    sections: secs([
      ["impact", "Selected Work", 1],
      ["skills", "Keywords", 2],
      ["summary", "Pitch", 3],
      ["experience", "Prior Roles", 4],
      ["education", "Footnotes", 5],
    ]),
    style: {
      nameSize: 26,
      headlineSize: 11,
      headingSize: 9,
      bodySize: 10,
      accent: "#18181b",
      muted: "#71717a",
      soft: "#fafafa",
      headingCase: "upper",
      bullet: "•",
      divider: "space",
      headerBand: false,
      leftRail: false,
      skillSeparator: "    ·    ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
      badge: "PORTFOLIO",
    },
  },
  {
    id: "consultant_band",
    name: "Consultant Band",
    tagline: "Impact-led commercial pack",
    researchSpine: "Peak-end + SCQA-lite",
    literature: ["Peak-end", "Consulting case evidence"],
    sections: secs([
      ["summary", "Profile Summary", 1],
      ["skills", "Core Skills", 2],
      ["impact", "Key Achievements", 3],
      ["experience", "Professional Experience", 4],
      ["education", "Education", 5],
    ]),
    style: {
      nameSize: 20,
      headlineSize: 11,
      headingSize: 10,
      bodySize: 10,
      accent: "#9a3412",
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
    },
  },
  {
    id: "pyramid_brief",
    name: "Pyramid Brief",
    tagline: "Answer → support → detail",
    researchSpine: "Minto + serial position",
    literature: ["Minto pyramid", "Recruiter 6-second scan"],
    sections: secs([
      ["summary", "The Answer", 1],
      ["impact", "Supporting Points", 2],
      ["skills", "Evidence Toolkit", 3],
      ["experience", "Detail & Delivery", 4],
      ["education", "Background", 5],
    ]),
    style: {
      nameSize: 22,
      headlineSize: 11,
      headingSize: 10,
      bodySize: 10,
      accent: "#312e81",
      muted: "#6366f1",
      soft: "#eef2ff",
      headingCase: "title",
      bullet: "◆",
      divider: "accent-bar",
      headerBand: false,
      leftRail: true,
      skillSeparator: "  ·  ",
      nameFont: "serif",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "skills_first",
    name: "Skills-First Modular",
    tagline: "Stack opens — engineers scan skills",
    researchSpine: "Schema match via skill primacy",
    literature: ["TF-IDF page-1 density", "Chunking"],
    sections: secs([
      ["skills", "Technical Stack", 1],
      ["summary", "Consultant Snapshot", 2],
      ["experience", "Engagements", 3],
      ["impact", "Outcomes", 4],
      ["education", "Education", 5],
    ]),
    style: {
      nameSize: 19,
      headlineSize: 10,
      headingSize: 9,
      bodySize: 9,
      accent: "#155e75",
      muted: "#0e7490",
      soft: "#cffafe",
      headingCase: "upper",
      bullet: "›",
      divider: "line",
      headerBand: false,
      leftRail: false,
      skillSeparator: "  ·  ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "peak_end_case",
    name: "Peak-End Case",
    tagline: "Wins first, then full history",
    researchSpine: "Peak-end rule for memory of quality",
    literature: ["Kahneman peak-end", "Thin-slicing"],
    sections: secs([
      ["impact", "Peak Outcomes", 1],
      ["summary", "Positioning", 2],
      ["experience", "Case History", 3],
      ["skills", "Methods & Tools", 4],
      ["education", "Education", 5],
    ]),
    style: {
      nameSize: 21,
      headlineSize: 11,
      headingSize: 10,
      bodySize: 10,
      accent: "#b45309",
      muted: "#92400e",
      soft: "#fffbeb",
      headingCase: "title",
      bullet: "•",
      divider: "accent-bar",
      headerBand: false,
      leftRail: false,
      skillSeparator: "  ·  ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "f_pattern",
    name: "F-Pattern Scanner",
    tagline: "Short labels + dense bullets",
    researchSpine: "F-pattern eye tracking for web/resume scan",
    literature: ["Nielsen F-pattern", "Fluency"],
    sections: secs([
      ["skills", "SCAN · Skills", 1],
      ["impact", "SCAN · Proof", 2],
      ["experience", "SCAN · History", 3],
      ["summary", "SCAN · Fit", 4],
      ["education", "SCAN · Creds", 5],
    ]),
    style: {
      nameSize: 20,
      headlineSize: 10,
      headingSize: 9,
      bodySize: 9,
      accent: "#0f766e",
      muted: "#115e59",
      soft: "#f0fdfa",
      headingCase: "upper",
      bullet: "•",
      divider: "line",
      headerBand: false,
      leftRail: true,
      skillSeparator: " · ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "board_memo",
    name: "Board Memo",
    tagline: "Abstract claim → concrete proof",
    researchSpine: "Construal level + executive memo",
    literature: ["Trope & Liberman", "Board communication"],
    sections: secs([
      ["summary", "Recommendation", 1],
      ["skills", "Capability", 2],
      ["impact", "Evidence", 3],
      ["experience", "Track Record", 4],
      ["education", "Appendix", 5],
    ]),
    style: {
      nameSize: 23,
      headlineSize: 11,
      headingSize: 10,
      bodySize: 10,
      accent: "#1e293b",
      muted: "#475569",
      soft: "#f1f5f9",
      headingCase: "title",
      bullet: "–",
      divider: "double",
      headerBand: false,
      leftRail: false,
      skillSeparator: "  ·  ",
      nameFont: "serif",
      bodyFont: "serif",
      sectionBar: true,
      boldJobTitles: true,
      badge: "CONFIDENTIAL PACK",
    },
  },
  {
    id: "research_compact",
    name: "Research Compact",
    tagline: "Abstract · method · results",
    researchSpine: "Scientific abstract structure applied to consulting",
    literature: ["IMRaD-inspired", "Information hierarchy"],
    sections: secs([
      ["summary", "Abstract", 1],
      ["methodology", "Method", 2],
      ["skills", "Instruments", 3],
      ["experience", "Results by Engagement", 4],
      ["impact", "Discussion", 5],
      ["education", "References", 6],
    ]),
    style: {
      nameSize: 18,
      headlineSize: 10,
      headingSize: 9,
      bodySize: 9,
      accent: "#4c1d95",
      muted: "#6d28d9",
      soft: "#f5f3ff",
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
];

export function getLayoutConfig(id?: string | null): LayoutConfig {
  return LAYOUT_CONFIGS.find((l) => l.id === id) || LAYOUT_CONFIGS[0];
}

export function allLayoutIds(): string[] {
  return LAYOUT_CONFIGS.map((l) => l.id);
}

export function layoutConfigForIndex(i: number): LayoutConfig {
  return LAYOUT_CONFIGS[i % LAYOUT_CONFIGS.length];
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
