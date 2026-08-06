/**
 * Mark chain GENERATING and seed progressJson so the live panel has content
 * the instant the user lands after Regenerate (before first LLM tick).
 */

import { prisma } from "@/lib/db";
import {
  emptyProgressSteps,
  engagementTip,
  type ChainProgressSnapshot,
} from "@/lib/resume/generation-progress";

export function buildQueuedProgress(opts?: {
  candidateCount?: number;
  candidateNames?: string[];
}): ChainProgressSnapshot {
  const n = opts?.candidateCount ?? 0;
  const names = opts?.candidateNames || [];
  return {
    updatedAt: new Date().toISOString(),
    phase: "queued",
    headline:
      n > 0
        ? `Regenerating ${n} pack${n === 1 ? "" : "s"}…`
        : "Regeneration queued…",
    detail:
      names.length > 0
        ? `Starting: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}`
        : "Engine is starting — live steps appear in a few seconds.",
    tip: engagementTip(0),
    tipIndex: 0,
    steps: emptyProgressSteps(),
    doneCount: 0,
    totalCount: emptyProgressSteps().length,
    pct: 3,
    finished: false,
    chainStatus: "GENERATING",
    candidateTotal: n || undefined,
  };
}

/** Flip chain to GENERATING + seed live progress (fast path for UI). */
export async function markChainGeneratingWithSeed(
  chainId: string,
  opts?: { candidateCount?: number; candidateNames?: string[] }
): Promise<void> {
  const snap = buildQueuedProgress(opts);
  await prisma.chain.update({
    where: { id: chainId },
    data: {
      status: "GENERATING",
      progressJson: JSON.stringify(snap),
    },
  });
}
