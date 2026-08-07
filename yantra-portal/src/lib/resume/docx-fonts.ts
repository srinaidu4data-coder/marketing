/**
 * Word-safe fonts that mirror LAYOUT_DNA stacks.
 * DOCX cannot embed web-only fonts (Inter); map to ubiquitous Office faces
 * so downloads keep the same serif/sans/mono character as previews.
 */

import { getDna, type ThemeDNA } from "./layout-themes";
import type { LayoutDef } from "./templates";

export type DocxFontSet = {
  /** Candidate name */
  name: string;
  /** Job title / headline under name */
  headline: string;
  /** Section headings */
  heading: string;
  /** Body, bullets, meta */
  body: string;
  /** Skills / stack / mono accents */
  mono: string;
};

/** First named family from a CSS font-stack that Office can resolve */
function firstWordSafe(stack: string, fallback: string): string {
  const parts = stack
    .split(",")
    .map((s) => s.replace(/["']/g, "").trim())
    .filter(Boolean);
  for (const p of parts) {
    const key = p.toLowerCase();
    // Skip generic families
    if (
      key === "system-ui" ||
      key === "sans-serif" ||
      key === "serif" ||
      key === "monospace" ||
      key === "ui-sans-serif" ||
      key === "ui-monospace" ||
      key.startsWith("ui-")
    ) {
      continue;
    }
    // Map web fonts → Office equivalents
    if (key.includes("inter") || key.includes("helvetica") || key.includes("roboto")) {
      return "Calibri";
    }
    if (key.includes("segoe")) return "Segoe UI";
    if (key.includes("calibri")) return "Calibri";
    if (key.includes("arial")) return "Arial";
    if (key.includes("georgia")) return "Georgia";
    if (key.includes("times")) return "Times New Roman";
    if (key.includes("cambria")) return "Cambria";
    if (key.includes("garamond")) return "Garamond";
    if (key.includes("consolas") || key.includes("cascadia") || key.includes("menlo") || key.includes("monaco")) {
      return "Consolas";
    }
    if (key.includes("courier")) return "Courier New";
    // Known Office faces pass through
    if (
      /^(Calibri|Cambria|Candara|Consolas|Constantia|Corbel|Georgia|Arial|Verdana|Tahoma|Trebuchet MS|Times New Roman|Courier New|Segoe UI|Garamond|Palatino Linotype)$/i.test(
        p
      )
    ) {
      return p;
    }
  }
  return fallback;
}

function fromDna(dna: ThemeDNA, layoutStyle?: LayoutDef["style"]): DocxFontSet {
  const styleSans = layoutStyle?.nameFont === "serif" ? "Georgia" : "Calibri";
  const styleBody = layoutStyle?.bodyFont === "serif" ? "Georgia" : "Calibri";
  const name = firstWordSafe(dna.nameFontStack, styleSans);
  const headline = firstWordSafe(dna.headlineFontStack, name);
  const body = firstWordSafe(dna.bodyFontStack, styleBody);
  // Mono for tech / stack lines
  const mono =
    dna.skillStyle === "mono-block" ||
    dna.nameFontStack.toLowerCase().includes("mono") ||
    dna.nameFontStack.toLowerCase().includes("consolas")
      ? "Consolas"
      : body;
  return {
    name,
    headline,
    heading: name,
    body,
    mono,
  };
}

/** Explicit overrides where DNA + Office pairing needs a sharper identity */
const LAYOUT_DOCX_OVERRIDES: Partial<Record<string, Partial<DocxFontSet>>> = {
  // Flagship 5
  signal_classic: {
    name: "Calibri",
    headline: "Calibri",
    heading: "Calibri",
    body: "Calibri",
    mono: "Calibri",
  },
  pyramid_brief: {
    name: "Georgia",
    headline: "Georgia",
    heading: "Georgia",
    body: "Calibri",
    mono: "Calibri",
  },
  stack_spec: {
    name: "Consolas",
    headline: "Calibri",
    heading: "Consolas",
    body: "Calibri",
    mono: "Consolas",
  },
  arc_timeline: {
    name: "Calibri",
    headline: "Calibri",
    heading: "Calibri",
    body: "Calibri",
    mono: "Calibri",
  },
  impact_banner: {
    name: "Calibri",
    headline: "Calibri",
    heading: "Calibri",
    body: "Calibri",
    mono: "Calibri",
  },
  // Legacy ids (same faces as aliases)
  ats_classic: {
    name: "Calibri",
    headline: "Calibri",
    heading: "Calibri",
    body: "Calibri",
    mono: "Calibri",
  },
  executive_serif: {
    name: "Georgia",
    headline: "Georgia",
    heading: "Georgia",
    body: "Calibri",
    mono: "Calibri",
  },
  technical_dense: {
    name: "Consolas",
    headline: "Calibri",
    heading: "Consolas",
    body: "Calibri",
    mono: "Consolas",
  },
  timeline_progressive: {
    name: "Calibri",
    headline: "Calibri",
    heading: "Calibri",
    body: "Calibri",
    mono: "Calibri",
  },
  consultant_band: {
    name: "Calibri",
    headline: "Calibri",
    heading: "Calibri",
    body: "Calibri",
    mono: "Calibri",
  },
};

export function getDocxFonts(
  layoutId: string | null | undefined,
  layoutStyle?: LayoutDef["style"]
): DocxFontSet {
  const id = layoutId || "signal_classic";
  const dna = getDna(id);
  const base = fromDna(dna, layoutStyle);
  const over = LAYOUT_DOCX_OVERRIDES[id];
  return over ? { ...base, ...over } : base;
}
