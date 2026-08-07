/**
 * Word-safe fonts that mirror LAYOUT_DNA stacks.
 * DOCX cannot embed Google Fonts — map each layout to a distinctive
 * Office face so downloads keep character (not “all Calibri”).
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
    // Map web / Google fonts → distinctive Office equivalents
    if (key.includes("playfair") || key.includes("libre baskerville")) {
      return "Georgia";
    }
    if (key.includes("source serif") || key.includes("lora")) {
      return "Cambria";
    }
    if (key.includes("source sans") || key.includes("ibm plex")) {
      return "Calibri";
    }
    if (key.includes("dm sans") || key.includes("outfit") || key.includes("manrope")) {
      return "Candara";
    }
    if (key.includes("barlow condensed") || key.includes("arial narrow")) {
      return "Arial Narrow";
    }
    if (key.includes("barlow") || key.includes("inter")) {
      return "Calibri";
    }
    if (key.includes("jetbrains") || key.includes("cascadia") || key.includes("fira mono")) {
      return "Consolas";
    }
    if (key.includes("helvetica") || key.includes("roboto")) {
      return "Arial";
    }
    if (key.includes("segoe")) return "Segoe UI";
    if (key.includes("calibri")) return "Calibri";
    if (key.includes("arial")) return "Arial";
    if (key.includes("georgia")) return "Georgia";
    if (key.includes("times")) return "Times New Roman";
    if (key.includes("cambria")) return "Cambria";
    if (key.includes("garamond") || key.includes("eb garamond")) return "Garamond";
    if (key.includes("palatino")) return "Palatino Linotype";
    if (key.includes("candara")) return "Candara";
    if (key.includes("corbel")) return "Corbel";
    if (key.includes("constantia")) return "Constantia";
    if (key.includes("trebuchet")) return "Trebuchet MS";
    if (
      key.includes("consolas") ||
      key.includes("menlo") ||
      key.includes("monaco") ||
      key.includes("courier")
    ) {
      return key.includes("courier") ? "Courier New" : "Consolas";
    }
    // Known Office faces pass through
    if (
      /^(Calibri|Cambria|Candara|Consolas|Constantia|Corbel|Georgia|Arial|Arial Narrow|Verdana|Tahoma|Trebuchet MS|Times New Roman|Courier New|Segoe UI|Garamond|Palatino Linotype|Book Antiqua|Century Gothic)$/i.test(
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
  const mono =
    dna.skillStyle === "mono-block" ||
    dna.nameFontStack.toLowerCase().includes("mono") ||
    dna.nameFontStack.toLowerCase().includes("consolas") ||
    dna.nameFontStack.toLowerCase().includes("jetbrains")
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

/**
 * Explicit Office pairings — each layout must feel different when opened in Word.
 * Avoid the old “everything is Calibri” trap.
 */
const LAYOUT_DOCX_OVERRIDES: Partial<Record<string, Partial<DocxFontSet>>> = {
  // Flagship 5
  signal_classic: {
    name: "Cambria",
    headline: "Calibri",
    heading: "Cambria",
    body: "Calibri",
    mono: "Consolas",
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
    name: "Candara",
    headline: "Candara",
    heading: "Candara",
    body: "Calibri",
    mono: "Calibri",
  },
  impact_banner: {
    name: "Arial Narrow",
    headline: "Arial",
    heading: "Arial Narrow",
    body: "Calibri",
    mono: "Calibri",
  },
  // Legacy ids
  ats_classic: {
    name: "Cambria",
    headline: "Calibri",
    heading: "Cambria",
    body: "Calibri",
    mono: "Consolas",
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
    name: "Candara",
    headline: "Candara",
    heading: "Candara",
    body: "Calibri",
    mono: "Calibri",
  },
  modern_minimal: {
    name: "Segoe UI",
    headline: "Segoe UI",
    heading: "Segoe UI",
    body: "Calibri",
    mono: "Calibri",
  },
  consultant_band: {
    name: "Arial Narrow",
    headline: "Arial",
    heading: "Arial Narrow",
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
