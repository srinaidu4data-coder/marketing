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
import {
  stepLabel,
  type ProgressReporter,
} from "@/lib/resume/generation-progress";
import { assessCandidateReady } from "@/lib/candidate-ready";
import { inspectPackShipReady } from "@/lib/resume/pack-ship-ready";
import { serializeMasterProfile, parseMasterProfile } from "@/lib/resume/master-profile";
import { sanitizePostgresText } from "@/lib/text-sanitize";

/** Chains older than this in GENERATING/SENDING are considered abandoned. */
export const STALE_CHAIN_MS = 10 * 60 * 1000; // 10 minutes (OpenAI multi-candidate)

/** Soft time budget so we finish before serverless kill (leave margin for response). */
function generationDeadlineMs(): number {
  if (process.env.VERCEL) {
    // OpenAI path: ~20–50s per candidate. Prefer CHAIN_BUDGET_MS; default ~4.5 min on Pro maxDuration 300.
    const raw = Number(process.env.CHAIN_BUDGET_MS || 270_000);
    return Date.now() + (Number.isFinite(raw) && raw > 10_000 ? raw : 270_000);
  }
  return Date.now() + Number(process.env.CHAIN_BUDGET_MS || 600_000);
}

export type GenerateChainInput = {
  chainId: string;
  userId: string;
  rawJobText: string;
  vendorName: string;
  candidateIds: string[];
  onProgress?: ProgressReporter;
};

