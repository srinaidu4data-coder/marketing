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
    nameSizePx: 30,
    nameWeight: 700,
    nameLetterSpacing: "0.12em",
    // Source Serif display + Source Sans body — editorial corporate, not Calibri
    nameFontStack:
      '"Source Serif 4", "Source Serif Pro", Cambria, Georgia, "Times New Roman", serif',
    headlineFontStack:
      '"Source Sans 3", "Source Sans Pro", Calibri, "Segoe UI", system-ui, sans-serif',
    bodyFontStack:
      '"Source Sans 3", "Source Sans Pro", Calibri, "Segoe UI", system-ui, sans-serif',
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
    aura: "Editorial corporate · Serif name · Fluent body",
  },
  executive_serif: {
    headerMode: "centered_serif_elegant",
    pageBg: "#f5f0e8",
    sheetBg: "#fffcf7",
    nameAlign: "center",
    nameTransform: "none",
    nameSizePx: 40,
    nameWeight: 700,
    nameLetterSpacing: "0.01em",
    // Playfair Display = boardroom drama; Lora body for warm long-form
    nameFontStack:
      '"Playfair Display", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
    headlineFontStack:
      'Lora, Georgia, "Palatino Linotype", "Times New Roman", serif',
    bodyFontStack:
      'Lora, Georgia, "Source Sans 3", Calibri, "Segoe UI", serif',
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
    aura: "Boardroom serif · Playfair name · Leadership",
  },
  technical_dense: {
    headerMode: "left_rail_tech",
    pageBg: "#0c1222",
    sheetBg: "#0f172a",
    nameAlign: "left",
    nameTransform: "uppercase",
    nameSizePx: 24,
    nameWeight: 700,
    nameLetterSpacing: "0.14em",
    nameFontStack:
      '"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace',
    headlineFontStack:
      '"IBM Plex Sans", "Segoe UI", Calibri, system-ui, sans-serif',
    bodyFontStack:
      '"IBM Plex Sans", "Segoe UI", Calibri, system-ui, sans-serif',
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
    aura: "Console mono · JetBrains · High-signal",
  },
  timeline_progressive: {
    headerMode: "timeline_rail",
    pageBg: "#ecfdf5",
    sheetBg: "#ffffff",
    nameAlign: "left",
    nameTransform: "none",
    nameSizePx: 32,
    nameWeight: 800,
    nameLetterSpacing: "-0.025em",
    // Outfit geometric display + DM Sans body — growth energy
    nameFontStack: 'Outfit, Candara, "Segoe UI", Calibri, system-ui, sans-serif',
    headlineFontStack:
      '"DM Sans", Candara, "Segoe UI", Calibri, system-ui, sans-serif',
    bodyFontStack:
      '"DM Sans", Candara, "Segoe UI", Calibri, system-ui, sans-serif',
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
    aura: "Geometric growth · Outfit display · Momentum",
  },
  modern_minimal: {
    headerMode: "minimal_hero",
    pageBg: "#fafafa",
    sheetBg: "#ffffff",
    nameAlign: "left",
    nameTransform: "none",
    nameSizePx: 46,
    nameWeight: 800,
    nameLetterSpacing: "-0.045em",
    // Manrope for sculpted display; Inter for product body
    nameFontStack:
      'Manrope, Inter, "Segoe UI", Calibri, system-ui, sans-serif',
    headlineFontStack:
      'Inter, Manrope, "Segoe UI", Calibri, system-ui, sans-serif',
    bodyFontStack: 'Inter, "Segoe UI", Calibri, system-ui, sans-serif',
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
    aura: "Manrope hero · Inter body · Product sheet",
  },
  consultant_band: {
    headerMode: "full_band",
    pageBg: "#fff7ed",
    sheetBg: "#ffffff",
    nameAlign: "left",
    nameTransform: "uppercase",
    nameSizePx: 30,
    nameWeight: 800,
    nameLetterSpacing: "0.08em",
    // Barlow Condensed = proposal punch; Barlow body
    nameFontStack:
      '"Barlow Condensed", "Arial Narrow", Impact, Arial, "Segoe UI", sans-serif',
    headlineFontStack: 'Barlow, "Trebuchet MS", Arial, "Segoe UI", sans-serif',
    bodyFontStack: 'Barlow, "Trebuchet MS", Arial, "Segoe UI", sans-serif',
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
    aura: "Condensed impact · Proposal punch · High energy",
  },
};

/** Map flagship + legacy layout ids → DNA key */
const DNA_ALIASES: Record<string, string> = {
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
  f_pattern: "ats_classic",
  board_memo: "executive_serif",
  skills_first: "technical_dense",
  research_compact: "technical_dense",
  peak_end_case: "consultant_band",
};

export function getDna(id: ResumeLayoutId | string): ThemeDNA {
  const key = DNA_ALIASES[String(id || "")] || "ats_classic";
  return LAYOUT_DNA[key as ResumeLayoutId] || LAYOUT_DNA.ats_classic;
}
