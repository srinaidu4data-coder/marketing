/**
 * Persist live generation progress on Chain.progressJson for detail-page polling.
 * Best-effort — never throws into the generation pipeline.
 */

import { prisma } from "@/lib/db";
import {
  applyEventToSnapshot,
  parseProgressJson,
  type ProgressEvent,
  type ChainProgressSnapshot,
} from "@/lib/resume/generation-progress";

const lastWrite = new Map<string, number>();
const MIN_WRITE_MS = 400;

export async function persistChainProgressEvent(
  chainId: string,
  ev: ProgressEvent
): Promise<ChainProgressSnapshot | null> {
  try {
    const now = Date.now();
    const last = lastWrite.get(chainId) || 0;
    // Throttle heartbeats to protect DB; always write terminal events
    const force =
      ev.type === "chain_done" ||
      ev.type === "complete" ||
      ev.type === "error" ||
      ev.type === "candidate_done" ||
      (ev.type === "step" && ev.status === "error");
    if (!force && now - last < MIN_WRITE_MS) {
      return null;
    }
    lastWrite.set(chainId, now);

    const row = await prisma.chain.findUnique({
      where: { id: chainId },
      select: { progressJson: true },
    });
    const prev = parseProgressJson(row?.progressJson);
    const next = applyEventToSnapshot(prev, ev);
    await prisma.chain.update({
      where: { id: chainId },
      data: { progressJson: JSON.stringify(next) },
    });
    return next;
  } catch (e) {
    console.warn("[progress] persist failed", chainId, e);
    return null;
  }
}
