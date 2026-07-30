/**
 * Modern Resume Layout Template Library (v3 visual system)
 * Single-column ATS-safe flow with contemporary typography & color.
 */

export type ResumeLayoutId =
  | "ats_classic"
  | "executive_serif"
  | "technical_dense"
  | "timeline_progressive"
  | "modern_minimal"
  | "consultant_band";

export type ExportFormat = "DOCX" | "DOCX_PDF";

export type ResumeSection = {
  heading: string;
  lines: string[];
};

export type StructuredResume = {
  candidateName: string;
  headline: string;
  contactLine: string;
  sections: ResumeSection[];
  layoutId: ResumeLayoutId;
  meta: {
    atsScore: number;
    skillFingerprint: string;
    jobTitle: string;
    progressiveNotes: string[];
  };
};

export type LayoutDef = {
  id: ResumeLayoutId;
  name: string;
  tagline: string;
  bestFor: string;
  style: {
    nameSize: number;
    headlineSize: number;
    headingSize: number;
    bodySize: number;
    /** Primary brand accent (#hex) */
    accent: string;
    /** Secondary muted text */
    muted: string;
    /** Page / paper feel background for PDF bands */
    soft: string;
    headingCase: "upper" | "title";
    bullet: string;
    divider: "line" | "space" | "double" | "accent-bar";
    headerBand: boolean;
    /** Left margin color stripe on PDF */
    leftRail: boolean;
    skillSeparator: string;
    nameFont: "sans" | "serif";
    bodyFont: "sans" | "serif";
    /** DOCX: show thin colored bar under section titles */
    sectionBar: boolean;
    /** DOCX/PDF: job title lines bold */
    boldJobTitles: boolean;
  };
};

export const RESUME_LAYOUTS: LayoutDef[] = [
  {
    id: "ats_classic",
    name: "ATS Classic",
    tagline: "Clean modern single-column — portal-safe",
    bestFor: "High-volume vendor portals & Workday/Greenhouse",
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
    tagline: "Refined leadership presence",
    bestFor: "Architect / Lead / Manager SAP roles",
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
    tagline: "Compact skill-forward engineering look",
    bestFor: "Hands-on FICO/MM/ABAP/Basis specialists",
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
      skillSeparator: "  ·  ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "timeline_progressive",
    name: "Timeline Progressive",
    tagline: "Growth story with green growth accent",
    bestFor: "Candidates with clear progressive trajectory",
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
    tagline: "Whitespace-first, sharp type, recruiter scan",
    bestFor: "US C2C marketing submissions with clean brand",
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
      skillSeparator: "  ·  ",
      nameFont: "sans",
      bodyFont: "sans",
      sectionBar: true,
      boldJobTitles: true,
    },
  },
  {
    id: "consultant_band",
    name: "Consultant Band",
    tagline: "Bold header band + structured blocks",
    bestFor: "Differentiated multi-candidate marketing packs",
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
];

export function getLayout(id?: string | null): LayoutDef {
  return RESUME_LAYOUTS.find((l) => l.id === id) || RESUME_LAYOUTS[0];
}

export function formatHeading(text: string, layout: LayoutDef) {
  return layout.style.headingCase === "upper" ? text.toUpperCase() : text;
}

export function layoutForIndex(i: number): ResumeLayoutId {
  return RESUME_LAYOUTS[i % RESUME_LAYOUTS.length].id;
}

export function hexNoHash(hex: string) {
  return hex.replace("#", "");
}
