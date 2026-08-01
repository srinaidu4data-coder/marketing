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
  /** True when this row has no pack yet (generation failed / skipped) */
  missingPack: boolean;
}[] {
  return candidates.map((cc) => {
    const text = cc.tailoredResumeText || "";
    const missingPack = text.trim().length < 80;
    return {
      id: cc.id,
      name: cc.candidate.name,
      missingPack,
      ship: missingPack
        ? {
            ok: false,
            issues: [
              {
                code: "empty" as const,
                detail: "No pack generated for this candidate",
              },
            ],
            employerBlocks: 0,
            minBulletsSeen: null,
          }
        : inspectPackShipReady({
            text,
            masterText: cc.candidate.masterResumeText || "",
            masterProfileJson: cc.candidate.masterProfileJson || null,
          }),
    };
  });
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