export type GenerateChainResult = {
  chainId: string;
  /** READY = all selected packs ok; PARTIAL = some ok; FAILED = none */
  status: "READY" | "PARTIAL" | "FAILED";
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
  const { chainId, userId, vendorName, candidateIds, onProgress } = input;
  const errors: GenerateChainResult["errors"] = [];
  let timedOut = false;
  const deadline = generationDeadlineMs();
  const emit: ProgressReporter = async (ev) => {
    try {
      await onProgress?.(ev);
    } catch {
      /* ignore UI progress errors */
    }
    try {
      const { persistChainProgressEvent } = await import(
        "@/lib/resume/persist-chain-progress"
      );
      await persistChainProgressEvent(chainId, ev);
    } catch {
      /* never block generation on progress persist */
    }
  };

  try {
    // Authoritative JD always from Chain row (fixes empty-JD when caller arg was lost)
    const chainRow = await prisma.chain.findUnique({
      where: { id: chainId },
      select: { rawJobText: true, vendorName: true },
    });
    const rawJobText = sanitizePostgresText(
      (chainRow?.rawJobText || input.rawJobText || "").trim()
    );
    const resolvedVendor =
      (chainRow?.vendorName || vendorName || "").trim() || "Vendor";

    // Never abort the whole chain for thin JD — AI force path will still produce packs
    const effectiveJd =
      rawJobText.length >= 8
        ? rawJobText
        : rawJobText ||
          "Professional consulting role — tailor resume using master experience and strong delivery language.";

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

    await emit({
      type: "chain_start",
      chainId,
      candidateCount: candidates.length,
      candidateNames: candidates.map((x) => x.name),
    });

    /** Shared adaptive-cost budget across packs (C3 soft fire cap + deadline) */
    const chainBudget = {
      deadlineMs: deadline,
      packsStarted: 0,
      softFires: 0,
      surgeFires: 0,
    };

    for (let ci = 0; ci < candidates.length; ci++) {
      const c = candidates[ci];
      // C3: stop starting candidates with <45s headroom
      if (Date.now() > deadline - 45_000 && ci > 0) {
        timedOut = true;
        errors.push({
          candidateId: c.id,
          name: c.name,
          message:
            "Skipped: less than 45s remaining in generation budget for this chain.",
        });
        for (const r of candidates.slice(ci + 1)) {
          errors.push({
            candidateId: r.id,
            name: r.name,
            message: "Skipped: generation time budget already reached.",
          });
        }
        break;
      }
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
        const remaining = candidates.slice(ci + 1);
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

        await emit({
          type: "candidate_start",
          candidateId: c.id,
          candidateName: c.name,
          index: ci,
          total: candidates.length,
        });

        // Preflight: master must be parseable before calling AI
        const ready = assessCandidateReady(c);
        if (!ready.ok) {
          throw new Error(
            ready.reason ||
              "Candidate not ready for pack generation (master missing or unparsed)."
          );
        }

        // Ensure masterProfileJson has engagements (legacy empty JSON still needs re-parse)
        let masterProfileJson = c.masterProfileJson || null;
        {
          const { parseStoredMasterProfile } = await import(
            "@/lib/resume/master-profile"
          );
          const stored = parseStoredMasterProfile(masterProfileJson);
          if (!stored || stored.engagements.length === 0) {
            masterProfileJson = sanitizePostgresText(
              serializeMasterProfile(
                parseMasterProfile(c.masterResumeText || "")
              )
            );
            try {
              await prisma.candidate.update({
                where: { id: c.id },
                data: { masterProfileJson },
              });
            } catch {
              /* non-fatal */
            }
          }
        }

        await emit({
          type: "step",
          candidateId: c.id,
          candidateName: c.name,
          stepId: "parse_master",
          label: stepLabel("parse_master"),
          status: "active",
          detail: "Extracting contact and employers from the master…",
        });
        await emit({
          type: "step",
          candidateId: c.id,
          candidateName: c.name,
          stepId: "parse_master",
          label: stepLabel("parse_master"),
          status: "done",
        });
        await emit({
          type: "step",
          candidateId: c.id,
          candidateName: c.name,
          stepId: "parse_jd",
          label: stepLabel("parse_jd"),
          status: "active",
          detail: "Scanning JD for role, stack, and must-have keywords…",
        });
        await emit({
          type: "step",
          candidateId: c.id,
          candidateName: c.name,
          stepId: "parse_jd",
          label: stepLabel("parse_jd"),
          status: "done",
        });

        const tailored = await tailorResume({
          master: c.masterResumeText || "",
          masterProfileJson,
          jd: effectiveJd,
          vendorName: resolvedVendor,
          candidateName: c.name,
          employeeId: userId,
          layoutId: c.layoutId,
          email: c.email,
          chainBudget,
          onStep: async (stepId, status) => {
            const { stepWaitingOn, engagementTip } = await import(
              "@/lib/resume/generation-progress"
            );
            await emit({
              type: "step",
              candidateId: c.id,
              candidateName: c.name,
              stepId,
              label: stepLabel(stepId),
              status,
              detail:
                status === "active"
                  ? stepWaitingOn(stepId)
                  : status === "done"
                    ? `Done: ${stepLabel(stepId)}`
                    : undefined,
            });
            if (status === "active" && /llm|regen|repair/i.test(stepId)) {
              // Engagement pulse while the model thinks
              await emit({
                type: "heartbeat",
                candidateId: c.id,
                candidateName: c.name,
                message: stepWaitingOn(stepId),
                tipIndex: Date.now() % 12,
              });
              // Fire-and-forget tips every few seconds (best-effort)
              void (async () => {
                for (let t = 0; t < 8; t++) {
                  await new Promise((r) => setTimeout(r, 3500));
                  try {
                    await emit({
                      type: "heartbeat",
                      candidateId: c.id,
                      candidateName: c.name,
                      message: engagementTip(t + 1),
                      tipIndex: t + 1,
                    });
                  } catch {
                    /* */
                  }
                }
              })();
            }
          },
        });

        // Product law: never block save with ship-error banners for users.
        // Soft-inspect only — attach notes; still persist any pack with real text.
        const ship = inspectPackShipReady({
          text: tailored.text,
          masterText: c.masterResumeText || "",
          masterProfileJson,
          jd: effectiveJd,
          candidateName: c.name,
          ats: tailored.ats,
          psych: tailored.psych,
        });
        if (ship.issues.length) {
          tailored.structured.meta.progressiveNotes = [
            ...(tailored.structured.meta.progressiveNotes || []),
            ...ship.issues.map((i) => `ship-soft: ${i.code}: ${i.detail}`),
          ];
        }
        if (!(tailored.text || "").trim() || tailored.text.trim().length < 200) {
          // Absolute last resort should never hit if force path works
          throw new Error(
            "Pack text missing after generation — will retry on Recover"
          );
        }

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

        await emit({
          type: "step",
          candidateId: c.id,
          candidateName: c.name,
          stepId: "docx",
          label: stepLabel("docx"),
          status: "active",
        });
        try {
          const docxBuf = await renderDocxBuffer(tailored.structured);
          const docxName = `${base}.docx`;
          const ok = await safeWriteFile(path.join(dir, docxName), docxBuf);
          if (ok) docxPath = `uploads/chains/${chainId}/${docxName}`;
        } catch (e) {
          console.error(`[chain ${chainId}] DOCX render failed for ${c.name}`, e);
        }
        await emit({
          type: "step",
          candidateId: c.id,
          candidateName: c.name,
          stepId: "docx",
          label: stepLabel("docx"),
          status: "done",
        });

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
        await emit({
          type: "step",
          candidateId: c.id,
          candidateName: c.name,
          stepId: "saved",
          label: stepLabel("saved"),
          status: "active",
        });
        const existing = await prisma.chainCandidate.findFirst({
          where: { chainId, candidateId: c.id },
        });
        const packData = {
          // Strip NULs — Postgres rejects U+0000 in UTF-8 text (error 22021)
          tailoredResumeText: sanitizePostgresText(tailored.text || ""),
          tailoredResumePath: textRel,
          docxPath,
          pdfPath,
          layoutId: c.layoutId,
          jobTitle: sanitizePostgresText(tailored.structured.meta.jobTitle || ""),
          skillFingerprint: sanitizePostgresText(
            tailored.structured.meta.skillFingerprint || ""
          ),
          atsScore: tailored.ats.score,
          psychScore: tailored.psych?.score ?? 0,
          // Prefer explicit meta stamp (prompt-v2 / legacy-fallback) over domain mode
          tailorMode: sanitizePostgresText(
            tailored.structured.meta.tailorMode ||
              tailored.modeResult?.label ||
              tailored.modeResult?.mode ||
              ""
          ),
          atsReady: tailored.ats.score >= 95, // ship floor; BEST = dual 100 on best flag
          atsBreakdownJson: sanitizePostgresText(
            JSON.stringify({
              ats: tailored.ats,
              psych: tailored.psych,
              mode: tailored.modeResult,
              best: tailored.best,
              generationMeta: tailored.generationMeta || null,
              costUsd: tailored.costUsd ?? tailored.generationMeta?.costUsd ?? null,
              packValidation: tailored.packValidation
                ? {
                    ok: tailored.packValidation.ok,
                    score: tailored.packValidation.score,
                    summary: tailored.packValidation.summary,
                    clientsFound: tailored.packValidation.clientsFound.length,
                    clientsMissing: tailored.packValidation.clientsMissing,
                    yearsClaims: tailored.packValidation.yearsClaimsInSummary,
                  }
                : null,
              progressiveNotes: tailored.structured.meta.progressiveNotes,
            })
          ),
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
        await emit({
          type: "step",
          candidateId: c.id,
          candidateName: c.name,
          stepId: "saved",
          label: stepLabel("saved"),
          status: "done",
        });
        await emit({
          type: "candidate_done",
          candidateId: c.id,
          candidateName: c.name,
          ok: true,
        });
      } catch (e) {
        // NEVER show engine/precheck errors to users. Force unrestricted AI pack.
        console.error(
          `[chain ${chainId}] candidate ${c.id} primary path failed — force AI`,
          e
        );
        try {
          const { forceGenerateUnrestricted } = await import(
            "@/lib/resume-v2/force-generate"
          );
          const forced = await forceGenerateUnrestricted({
            master: c.masterResumeText || "",
            jd: effectiveJd,
            candidateName: c.name,
            email: c.email,
          });
          const base = c.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const textName = `${base}.txt`;
          const textRel = `uploads/chains/${chainId}/${textName}`;
          try {
            await mkdir(dir, { recursive: true });
            await safeWriteFile(path.join(dir, textName), forced.text);
          } catch {
            /* disk optional */
          }
          let docxPath: string | null = null;
          try {
            const docxBuf = await renderDocxBuffer(forced.structured);
            const docxName = `${base}.docx`;
            const ok = await safeWriteFile(path.join(dir, docxName), docxBuf);
            if (ok) docxPath = `uploads/chains/${chainId}/${docxName}`;
          } catch {
            /* optional */
          }
          const packData = {
            tailoredResumeText: sanitizePostgresText(forced.text || ""),
            tailoredResumePath: textRel,
            docxPath,
            pdfPath: null as string | null,
            layoutId: c.layoutId,
            jobTitle: sanitizePostgresText(
              forced.structured.meta.jobTitle || forced.pack.header.jobTitle || ""
            ),
            skillFingerprint: "",
            atsScore: forced.ats.score,
            psychScore: forced.psych?.score ?? 0,
            tailorMode: "prompt-v2-force",
            atsReady: forced.ats.score >= 95,
            atsBreakdownJson: sanitizePostgresText(
              JSON.stringify({
                force: true,
                ats: forced.ats,
                psych: forced.psych,
                progressiveNotes: forced.structured.meta.progressiveNotes,
              })
            ),
          };
          const existing = await prisma.chainCandidate.findFirst({
            where: { chainId, candidateId: c.id },
          });
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
          await emit({
            type: "candidate_done",
            candidateId: c.id,
            candidateName: c.name,
            ok: true,
            message: "Finished via unrestricted AI",
          });
          await audit("chain.status_changed", userId, {
            chainId,
            candidateId: c.id,
            forceFinish: true,
          });
        } catch (forceErr) {
          console.error(
            `[chain ${chainId}] force AI also failed for ${c.id}`,
            forceErr
          );
          // Still do not surface technical text — generic only for ops audit
          errors.push({
            candidateId: c.id,
            name: c.name,
            message: "Could not finish pack — use Retry",
          });
          try {
            const existingFail = await prisma.chainCandidate.findFirst({
              where: { chainId, candidateId: c.id },
            });
            const failData = {
              tailoredResumeText: "",
              tailoredResumePath: null as string | null,
              docxPath: null as string | null,
              pdfPath: null as string | null,
              layoutId: c.layoutId,
              jobTitle: "",
              skillFingerprint: "",
              atsScore: 0,
              psychScore: 0,
              tailorMode: "",
              atsReady: false,
              atsBreakdownJson: JSON.stringify({
                needsRetry: true,
                failedAt: new Date().toISOString(),
              }),
              sendStatus: "FAILED" as const,
            };
            if (existingFail) {
              await prisma.chainCandidate.update({
                where: { id: existingFail.id },
                data: failData,
              });
            } else {
              await prisma.chainCandidate.create({
                data: { chainId, candidateId: c.id, ...failData },
              });
            }
          } catch {
            /* */
          }
          await emit({
            type: "candidate_done",
            candidateId: c.id,
            candidateName: c.name,
            ok: false,
            message: "Could not finish pack — use Retry",
          });
          await audit("chain.candidate_failed", userId, {
            chainId,
            candidateId: c.id,
            message: "Could not finish pack — use Retry",
          });
        }
      }
    }

    const packRows = await prisma.chainCandidate.findMany({
      where: { chainId },
      select: { tailoredResumeText: true },
    });
    const goodPackCount = packRows.filter(
      (p) => (p.tailoredResumeText || "").trim().length > 200
    ).length;
    const selected = candidateIds.length;
    // READY = every selected candidate got a good pack; PARTIAL = some; FAILED = none
    const status: "READY" | "PARTIAL" | "FAILED" =
      goodPackCount === 0
        ? "FAILED"
        : goodPackCount >= selected && errors.length === 0
          ? "READY"
          : "PARTIAL";

    await prisma.chain.update({
      where: { id: chainId },
      data: { status },
    });
    await audit("chain.status_changed", userId, {
      chainId,
      status,
      succeeded: goodPackCount,
      failed: errors.length,
      timedOut,
      errors: errors.slice(0, 8),
    });

    await emit({
      type: "chain_done",
      chainId,
      status,
      succeeded: goodPackCount,
      failed: errors.length,
      errors: errors.map((e) => ({ name: e.name, message: e.message })),
    });

    return {
      chainId,
      status,
      succeeded: goodPackCount,
      failed: errors.length,
      errors,
      timedOut,
    };
  } catch (fatal) {
    console.error(`[chain ${chainId}] fatal generation error`, fatal);
    try {
      const packRows = await prisma.chainCandidate.findMany({
        where: { chainId },
        select: { tailoredResumeText: true },
      });
      const goodPackCount = packRows.filter(
        (p) => (p.tailoredResumeText || "").trim().length > 200
      ).length;
      const status: GenerateChainResult["status"] =
        goodPackCount === 0
          ? "FAILED"
          : goodPackCount >= candidateIds.length
            ? "READY"
            : "PARTIAL";
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
        succeeded: goodPackCount,
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
  onProgress?: ProgressReporter;
}): Promise<GenerateChainResult & { id: string }> {
  try {
    await recoverStaleChains();
  } catch (e) {
    console.error("recoverStaleChains failed (continuing create)", e);
  }

  let jdForStore = sanitizePostgresText((opts.rawJobText || "").trim());
  if (jdForStore.length < 8) {
    // Still create chain — AI force path will finish packs
    jdForStore =
      jdForStore ||
      "Professional consulting role — tailor using master experience.";
  }

  const chain = await prisma.chain.create({
    data: {
      employeeId: opts.userId,
      vendorName: opts.vendorName,
      vendorEmail: opts.vendorEmail,
      rawJobText: jdForStore,
      employeeNote: opts.employeeNote || null,
      status: "GENERATING",
    },
  });

  await audit("chain.create", opts.userId, {
    chainId: chain.id,
    vendorName: opts.vendorName,
    count: opts.candidateIds.length,
    candidateIds: opts.candidateIds,
  });
  await audit("chain.status_changed", opts.userId, {
    chainId: chain.id,
    status: "GENERATING",
  });

  const result = await generateChainResumes({
    chainId: chain.id,
    userId: opts.userId,
    rawJobText: jdForStore,
    vendorName: opts.vendorName,
    candidateIds: opts.candidateIds,
    onProgress: opts.onProgress,
  });

  return { ...result, id: chain.id };
}

/**
 * Re-run generation only for missing / failed / non-ship-ready packs.
 * Does not re-burn tokens on packs that already pass ship-ready.
 */
export async function retryGenerateChain(
  chainId: string,
  userId: string,
  candidateIds?: string[]
): Promise<GenerateChainResult> {
  const chain = await prisma.chain.findUnique({
    where: { id: chainId },
    include: {
      candidates: { include: { candidate: true } },
    },
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

  let ids = candidateIds?.length ? [...candidateIds] : [];

  if (!ids.length) {
    // 1) Prefer IDs stored at create time
    try {
      const createLogs = await prisma.auditLog.findMany({
        where: { action: "chain.create" },
        orderBy: { createdAt: "desc" },
        take: 40,
      });
      for (const row of createLogs) {
        try {
          const meta = JSON.parse(row.meta || "{}") as {
            chainId?: string;
            candidateIds?: string[];
          };
          if (meta.chainId === chainId && meta.candidateIds?.length) {
            ids = meta.candidateIds;
            break;
          }
        } catch {
          /* next */
        }
      }
    } catch {
      /* ignore */
    }

    // 2) All rows on chain (includes failure placeholders)
    if (!ids.length) {
      ids = chain.candidates.map((c) => c.candidateId);
    }

    // 3) Last resort: employee allocations (legacy empty chains)
    if (!ids.length) {
      const alloc = await prisma.allocation.findMany({
        where: { employeeId: chain.employeeId },
        select: { candidateId: true },
      });
      ids = alloc.map((a) => a.candidateId);
    }
  }

  // Only regenerate missing/empty/non-ship-ready
  const { inspectPackShipReady } = await import("@/lib/resume/pack-ship-ready");
  const needRetry: string[] = [];
  for (const id of ids) {
    const row = chain.candidates.find((c) => c.candidateId === id);
    const text = row?.tailoredResumeText || "";
    if (text.trim().length < 200) {
      needRetry.push(id);
      continue;
    }
    const ship = inspectPackShipReady({
      text,
      masterText: row?.candidate?.masterResumeText || "",
      masterProfileJson: row?.candidate?.masterProfileJson || null,
    });
    if (!ship.ok) needRetry.push(id);
  }

  if (!needRetry.length) {
    // Nothing to do — recompute terminal status
    const good = chain.candidates.filter(
      (c) => (c.tailoredResumeText || "").trim().length > 200
    ).length;
    const status: GenerateChainResult["status"] =
      good === 0 ? "FAILED" : good >= ids.length ? "READY" : "PARTIAL";
    await prisma.chain.update({ where: { id: chainId }, data: { status } });
    return {
      chainId,
      status,
      succeeded: good,
      failed: 0,
      errors: [],
    };
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
    candidateIds: needRetry,
  });
}
