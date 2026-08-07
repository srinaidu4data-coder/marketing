/**
 * Register system TrueType faces for PDFKit so layouts aren't all Helvetica.
 * Falls back silently when files are missing (CI / Linux without Windows fonts).
 */
import fs from "fs";
import path from "path";
import type PDFKit from "pdfkit";
import { resolveTypefaceKey } from "./layout-typefaces";

export type PdfFaceSet = {
  name: string;
  nameBold: string;
  body: string;
  bodyBold: string;
  mono: string;
};

type Slot = "name" | "nameBold" | "body" | "bodyBold" | "mono";

/** Candidate TTF paths per logical face (Windows + common macOS) */
const FACE_CANDIDATES: Record<string, string[]> = {
  georgia: [
    "C:/Windows/Fonts/georgia.ttf",
    "C:/Windows/Fonts/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/Library/Fonts/Georgia.ttf",
  ],
  georgiaBold: [
    "C:/Windows/Fonts/georgiab.ttf",
    "C:/Windows/Fonts/georgiaz.ttf",
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
  ],
  cambria: [
    "C:/Windows/Fonts/cambria.ttf",
    "C:/Windows/Fonts/Cambria.ttf",
  ],
  calibri: [
    "C:/Windows/Fonts/calibri.ttf",
    "C:/Windows/Fonts/Calibri.ttf",
  ],
  calibriBold: [
    "C:/Windows/Fonts/calibrib.ttf",
    "C:/Windows/Fonts/Calibri Bold.ttf",
  ],
  segoe: [
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/SegoeUI.ttf",
  ],
  segoeBold: [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/SegoeUI-Bold.ttf",
  ],
  candara: [
    "C:/Windows/Fonts/Candara.ttf",
    "C:/Windows/Fonts/candara.ttf",
  ],
  candaraBold: [
    "C:/Windows/Fonts/Candarab.ttf",
    "C:/Windows/Fonts/Candara Bold.ttf",
  ],
  consolas: [
    "C:/Windows/Fonts/consola.ttf",
    "C:/Windows/Fonts/Consolas.ttf",
  ],
  arial: [
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
  ],
  arialBold: [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  ],
  arialNarrow: [
    "C:/Windows/Fonts/ARIALN.TTF",
    "C:/Windows/Fonts/arialn.ttf",
  ],
  arialNarrowBold: [
    "C:/Windows/Fonts/ARIALNB.TTF",
    "C:/Windows/Fonts/arialnb.ttf",
  ],
  trebuchet: [
    "C:/Windows/Fonts/trebuc.ttf",
    "C:/Windows/Fonts/Trebuchet MS.ttf",
  ],
  times: [
    "C:/Windows/Fonts/times.ttf",
    "C:/Windows/Fonts/timesi.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
  ],
  timesBold: [
    "C:/Windows/Fonts/timesbd.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
  ],
};

function findFont(keys: string[]): string | null {
  for (const key of keys) {
    const list = FACE_CANDIDATES[key] || [];
    for (const p of list) {
      try {
        if (fs.existsSync(p)) return path.normalize(p);
      } catch {
        /* */
      }
    }
  }
  return null;
}

/** Per-layout preferred system faces → PDFKit register names */
const LAYOUT_FACE_PLAN: Record<
  string,
  { name: string[]; nameBold: string[]; body: string[]; bodyBold: string[]; mono: string[] }
> = {
  ats_classic: {
    name: ["cambria", "georgia", "times"],
    nameBold: ["georgiaBold", "timesBold", "calibriBold"],
    body: ["calibri", "segoe", "arial"],
    bodyBold: ["calibriBold", "segoeBold", "arialBold"],
    mono: ["consolas", "arial"],
  },
  executive_serif: {
    name: ["georgia", "times", "cambria"],
    nameBold: ["georgiaBold", "timesBold"],
    body: ["georgia", "times", "calibri"],
    bodyBold: ["georgiaBold", "timesBold", "calibriBold"],
    mono: ["consolas", "arial"],
  },
  technical_dense: {
    name: ["consolas", "arial"],
    nameBold: ["consolas", "arialBold"],
    body: ["segoe", "calibri", "arial"],
    bodyBold: ["segoeBold", "calibriBold", "arialBold"],
    mono: ["consolas", "arial"],
  },
  timeline_progressive: {
    name: ["candara", "segoe", "calibri"],
    nameBold: ["candaraBold", "segoeBold", "calibriBold"],
    body: ["candara", "segoe", "calibri"],
    bodyBold: ["candaraBold", "segoeBold", "calibriBold"],
    mono: ["consolas", "arial"],
  },
  modern_minimal: {
    name: ["segoe", "calibri", "arial"],
    nameBold: ["segoeBold", "calibriBold", "arialBold"],
    body: ["segoe", "calibri", "arial"],
    bodyBold: ["segoeBold", "calibriBold", "arialBold"],
    mono: ["consolas", "arial"],
  },
  consultant_band: {
    name: ["arialNarrow", "arial", "trebuchet"],
    nameBold: ["arialNarrowBold", "arialBold", "trebuchet"],
    body: ["arial", "calibri", "segoe"],
    bodyBold: ["arialBold", "calibriBold", "segoeBold"],
    mono: ["consolas", "arial"],
  },
};

const BUILTIN: PdfFaceSet = {
  name: "Helvetica",
  nameBold: "Helvetica-Bold",
  body: "Helvetica",
  bodyBold: "Helvetica-Bold",
  mono: "Courier",
};

const SERIF_BUILTIN: PdfFaceSet = {
  name: "Times-Roman",
  nameBold: "Times-Bold",
  body: "Times-Roman",
  bodyBold: "Times-Bold",
  mono: "Courier",
};

/**
 * Register layout fonts on a PDFDocument. Returns face names to pass to doc.font().
 */
export function registerPdfFonts(
  doc: PDFKit.PDFDocument,
  layoutId?: string | null
): PdfFaceSet {
  const key = resolveTypefaceKey(layoutId);
  const plan = LAYOUT_FACE_PLAN[key] || LAYOUT_FACE_PLAN.ats_classic;
  const fallback = key === "executive_serif" ? SERIF_BUILTIN : BUILTIN;
  const out: PdfFaceSet = { ...fallback };
  const prefix = `rf_${key}_`;

  const tryRegister = (slot: Slot, candidates: string[], builtin: string) => {
    const file = findFont(candidates);
    if (!file) {
      out[slot] = builtin;
      return;
    }
    const regName = `${prefix}${slot}`;
    try {
      doc.registerFont(regName, file);
      out[slot] = regName;
    } catch {
      out[slot] = builtin;
    }
  };

  tryRegister("name", plan.name, fallback.name);
  tryRegister("nameBold", plan.nameBold, fallback.nameBold);
  tryRegister("body", plan.body, fallback.body);
  tryRegister("bodyBold", plan.bodyBold, fallback.bodyBold);
  tryRegister("mono", plan.mono, fallback.mono);

  return out;
}
