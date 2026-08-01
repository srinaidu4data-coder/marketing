/**
 * Shared ship-ready wiring for employee + admin chain detail pages.
 */

import { inspectPackShipReady, type PackShipReport } from "@/lib/resume/pack-ship-ready";

export type ChainCandidateRow = {
  id: string;
  tailoredResumeText: string;
  candidate: {
    name: string;
    masterResumeText?: string | null;
    masterProfileJson?: string | null;
  };
};

export function shipReportsForChain(candidates: ChainCandidateRow[]): {
  id: string;
  name: string;
  ship: PackShipReport;
}[] {
  return candidates.map((cc) => ({
    id: cc.id,
    name: cc.candidate.name,
    ship: inspectPackShipReady({
      text: cc.tailoredResumeText || "",
      masterText: cc.candidate.masterResumeText || "",
      masterProfileJson: cc.candidate.masterProfileJson || null,
    }),
  }));
}

export function encodeShipErrorMessage(message: string): string {
  return Buffer.from(message, "utf8").toString("base64url");
}

export function decodeShipErrorMessage(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
