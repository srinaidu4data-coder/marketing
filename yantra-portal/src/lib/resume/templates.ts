/**
 * Resume layout types + bridge to layout-config (12 layouts).
 */

import {
  LAYOUT_CONFIGS,
  getLayoutConfig,
  layoutConfigForIndex,
  type LayoutConfig,
} from "./layout-config";

export type ResumeLayoutId = string;

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
    /** Psych / credibility score 0–100 (best requires 100) */
    psychScore?: number;
    skillFingerprint: string;
    jobTitle: string;
    progressiveNotes: string[];
    tailorMode?: string;
  };
};

export type LayoutDef = {
  id: ResumeLayoutId;
  name: string;
  tagline: string;
  bestFor: string;
  style: LayoutConfig["style"];
};

export const RESUME_LAYOUTS: LayoutDef[] = LAYOUT_CONFIGS.map((c) => ({
  id: c.id,
  name: c.name,
  tagline: c.tagline,
  bestFor: c.researchSpine,
  style: c.style,
}));

export function getLayout(id?: string | null): LayoutDef {
  const c = getLayoutConfig(id);
  return {
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    bestFor: c.bestFor || c.researchSpine,
    style: c.style,
  };
}

export { DEFAULT_LAYOUT_ID, resolveLayoutId } from "./layout-config";

export function formatHeading(text: string, layout: LayoutDef) {
  return layout.style.headingCase === "upper" ? text.toUpperCase() : text;
}

export function layoutForIndex(i: number): ResumeLayoutId {
  return layoutConfigForIndex(i).id;
}

export function hexNoHash(hex: string) {
  return hex.replace("#", "");
}

export { getLayoutConfig, LAYOUT_CONFIGS, layoutConfigForIndex };
