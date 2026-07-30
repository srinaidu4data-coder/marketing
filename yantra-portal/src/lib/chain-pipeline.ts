/**
 * Resilient chain generation / recovery (Vercel-safe).
 *
 * Guarantees:
 * 1. Terminal status always applied (READY if ≥1 pack else FAILED).
 * 2. Per-candidate isolation — one resume failure does not abort the chain.
 * 3. Disk writes are best-effort under /tmp on Vercel; DB text is source of truth.
 * 4. Time budget stops starting new candidates before platform kill.
 * 5. Stale sweeper recovers abandoned GENERATING/SENDING.
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { tailorResume } from "@/lib/resume-tailor";
import { renderDocxBuffer } from "@/lib/resume/render-docx";
import { renderPdfBuffer } from "@/lib/resume/render-pdf";
import { chainUploadDir } from "@/lib/paths";

/** Chains older than this in GENERATING/SENDING are considered abandoned. */
export const STALE_CHAIN_MS = 3 * 60 * 1000; // 3 minutes

/** Soft time budget so we finish before serverless kill (leave margin for response). */
function generationDeadlineMs(): number {
  if (process.env.VERCEL) {
    // Hobby often 60s max; leave ~12s for wrap-up. Override via CHAIN_BUDGET_MS.
    const raw = Number(process.env.CHAIN_BUDGET_MS || 48_000);
    return Date.now() + (Number.isFinite(raw) && raw > 5_000 ? raw : 48_000);
  }
  return Date.now() + Number(process.env.CHAIN_BUDGET_MS || 280_000);
}

export type GenerateChainInput = {
  chainId: string;
  userId: string;
  rawJobText: string;
  vendorName: string;
  candidateIds: string[];
};

export type GenerateChainResult = {
  chainId: string;
  status: "READY" | "FAILED";
  succeeded: number;
  failed: number;
  errors: { candidateId: string; name: string; message: string }[];
  timedOut?: boolean;
};

/**
 * Mark abandoned in-flight chains as READY/FAILED so they cannot block queues.
 */
export async function recoverStaleChains(opts?: {
  olderThanMs?: number;
  employeeId?: string;
}): Promise<{ recovered: string[] }> {
  const olderThanMs = opts?.olderThanMs ?? STALE_CHAIN_MS;
  const cutoffMs = Date.now() - olderThanMs;

  const inFlight = await prisma.chain.findMany({
    where: {
      status: { in: ["GENERATING", "SENDING"] },
      ...(opts?.employeeId ? { employeeId: opts.employeeId } : {}),
    },
    select: { id: true, status: true, employeeId: true, updatedAt: true },
  });
  const stale = inFlight.filter((row) => row.updatedAt.getTime() < cutoffMs);

  const recovered: string[] = [];
  for (const row of stale) {
    const packCount = await prisma.chainCandidate.count({ where: { chainId: row.id } });
    const terminal: "READY" | "FAILED" = packCount > 0 ? "READY" : "FAILED";
    await prisma.chain.update({
      where: { id: row.id },
      data: { status: terminal },
    });
    await audit("chain.stale_recovered", row.employeeId, {
      chainId: row.id,
      previousStatus: row.status,
      terminal,
      packCount,
      reason: `Abandoned ${row.status} longer than ${olderThanMs}ms`,
    });
    await audit("chain.status_changed", row.employeeId, {
      chainId: row.id,
      status: terminal,
      reason: "stale_recovery",
    });
    recovered.push(row.id);
  }
  return { recovered };
}

export async function failStuckChain(
  chainId: string,
  actorUserId: string,
  reason = "manual_recover"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const chain = await prisma.chain.findUnique({ where: { id: chainId } });
  if (!chain) return { ok: false, error: "Chain not found" };
  if (chain.status !== "GENERATING" && chain.status !== "SENDING") {
    return { ok: false, error: `Chain is ${chain.status}, not stuck in-flight` };
  }

  const packCount = await prisma.chainCandidate.count({ where: { chainId } });
  const terminal: "READY" | "FAILED" = packCount > 0 ? "READY" : "FAILED";
  await prisma.chain.update({
    where: { id: chainId },
    data: { status: terminal },
  });
  await audit("chain.manual_recover", actorUserId, {
    chainId,
    previousStatus: chain.status,
    terminal,
    packCount,
    reason,
  });
  await audit("chain.status_changed", actorUserId, {
    chainId,
    status: terminal,
    reason,
  });
  return { ok: true };
}

async function safeWriteFile(
  filePath: string,
  data: Buffer | string
): Promise<boolean> {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return true;
  } catch (e) {
    console.warn(`[chain] disk write skipped: ${filePath}`, e);
    return false;
  }
}

/**
 * Process all candidates for a chain that is already in GENERATING.
 * Always ends in READY (if ≥1 pack) or FAILED (if zero).
 */
