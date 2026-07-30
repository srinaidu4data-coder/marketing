/**
 * Resilient chain generation / recovery.
 *
 * Known issue (fixed):
 * - Chains were created as GENERATING then processed inline with no try/finally.
 * - Timeouts, crashes, or mid-loop errors left chains stuck in GENERATING/SENDING.
 * - Stuck rows + long SQLite-held requests made the product feel "blocked" for new chains.
 *
 * Guarantees:
 * 1. Terminal status always applied (READY / FAILED) — never leave GENERATING forever.
 * 2. Per-candidate isolation — one resume failure does not abort the whole chain.
 * 3. Stale sweeper recovers abandoned GENERATING/SENDING after a timeout.
 * 4. New chain create is never blocked by another employee's in-flight work.
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { tailorResume } from "@/lib/resume-tailor";
import { renderDocxBuffer } from "@/lib/resume/render-docx";
import { renderPdfBuffer } from "@/lib/resume/render-pdf";

/** Chains older than this in GENERATING/SENDING are considered abandoned. */
export const STALE_CHAIN_MS = 3 * 60 * 1000; // 3 minutes

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
};

/**
 * Mark abandoned in-flight chains as FAILED so they cannot block queues / UX forever.
 * Safe to call on every create and on the queues admin page.
 */
export async function recoverStaleChains(opts?: {
  olderThanMs?: number;
  employeeId?: string;
}): Promise<{ recovered: string[] }> {
  const olderThanMs = opts?.olderThanMs ?? STALE_CHAIN_MS;
  const cutoffMs = Date.now() - olderThanMs;

  // NOTE: Prisma SQLite DateTime `lt` filters are unreliable against stored text
  // timestamps — fetch in-flight rows and compare in JS.
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
    // Partial packs → READY so operators can still send; zero packs → FAILED
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

/**
 * Force-fail a single stuck chain (admin/employee recover action).
 */
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

/**
 * Process all candidates for a chain that is already in GENERATING.
 * Always ends in READY (if ≥1 resume) or FAILED (if zero).
 */
export async function generateChainResumes(
  input: GenerateChainInput
): Promise<GenerateChainResult> {
  const { chainId, userId, rawJobText, vendorName, candidateIds } = input;
  const errors: GenerateChainResult["errors"] = [];
  let succeeded = 0;

  try {
    // Heartbeat so concurrent recoverSweeper doesn't race a live job
    await prisma.chain.update({
      where: { id: chainId },
      data: { status: "GENERATING" },
    });

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: candidateIds } },
    });

    const dir = path.join(process.cwd(), "uploads", "chains", chainId);
    await mkdir(dir, { recursive: true });

    for (const c of candidates) {
      try {
        // Per-candidate heartbeat — keeps updatedAt fresh so live jobs aren't swept
        await prisma.chain.update({
          where: { id: chainId },
          data: { status: "GENERATING" },
        });

        const tailored = await tailorResume({
          master: c.masterResumeText,
          jd: rawJobText,
          vendorName,
          candidateName: c.name,
          employeeId: userId,
          layoutId: c.layoutId,
          email: c.email,
        });

        // Mid-candidate heartbeat (after tailor, before export) — keeps stale sweeper at bay
        await prisma.chain.update({
          where: { id: chainId },
          data: { status: "GENERATING" },
        });

        const base = c.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const textName = `${base}.txt`;
        await writeFile(path.join(dir, textName), tailored.text, "utf8");

        let docxPath: string | null = null;
        let pdfPath: string | null = null;

        try {
          const docxBuf = await renderDocxBuffer(tailored.structured);
          const docxName = `${base}.docx`;
          await writeFile(path.join(dir, docxName), docxBuf);
          docxPath = `uploads/chains/${chainId}/${docxName}`;
        } catch (e) {
          console.error(`[chain ${chainId}] DOCX failed for ${c.name}`, e);
        }

        // Heartbeat before optional PDF (slowest export step)
        await prisma.chain.update({
          where: { id: chainId },
          data: { status: "GENERATING" },
        });

        if (c.exportFormat === "DOCX_PDF") {
          try {
            const pdfBuf = await renderPdfBuffer(tailored.structured);
            const pdfName = `${base}.pdf`;
            await writeFile(path.join(dir, pdfName), pdfBuf);
            pdfPath = `uploads/chains/${chainId}/${pdfName}`;
          } catch (e) {
            console.error(`[chain ${chainId}] PDF failed for ${c.name}`, e);
          }
        }

        // Skip duplicate if partial retry re-ran same candidate
        const existing = await prisma.chainCandidate.findFirst({
          where: { chainId, candidateId: c.id },
        });
        if (existing) {
          await prisma.chainCandidate.update({
            where: { id: existing.id },
            data: {
              tailoredResumeText: tailored.text,
              tailoredResumePath: `uploads/chains/${chainId}/${textName}`,
              docxPath,
              pdfPath,
              layoutId: c.layoutId,
              jobTitle: tailored.structured.meta.jobTitle,
              skillFingerprint: tailored.structured.meta.skillFingerprint,
              atsScore: tailored.ats.score,
              atsReady: tailored.ats.ready,
              atsBreakdownJson: JSON.stringify(tailored.ats),
            },
          });
        } else {
          await prisma.chainCandidate.create({
            data: {
              chainId,
              candidateId: c.id,
              tailoredResumeText: tailored.text,
              tailoredResumePath: `uploads/chains/${chainId}/${textName}`,
              docxPath,
              pdfPath,
              layoutId: c.layoutId,
              jobTitle: tailored.structured.meta.jobTitle,
              skillFingerprint: tailored.structured.meta.skillFingerprint,
              atsScore: tailored.ats.score,
              atsReady: tailored.ats.ready,
              atsBreakdownJson: JSON.stringify(tailored.ats),
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
    });

    return {
      chainId,
      status,
      succeeded,
      failed: errors.length,
      errors,
    };
  } catch (fatal) {
    // Absolute last resort — never leave GENERATING
    console.error(`[chain ${chainId}] fatal generation error`, fatal);
    try {
      const packCount = await prisma.chainCandidate.count({ where: { chainId } });
      const status = packCount > 0 ? "READY" : "FAILED";
      await prisma.chain.update({
        where: { id: chainId },
        data: { status },
      });
      await audit("chain.status_changed", userId, {
        chainId,
        status,
        fatal: fatal instanceof Error ? fatal.message : String(fatal),
      });
      return {
        chainId,
        status,
        succeeded: packCount,
        failed: errors.length + 1,
        errors: [
          ...errors,
          {
            candidateId: "",
            name: "(pipeline)",
            message: fatal instanceof Error ? fatal.message : String(fatal),
          },
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
 * Create chain row + generate resumes end-to-end with recovery + terminal status.
 * Does NOT block on other in-flight chains (only sweeps stale ones first).
 */
export async function createAndGenerateChain(opts: {
  userId: string;
  vendorName: string;
  vendorEmail: string;
  rawJobText: string;
  employeeNote?: string | null;
  candidateIds: string[];
}): Promise<GenerateChainResult & { id: string }> {
  // Free abandoned work so queues stay healthy — never block create if recover blips
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
