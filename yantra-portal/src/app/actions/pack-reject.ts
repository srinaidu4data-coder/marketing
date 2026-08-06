"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import type { PackRejectReason } from "@/lib/resume-v2/generation-meta";
import { PACK_REJECT_REASONS } from "@/lib/resume-v2/generation-meta";

const REASON_SET = new Set(PACK_REJECT_REASONS.map((r) => r.id));

/**
 * C6 — Human reject-after-green telemetry.
 * Stores reason on pack atsBreakdownJson.humanReject + audit log.
 * Does not delete the pack (still downloadable for comparison).
 */
export async function rejectChainPackAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const chainCandidateId = String(formData.get("chainCandidateId") || "").trim();
  const chainId = String(formData.get("chainId") || "").trim();
  const reasonRaw = String(formData.get("reason") || "").trim() as PackRejectReason;
  const note = String(formData.get("note") || "").trim().slice(0, 500);

  if (!chainCandidateId || !chainId) return;
  if (!REASON_SET.has(reasonRaw)) return;

  const cc = await prisma.chainCandidate.findUnique({
    where: { id: chainCandidateId },
    include: { chain: true, candidate: true },
  });
  if (!cc || cc.chainId !== chainId) return;
  if (user.role === "EMPLOYEE" && cc.chain.employeeId !== user.id) return;
  if (user.role === "EMPLOYEE" && cc.chain.employeeHiddenAt) return;

  let breakdown: Record<string, unknown> = {};
  try {
    breakdown = JSON.parse(cc.atsBreakdownJson || "{}") as Record<string, unknown>;
  } catch {
    breakdown = {};
  }

  const humanReject = {
    reason: reasonRaw,
    note: note || undefined,
    byUserId: user.id,
    at: new Date().toISOString(),
  };
  breakdown.humanReject = humanReject;

  await prisma.chainCandidate.update({
    where: { id: chainCandidateId },
    data: {
      atsBreakdownJson: JSON.stringify(breakdown),
      // Keep ship flags; reject is telemetry, not auto-unship
    },
  });

  await audit("pack.human_reject", user.id, {
    chainId,
    chainCandidateId,
    candidateId: cc.candidateId,
    candidateName: cc.candidate.name,
    reason: reasonRaw,
    note: note || null,
    generationMeta: breakdown.generationMeta || null,
    atsScore: cc.atsScore,
    psychScore: cc.psychScore,
  });

  revalidatePath(`/chains/${chainId}`);
  revalidatePath(`/admin/chains/${chainId}`);
}
