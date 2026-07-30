/**
 * Distinct visual DNA per layout — not color swaps of the same skeleton.
 */
import type { ResumeLayoutId } from "./templates";

export type HeaderMode =
  | "centered_classic"
  | "centered_serif_elegant"
  | "left_rail_tech"
  | "timeline_rail"
  | "minimal_hero"
  | "full_band";

export type ThemeDNA = {
  headerMode: HeaderMode;
  pageBg: string;
  sheetBg: string;
  nameAlign: "left" | "center";
  nameTransform: "none" | "uppercase";
  nameSizePx: number;
  nameWeight: number;
  nameLetterSpacing: string;
  nameFontStack: string;
  headlineFontStack: string;
  bodyFontStack: string;
  h2Style: "full-rule" | "short-rule" | "pill" | "left-bar" | "underline-gold" | "minimal-gap";
  h2Transform: "uppercase" | "none";
  bulletStyle: "disc" | "dash" | "square" | "timeline-dot";
  skillStyle: "chip" | "plain" | "mono-block" | "pills-row";
  accent: string;
  accent2: string;
  muted: string;
  soft: string;
  jobWeight: number;
  radius: string;
  shadow: string;
  aura: string; // marketing label for UI
};

export const LAYOUT_DNA: Record<ResumeLayoutId, ThemeDNA> = {
  ats_classic: {
    headerMode: "centered_classic",
    pageBg: "#eef2f7",
    sheetBg: "#ffffff",
    nameAlign: "center",
    nameTransform: "uppercase",
    nameSizePx: 28,
    nameWeight: 800,
    nameLetterSpacing: "0.14em",
    nameFontStack: '"Segoe UI", Calibri, system-ui, sans-serif',
    headlineFontStack: '"Segoe UI", Calibri, system-ui, sans-serif',
    bodyFontStack: '"Segoe UI", Calibri, system-ui, sans-serif',
    h2Style: "full-rule",
    h2Transform: "uppercase",
    bulletStyle: "disc",
    skillStyle: "plain",
    accent: "#0f172a",
    accent2: "#334155",
    muted: "#64748b",
    soft: "#f1f5f9",
    jobWeight: 700,
    radius: "4px",
    shadow: "0 4px 24px rgba(15,23,42,.06)",
    aura: "Corporate · Portal-safe · Precise",
  },
  executive_serif: {
    headerMode: "centered_serif_elegant",
    pageBg: "#f5f0e8",
    sheetBg: "#fffcf7",
    nameAlign: "center",
    nameTransform: "none",
    nameSizePx: 36,
    nameWeight: 600,
    nameLetterSpacing: "0.02em",
    nameFontStack: 'Georgia, "Times New Roman", serif',
    headlineFontStack: 'Georgia, "Times New Roman", serif',
    bodyFontStack: '"Segoe UI", Calibri, system-ui, sans-serif',
    h2Style: "underline-gold",
    h2Transform: "none",
    bulletStyle: "dash",
    skillStyle: "plain",
    accent: "#1e3a5f",
    accent2: "#b8860b",
    muted: "#6b7280",
    soft: "#f7f3ea",
    jobWeight: 600,
    radius: "2px",
    shadow: "0 8px 32px rgba(30,58,95,.08)",
    aura: "Executive · Refined · Leadership",
  },
  technical_dense: {
    headerMode: "left_rail_tech",
    pageBg: "#0c1222",
    sheetBg: "#0f172a",
    nameAlign: "left",
    nameTransform: "uppercase",
    nameSizePx: 22,
    nameWeight: 700,
    nameLetterSpacing: "0.12em",
    nameFontStack: 'ui-monospace, "Cascadia Code", Consolas, monospace',
    headlineFontStack: '"Segoe UI", system-ui, sans-serif',
    bodyFontStack: '"Segoe UI", system-ui, sans-serif',
    h2Style: "pill",
    h2Transform: "uppercase",
    bulletStyle: "square",
    skillStyle: "mono-block",
    accent: "#22d3ee",
    accent2: "#67e8f9",
    muted: "#94a3b8",
    soft: "#164e63",
    jobWeight: 700,
    radius: "6px",
    shadow: "0 0 0 1px #1e293b, 0 12px 40px rgba(0,0,0,.4)",
    aura: "Engineer · Dense · High-signal",
  },
  timeline_progressive: {
    headerMode: "timeline_rail",
    pageBg: "#ecfdf5",
    sheetBg: "#ffffff",
    nameAlign: "left",
    nameTransform: "none",
    nameSizePx: 30,
    nameWeight: 700,
    nameLetterSpacing: "-0.02em",
    nameFontStack: '"Segoe UI", system-ui, sans-serif',
    headlineFontStack: '"Segoe UI", system-ui, sans-serif',
    bodyFontStack: '"Segoe UI", system-ui, sans-serif',
    h2Style: "left-bar",
    h2Transform: "none",
    bulletStyle: "timeline-dot",
    skillStyle: "pills-row",
    accent: "#059669",
    accent2: "#10b981",
    muted: "#6b7280",
    soft: "#d1fae5",
    jobWeight: 700,
    radius: "10px",
    shadow: "0 10px 30px rgba(5,150,105,.1)",
    aura: "Growth · Progressive · Momentum",
  },
  modern_minimal: {
    headerMode: "minimal_hero",
    pageBg: "#fafafa",
    sheetBg: "#ffffff",
    nameAlign: "left",
    nameTransform: "none",
    nameSizePx: 42,
    nameWeight: 800,
    nameLetterSpacing: "-0.04em",
    nameFontStack: 'Inter, "Segoe UI", system-ui, sans-serif',
    headlineFontStack: 'Inter, "Segoe UI", system-ui, sans-serif',
    bodyFontStack: 'Inter, "Segoe UI", system-ui, sans-serif',
    h2Style: "minimal-gap",
    h2Transform: "uppercase",
    bulletStyle: "disc",
    skillStyle: "plain",
    accent: "#09090b",
    accent2: "#a1a1aa",
    muted: "#71717a",
    soft: "#f4f4f5",
    jobWeight: 600,
    radius: "0",
    shadow: "none",
    aura: "Minimal · Bold type · Airy",
  },
  consultant_band: {
    headerMode: "full_band",
    pageBg: "#fff7ed",
    sheetBg: "#ffffff",
    nameAlign: "left",
    nameTransform: "uppercase",
    nameSizePx: 26,
    nameWeight: 800,
    nameLetterSpacing: "0.1em",
    nameFontStack: '"Segoe UI", system-ui, sans-serif',
    headlineFontStack: '"Segoe UI", system-ui, sans-serif',
    bodyFontStack: '"Segoe UI", system-ui, sans-serif',
    h2Style: "short-rule",
    h2Transform: "uppercase",
    bulletStyle: "disc",
    skillStyle: "chip",
    accent: "#c2410c",
    accent2: "#ea580c",
    muted: "#78716c",
    soft: "#ffedd5",
    jobWeight: 700,
    radius: "12px",
    shadow: "0 16px 48px rgba(194,65,12,.12)",
    aura: "Bold · Marketing pack · High impact",
  },
};

export function getDna(id: ResumeLayoutId | string): ThemeDNA {
  return LAYOUT_DNA[id as ResumeLayoutId] || LAYOUT_DNA.ats_classic;
}
