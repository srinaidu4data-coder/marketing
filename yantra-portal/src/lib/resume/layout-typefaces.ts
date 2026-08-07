/**
 * Role Forge type system — distinctive faces per layout.
 *
 * Web previews load Google Fonts; DOCX maps to Office-safe cousins;
 * PDF tries system TTF registration, then Helvetica/Times fallbacks.
 */

import { getDna } from "./layout-themes";

/** Google Fonts families to load (css2 API query fragment after family=) */
export type LayoutTypeface = {
  /** Families for <link href=fonts.googleapis.com/css2?...> */
  googleFamilies: string[];
  /** Short human label for UI / docs */
  label: string;
  /** Why this pairing */
  vibe: string;
};

const TYPEFACES: Record<string, LayoutTypeface> = {
  ats_classic: {
    googleFamilies: [
      "Source+Serif+4:opsz,wght@8..60,600;700",
      "Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400",
    ],
    label: "Source Serif + Source Sans",
    vibe: "Modern editorial corporate — not Calibri-default",
  },
  executive_serif: {
    googleFamilies: [
      "Playfair+Display:wght@600;700",
      "Lora:ital,wght@0,400;0,600;1,400",
      "Source+Sans+3:wght@400;600",
    ],
    label: "Playfair + Lora",
    vibe: "Boardroom serif drama with warm readable body",
  },
  technical_dense: {
    googleFamilies: [
      "JetBrains+Mono:wght@500;700",
      "IBM+Plex+Sans:wght@400;500;600;700",
    ],
    label: "JetBrains Mono + IBM Plex",
    vibe: "Engineer console energy, high SNR",
  },
  timeline_progressive: {
    googleFamilies: [
      "Outfit:wght@500;600;700;800",
      "DM+Sans:ital,wght@0,400;0,500;0,700;1,400",
    ],
    label: "Outfit + DM Sans",
    vibe: "Geometric growth narrative — friendly momentum",
  },
  modern_minimal: {
    googleFamilies: [
      "Manrope:wght@600;700;800",
      "Inter:wght@400;500;600",
    ],
    label: "Manrope + Inter",
    vibe: "Product-sheet bold display, airy body",
  },
  consultant_band: {
    googleFamilies: [
      "Barlow+Condensed:wght@600;700;800",
      "Barlow:wght@400;500;600;700",
    ],
    label: "Barlow Condensed + Barlow",
    vibe: "Proposal pack punch — compressed headlines",
  },
};

const ALIASES: Record<string, string> = {
  signal_classic: "ats_classic",
  pyramid_brief: "executive_serif",
  stack_spec: "technical_dense",
  arc_timeline: "timeline_progressive",
  impact_banner: "consultant_band",
  ats_classic: "ats_classic",
  executive_serif: "executive_serif",
  technical_dense: "technical_dense",
  timeline_progressive: "timeline_progressive",
  modern_minimal: "modern_minimal",
  consultant_band: "consultant_band",
};

export function resolveTypefaceKey(layoutId?: string | null): string {
  return ALIASES[String(layoutId || "")] || "ats_classic";
}

export function getLayoutTypeface(layoutId?: string | null): LayoutTypeface {
  return TYPEFACES[resolveTypefaceKey(layoutId)] || TYPEFACES.ats_classic;
}

/** Full Google Fonts CSS2 URL for a layout */
export function googleFontsHref(layoutId?: string | null): string {
  const tf = getLayoutTypeface(layoutId);
  const q = tf.googleFamilies.map((f) => `family=${f}`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

/** <link> tags for HTML head (preconnect + stylesheet) */
export function googleFontsLinkTags(layoutId?: string | null): string {
  const href = googleFontsHref(layoutId);
  return `<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="${href}" rel="stylesheet"/>`;
}

/** Describe active stacks for debugging / sample reports */
export function describeLayoutType(layoutId?: string | null): {
  key: string;
  label: string;
  vibe: string;
  name: string;
  body: string;
} {
  const key = resolveTypefaceKey(layoutId);
  const tf = getLayoutTypeface(layoutId);
  const dna = getDna(key);
  return {
    key,
    label: tf.label,
    vibe: tf.vibe,
    name: dna.nameFontStack,
    body: dna.bodyFontStack,
  };
}