export async function generateChainResumes(
  input: GenerateChainInput
): Promise<GenerateChainResult> {
  const { chainId, userId, rawJobText, vendorName, candidateIds } = input;
  const errors: GenerateChainResult["errors"] = [];
  let succeeded = 0;
  let timedOut = false;
  const deadline = generationDeadlineMs();

  try {
    await prisma.chain.update({
      where: { id: chainId },
      data: { status: "GENERATING" },
    });

    if (!candidateIds.length) {
      errors.push({
        candidateId: "",
        name: "(selection)",
        message: "No candidate IDs provided — check allocations and selection.",
      });
      await prisma.chain.update({ where: { id: chainId }, data: { status: "FAILED" } });
      await audit("chain.status_changed", userId, {
        chainId,
        status: "FAILED",
        reason: "no_candidate_ids",
      });
      return { chainId, status: "FAILED", succeeded: 0, failed: 1, errors };
    }

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: candidateIds } },
    });

    if (!candidates.length) {
      errors.push({
        candidateId: "",
        name: "(selection)",
        message: "Selected candidates not found in database.",
      });
      await prisma.chain.update({ where: { id: chainId }, data: { status: "FAILED" } });
      await audit("chain.status_changed", userId, {
        chainId,
        status: "FAILED",
        reason: "candidates_not_found",
      });
      return { chainId, status: "FAILED", succeeded: 0, failed: 1, errors };
    }

    const dir = chainUploadDir(chainId);
    // Best-effort dir create — never abort generation if disk is read-only
    try {
      await mkdir(dir, { recursive: true });
    } catch (e) {
      console.warn(`[chain ${chainId}] mkdir skipped (ephemeral FS)`, e);
    }

    for (const c of candidates) {
      if (Date.now() > deadline) {
        timedOut = true;
        errors.push({
          candidateId: c.id,
          name: c.name,
          message:
            "Skipped: generation time budget reached (serverless limit). Create a smaller chain or upgrade function duration.",
        });
        await audit("chain.candidate_failed", userId, {
          chainId,
          candidateId: c.id,
          message: "time_budget",
        });
        // Mark remaining as skipped in one audit
        const remaining = candidates.slice(candidates.indexOf(c) + 1);
        for (const r of remaining) {
          errors.push({
            candidateId: r.id,
            name: r.name,
            message: "Skipped: generation time budget already reached.",
          });
        }
        break;
      }

      try {
        await prisma.chain.update({
          where: { id: chainId },
          data: { status: "GENERATING" },
        });

        const tailored = await tailorResume({
          master: c.masterResumeText || "",
          jd: rawJobText,
          vendorName,
          candidateName: c.name,
          employeeId: userId,
          layoutId: c.layoutId,
          email: c.email,
        });

        await prisma.chain.update({
          where: { id: chainId },
          data: { status: "GENERATING" },
        });

        const base = c.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const textName = `${base}.txt`;
        const textRel = `uploads/chains/${chainId}/${textName}`;
        await safeWriteFile(path.join(dir, textName), tailored.text);

        let docxPath: string | null = null;
        let pdfPath: string | null = null;

        try {
          const docxBuf = await renderDocxBuffer(tailored.structured);
          const docxName = `${base}.docx`;
          const ok = await safeWriteFile(path.join(dir, docxName), docxBuf);
          if (ok) docxPath = `uploads/chains/${chainId}/${docxName}`;
        } catch (e) {
          console.error(`[chain ${chainId}] DOCX render failed for ${c.name}`, e);
        }

        await prisma.chain.update({
          where: { id: chainId },
          data: { status: "GENERATING" },
        });

        if (c.exportFormat === "DOCX_PDF") {
          try {
            const pdfBuf = await renderPdfBuffer(tailored.structured);
            const pdfName = `${base}.pdf`;
            const ok = await safeWriteFile(path.join(dir, pdfName), pdfBuf);
            if (ok) pdfPath = `uploads/chains/${chainId}/${pdfName}`;
          } catch (e) {
            console.error(`[chain ${chainId}] PDF render failed for ${c.name}`, e);
          }
        }

        // DB is source of truth — always persist pack even if disk writes failed
        const existing = await prisma.chainCandidate.findFirst({
          where: { chainId, candidateId: c.id },
        });
        const packData = {
          tailoredResumeText: tailored.text,
          tailoredResumePath: textRel,
          docxPath,
          pdfPath,
          layoutId: c.layoutId,
          jobTitle: tailored.structured.meta.jobTitle,
          skillFingerprint: tailored.structured.meta.skillFingerprint,
          atsScore: tailored.ats.score,
          atsReady: tailored.ats.ready,
          atsBreakdownJson: JSON.stringify(tailored.ats),
        };
        if (existing) {
          await prisma.chainCandidate.update({
            where: { id: existing.id },
            data: packData,
          });
        } else {
          await prisma.chainCandidate.create({
            data: {
              chainId,
              candidateId: c.id,
              ...packData,
              sendStatus: "PENDING",
            },
          });
        }
        succeeded++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[chain ${chainId}] candidate ${c.id} failed`, e);
        errors.push({ candidateId: c.id, name: c.name, message });
        await audit("chain.candidate_failed", userId, {
          chainId,
          candidateId: c.id,
          message,
        });
      }
    }

    const packCount = await prisma.chainCandidate.count({ where: { chainId } });
    const status: "READY" | "FAILED" = packCount > 0 ? "READY" : "FAILED";

    await prisma.chain.update({
      where: { id: chainId },
      data: { status },
    });
    await audit("chain.status_changed", userId, {
      chainId,
      status,
      succeeded,
      failed: errors.length,
      timedOut,
      errors: errors.slice(0, 8),
    });

    return {
      chainId,
      status,
      succeeded,
      failed: errors.length,
      errors,
      timedOut,
    };
  } catch (fatal) {
    console.error(`[chain ${chainId}] fatal generation error`, fatal);
    try {
      const packCount = await prisma.chainCandidate.count({ where: { chainId } });
      const status = packCount > 0 ? "READY" : "FAILED";
      await prisma.chain.update({
        where: { id: chainId },
        data: { status },
      });
      const fatalMsg = fatal instanceof Error ? fatal.message : String(fatal);
      await audit("chain.status_changed", userId, {
        chainId,
        status,
        fatal: fatalMsg,
      });
      return {
        chainId,
        status,
        succeeded: packCount,
        failed: errors.length + 1,
        errors: [
          ...errors,
          { candidateId: "", name: "(pipeline)", message: fatalMsg },
        ],
      };
    } catch (updateErr) {
      console.error(`[chain ${chainId}] could not terminalize status`, updateErr);
      return {
        chainId,
        status: "FAILED",
        succeeded: 0,
        failed: 1,
        errors: [
          {
            candidateId: "",
            name: "(pipeline)",
            message: "Fatal error and status update failed",
          },
        ],
      };
    }
  }
}

/**
 * Create chain row + generate resumes end-to-end.
 */
export async function createAndGenerateChain(opts: {
  userId: string;
  vendorName: string;
  vendorEmail: string;
  rawJobText: string;
  employeeNote?: string | null;
  candidateIds: string[];
}): Promise<GenerateChainResult & { id: string }> {
  try {
    await recoverStaleChains();
  } catch (e) {
    console.error("recoverStaleChains failed (continuing create)", e);
  }

  const chain = await prisma.chain.create({
    data: {
      employeeId: opts.userId,
      vendorName: opts.vendorName,
      vendorEmail: opts.vendorEmail,
      rawJobText: opts.rawJobText,
      employeeNote: opts.employeeNote || null,
      status: "GENERATING",
    },
  });

  await audit("chain.create", opts.userId, {
    chainId: chain.id,
    vendorName: opts.vendorName,
    count: opts.candidateIds.length,
  });
  await audit("chain.status_changed", opts.userId, {
    chainId: chain.id,
    status: "GENERATING",
  });

  const result = await generateChainResumes({
    chainId: chain.id,
    userId: opts.userId,
    rawJobText: opts.rawJobText,
    vendorName: opts.vendorName,
    candidateIds: opts.candidateIds,
  });

  return { ...result, id: chain.id };
}

/**
 * Re-run generation for a FAILED/READY chain that has missing packs
 * (e.g. partial time-budget or empty failure).
 */
export async function retryGenerateChain(
  chainId: string,
  userId: string,
  candidateIds?: string[]
): Promise<GenerateChainResult> {
  const chain = await prisma.chain.findUnique({
    where: { id: chainId },
    include: { candidates: true },
  });
  if (!chain) {
    return {
      chainId,
      status: "FAILED",
      succeeded: 0,
      failed: 1,
      errors: [{ candidateId: "", name: "(chain)", message: "Chain not found" }],
    };
  }

  let ids = candidateIds;
  if (!ids?.length) {
    // Prefer original selection via allocations if empty packs
    if (chain.candidates.length === 0) {
      const alloc = await prisma.allocation.findMany({
        where: { employeeId: chain.employeeId },
        select: { candidateId: true },
      });
      ids = alloc.map((a) => a.candidateId);
    } else {
      ids = chain.candidates.map((c) => c.candidateId);
    }
  }

  await prisma.chain.update({
    where: { id: chainId },
    data: { status: "GENERATING" },
  });

  return generateChainResumes({
    chainId,
    userId,
    rawJobText: chain.rawJobText,
    vendorName: chain.vendorName,
    candidateIds: ids,
  });
}
