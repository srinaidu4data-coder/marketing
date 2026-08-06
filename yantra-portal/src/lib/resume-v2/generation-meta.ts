/**
 * Generation path / cost metadata for adaptive-cost single entry (C0–C6).
 * Stored in chain atsBreakdownJson.generationMeta and progressiveNotes.
 */

export type GenerationPath =
  | "tier0"
  | "tier1"
  | "tier2"
  | "force"
  | "legacy";

export type GenerationQuality = "ok" | "weak";

export type GenerationMeta = {
  path: GenerationPath;
  /** Human-readable short label for UI chip */
  pathLabel: string;
  quality: GenerationQuality;
  /** Estimated LLM $ for this pack */
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  llmCalls: number;
  softBand: boolean;
  hardFail: boolean;
  /** Whether light retrieve / evidence block was used */
  retrieveUsed: boolean;
  retrieveMode: "lexical_per_slot" | "full_master" | "none";
  bonN: number;
  residueFail: boolean;
  notes: string[];
  /** ISO timestamp */
  at: string;
};

export type HumanRejectRecord = {
  reason: PackRejectReason;
  note?: string;
  byUserId?: string;
  at: string;
};

export type PackRejectReason =
  | "residue"
  | "thin_early"
  | "filler"
  | "honesty"
  | "density"
  | "title"
  | "layout"
  | "other";

export const PACK_REJECT_REASONS: {
  id: PackRejectReason;
  label: string;
}[] = [
  { id: "residue", label: "Wrong domain / master face" },
  { id: "thin_early", label: "Thin early projects" },
  { id: "filler", label: "Filler / generic bank sludge" },
  { id: "honesty", label: "Honesty / invent risk" },
  { id: "density", label: "Bullet density" },
  { id: "title", label: "Title / headline" },
  { id: "layout", label: "Layout / scan" },
  { id: "other", label: "Other" },
];

export function pathLabel(path: GenerationPath): string {
  switch (path) {
    case "tier0":
      return "T0 cruise";
    case "tier1":
      return "T1 focus";
    case "tier2":
      return "T2 surge";
    case "force":
      return "Force";
    case "legacy":
      return "Legacy";
    default:
      return path;
  }
}

export function formatCostUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

/** Parse generationMeta from atsBreakdownJson string or object */
export function parseGenerationMeta(
  raw: string | Record<string, unknown> | null | undefined
): GenerationMeta | null {
  try {
    const obj =
      typeof raw === "string"
        ? (JSON.parse(raw || "{}") as Record<string, unknown>)
        : raw || {};
    const g = obj.generationMeta as GenerationMeta | undefined;
    if (!g || typeof g !== "object" || !g.path) return null;
    return g;
  } catch {
    return null;
  }
}

export function parseHumanReject(
  raw: string | Record<string, unknown> | null | undefined
): HumanRejectRecord | null {
  try {
    const obj =
      typeof raw === "string"
        ? (JSON.parse(raw || "{}") as Record<string, unknown>)
        : raw || {};
    const h = obj.humanReject as HumanRejectRecord | undefined;
    if (!h || !h.reason || !h.at) return null;
    return h;
  } catch {
    return null;
  }
}

/** Sum estimated LLM $ from chain candidate atsBreakdownJson rows */
export function sumChainApiCostUsd(
  rows: { atsBreakdownJson?: string | null }[]
): number {
  let total = 0;
  for (const row of rows) {
    try {
      const obj = JSON.parse(row.atsBreakdownJson || "{}") as {
        costUsd?: number;
        generationMeta?: { costUsd?: number };
      };
      const c =
        typeof obj.generationMeta?.costUsd === "number"
          ? obj.generationMeta.costUsd
          : typeof obj.costUsd === "number"
            ? obj.costUsd
            : 0;
      if (Number.isFinite(c) && c > 0) total += c;
    } catch {
      /* skip */
    }
  }
  return total;
}
