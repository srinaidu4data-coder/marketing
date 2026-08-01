"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import { renderEmailTemplate } from "@/lib/resume-tailor";
import {
  checkVendorConflicts,
  recordVendorSubmissions,
} from "@/lib/resume/vendor-guard";
import {
  createAndGenerateChain,
  failStuckChain,
  recoverStaleChains,
  retryGenerateChain,
} from "@/lib/chain-pipeline";
import {
  getResendConfig,
  loadChainAttachments,
  sendWithResend,
  textToSimpleHtml,
} from "@/lib/email/resend";

export type CreateChainResult =
  | { ok: true; chainId: string }
  | { ok: false; blocked: true; conflicts: Awaited<ReturnType<typeof checkVendorConflicts>> }
  | { ok: false; error: string };

export async function previewVendorConflicts(formData: FormData) {
  await requireUser();
  const rawJobText = String(formData.get("rawJobText") || "").trim();
  const vendorName = String(formData.get("vendorName") || "").trim();
  const vendorEmail = String(formData.get("vendorEmail") || "").trim();
  const candidateIds = formData.getAll("candidateIds").map(String);
  if (!rawJobText || !vendorEmail || candidateIds.length === 0) {
    return { conflicts: [] as Awaited<ReturnType<typeof checkVendorConflicts>> };
  }
  const conflicts = await checkVendorConflicts({
    candidateIds,
    vendorEmail,
    vendorName,
    rawJobText,
  });
  return { conflicts };
}

/**
 * Server-action path for chain create (forms that post without fetch).
 * Uses resilient pipeline — never leaves GENERATING on error.
 */
export async function createChain(formData: FormData): Promise<void> {
  const user = await requireUser();
  const rawJobText = String(formData.get("rawJobText") || "").trim();
  const vendorName = String(formData.get("vendorName") || "").trim();
  const vendorEmail = String(formData.get("vendorEmail") || "").trim();
  const employeeNote = String(formData.get("employeeNote") || "").trim();
  const candidateIds = formData.getAll("candidateIds").map(String);
  const forceSameSkill = formData.get("forceSameSkill") === "1";

  if (!rawJobText || !vendorName || !vendorEmail) {
    throw new Error("Invalid input: rawJobText, vendorName, vendorEmail required");
  }
  if (candidateIds.length === 0) {
    throw new Error("Select at least one candidate");
  }

  let allowedIds = candidateIds;
  if (user.role === "EMPLOYEE") {
    const pool = await prisma.allocation.findMany({
      where: { employeeId: user.id, candidateId: { in: candidateIds } },
    });
    allowedIds = pool.map((p) => p.candidateId);
    if (allowedIds.length === 0) throw new Error("No candidates allocated");
  }

  // Preflight masters (same as API stream path)
  const { assessCandidateReady } = await import("@/lib/candidate-ready");
  const candRows = await prisma.candidate.findMany({
    where: { id: { in: allowedIds } },
  });
  const readyIds = candRows
    .filter((c) => assessCandidateReady(c).ok)
    .map((c) => c.id);
  if (readyIds.length === 0) {
    throw new Error(
      "No candidates have a parsed master resume. Upload/replace master .docx first."
    );
  }
  allowedIds = readyIds;

  const conflicts = await checkVendorConflicts({
    candidateIds: allowedIds,
    vendorEmail,
    vendorName,
    rawJobText,
  });
  if (conflicts.length > 0) {
    const payload = Buffer.from(JSON.stringify(conflicts), "utf8").toString("base64url");
    redirect(`/chains/new?blocked=1&conflicts=${payload}`);
  }

  void forceSameSkill;

  const result = await createAndGenerateChain({
    userId: user.id,
    vendorName,
    vendorEmail,
    rawJobText,
    employeeNote: employeeNote || null,
    candidateIds: allowedIds,
  });

  revalidatePath("/chains");
  revalidatePath("/");
  revalidatePath("/admin/chains");
  revalidatePath("/admin/queues");

  if (result.status === "FAILED") {
    // Still land on detail so user can see failure — not stuck mid-pipeline
    redirect(
      user.role === "ADMIN"
        ? `/admin/chains/${result.id}?failed=1`
        : `/chains/${result.id}?failed=1`
    );
  }

  redirect(
    user.role === "ADMIN" ? `/admin/chains/${result.id}` : `/chains/${result.id}`
  );
}

/**
 * Admin: sweep stale GENERATING/SENDING chains.
 * Uses a short grace (30s) so actively heartbeating live jobs survive.
 */
export async function recoverAllStaleChainsAction() {
  await requireAdmin();
  const r = await recoverStaleChains({ olderThanMs: 30_000 });
  revalidatePath("/admin/queues");
  revalidatePath("/admin/chains");
  revalidatePath("/chains");
  return { recovered: r.recovered };
}

/**
 * Fail a single stuck chain (admin or owning employee).
 */
export async function recoverStuckChainAction(chainId: string) {
  const user = await requireUser();
  const chain = await prisma.chain.findUnique({ where: { id: chainId } });
  if (!chain) return { ok: false as const, error: "Not found" };
  if (user.role === "EMPLOYEE" && chain.employeeId !== user.id) {
    return { ok: false as const, error: "Forbidden" };
  }

  const result = await failStuckChain(chainId, user.id, "user_recover");
  revalidatePath(`/chains/${chainId}`);
  revalidatePath(`/admin/chains/${chainId}`);
  revalidatePath("/admin/queues");
  revalidatePath("/chains");
  revalidatePath("/admin/chains");
  return result;
}

/**
 * Re-run resume generation for a failed/empty/partial chain.
 */
export async function retryGenerateChainAction(chainId: string) {
  const user = await requireUser();
  const chain = await prisma.chain.findUnique({ where: { id: chainId } });
  if (!chain) return { ok: false as const, error: "Not found" };
  if (user.role === "EMPLOYEE" && chain.employeeId !== user.id) {
    return { ok: false as const, error: "Forbidden" };
  }

  const result = await retryGenerateChain(chainId, user.id);
  revalidatePath(`/chains/${chainId}`);
  revalidatePath(`/admin/chains/${chainId}`);
  revalidatePath("/admin/queues");
  revalidatePath("/chains");
  revalidatePath("/admin/chains");
  return {
    ok: result.status === "READY" || result.status === "PARTIAL",
    status: result.status,
    succeeded: result.succeeded,
    failed: result.failed,
    errors: result.errors,
    timedOut: result.timedOut,
  };
}

export async function sendChain(chainId: string) {
  const user = await requireUser();
  const chain = await prisma.chain.findUnique({
    where: { id: chainId },
    include: {
      candidates: { include: { candidate: true } },
      employee: true,
    },
  });
  if (!chain) return { error: "Not found" };
  if (user.role === "EMPLOYEE" && chain.employeeId !== user.id) {
    return { error: "Forbidden" };
  }

  // Cannot send while still generating — offer recover path via status
  if (chain.status === "GENERATING") {
    return {
      error: "CHAIN_STILL_GENERATING",
      message:
        "This chain is still generating or was abandoned mid-generation. Use Recover if it is stuck.",
    };
  }

  const conflicts = await checkVendorConflicts({
    candidateIds: chain.candidates.map((c) => c.candidateId),
    vendorEmail: chain.vendorEmail,
    vendorName: chain.vendorName,
    rawJobText: chain.rawJobText,
  });
  if (conflicts.length > 0) {
    return {
      error: "VENDOR_SKILL_CONFLICT",
      message: conflicts.map((c) => c.message).join("\n"),
      conflicts,
    };
  }

  if (chain.candidates.length === 0) {
    await prisma.chain.update({ where: { id: chainId }, data: { status: "FAILED" } });
    return { error: "NO_CANDIDATES", message: "No resumes on this chain to send." };
  }

  // Ship/no-ship: shared inspect (bullets, clients, cosplay, empty)
  const { inspectPackShipReady } = await import("@/lib/resume/pack-ship-ready");
  const unsendable = chain.candidates
    .map((cc) => {
      const ship = inspectPackShipReady({
        text: cc.tailoredResumeText || "",
        masterText: cc.candidate.masterResumeText || "",
        masterProfileJson: cc.candidate.masterProfileJson || null,
      });
      return { cc, ship };
    })
    .filter((x) => !x.ship.ok);
  if (unsendable.length) {
    return {
      error: "PACK_NOT_SHIP_READY",
      message: `Cannot send: ${unsendable.length} pack(s) fail mandatory quality. ${unsendable
        .map(
          (x) =>
            `${x.cc.candidate.name}: ${x.ship.issues.map((i) => i.detail).join("; ")}`
        )
        .join(" | ")}`,
    };
  }

  const lowAts = chain.candidates.filter((c) => c.atsScore < 95);

  await prisma.chain.update({ where: { id: chainId }, data: { status: "SENDING" } });
  await audit("chain.send_requested", user.id, {
    chainId,
    lowAtsCount: lowAts.length,
  });

  try {
    const subjectTpl = await prisma.emailTemplateVersion.findFirst({
      where: { type: "SUBJECT", status: "ACTIVE" },
    });
    const bodyTpl = await prisma.emailTemplateVersion.findFirst({
      where: { type: "BODY", status: "ACTIVE" },
    });

    let failed = 0;
    const ledgerItems: {
      candidateId: string;
      jobTitle: string;
      skillFingerprint: string;
    }[] = [];

    for (const cc of chain.candidates) {
      // Heartbeat during send so stale sweeper won't kill live sends
      await prisma.chain.update({
        where: { id: chainId },
        data: { status: "SENDING" },
      });

      const ctx = {
        candidate_name: cc.candidate.name,
        job_title_or_vendor_line: chain.rawJobText.slice(0, 80).replace(/\n/g, " "),
        vendor_name: chain.vendorName,
        employee_name: chain.employee.name,
        employee_email: chain.employee.email,
        employee_note: chain.employeeNote || "",
        job_requirement_summary: chain.rawJobText.slice(0, 500),
      };
      const subject = renderEmailTemplate(subjectTpl?.content || "{{candidate_name}}", ctx);
      const body = renderEmailTemplate(bodyTpl?.content || "", ctx);
      const emailCfg = getResendConfig();

      try {
        await audit("chain.email_enqueued", user.id, {
          chainId,
          to: chain.vendorEmail,
          from: emailCfg.from,
          subject,
          candidateId: cc.candidateId,
          layoutId: cc.layoutId,
          atsScore: cc.atsScore,
          emailMode: emailCfg.mode,
        });

        const attachments = await loadChainAttachments({
          docxPath: cc.docxPath,
          pdfPath: cc.pdfPath,
          textPath: cc.tailoredResumePath,
          baseName: cc.candidate.name,
          tailoredResumeText: cc.tailoredResumeText,
          candidateName: cc.candidate.name,
          jobTitle: cc.jobTitle,
        });

        if (!attachments.length) {
          failed++;
          await prisma.chainCandidate.update({
            where: { id: cc.id },
            data: { sendStatus: "FAILED" },
          });
          await audit("chain.email_failed", user.id, {
            chainId,
            candidateId: cc.candidateId,
            to: chain.vendorEmail,
            from: emailCfg.from,
            error: "No resume attachment available (empty pack)",
            emailMode: emailCfg.mode,
          });
          continue;
        }

        const sent = await sendWithResend({
          to: chain.vendorEmail,
          subject,
          text: body,
          html: textToSimpleHtml(body),
          replyTo: chain.employee.email || emailCfg.replyToDefault || undefined,
          attachments,
          tags: [
            { name: "chain_id", value: chainId.slice(0, 36) },
            { name: "candidate_id", value: cc.candidateId.slice(0, 36) },
          ],
        });

        if (!sent.ok) {
          failed++;
          await prisma.chainCandidate.update({
            where: { id: cc.id },
            data: { sendStatus: "FAILED" },
          });
          await audit("chain.email_failed", user.id, {
            chainId,
            candidateId: cc.candidateId,
            to: chain.vendorEmail,
            from: emailCfg.from,
            error: sent.error,
            emailMode: sent.mode,
          });
          continue;
        }

        await prisma.chainCandidate.update({
          where: { id: cc.id },
          data: { sendStatus: "SENT" },
        });
        await audit("chain.email_sent", user.id, {
          chainId,
          to: chain.vendorEmail,
          from: emailCfg.from,
          subject,
          bodyPreview: body.slice(0, 200),
          candidateId: cc.candidateId,
          resendId: sent.id,
          emailMode: sent.mode,
          attachmentCount: attachments.length,
          attachmentNames: attachments.map((a) => a.filename),
        });
        ledgerItems.push({
          candidateId: cc.candidateId,
          jobTitle: cc.jobTitle || "SAP Consultant",
          skillFingerprint: cc.skillFingerprint || "unknown",
        });
      } catch (e) {
        failed++;
        await prisma.chainCandidate.update({
          where: { id: cc.id },
          data: { sendStatus: "FAILED" },
        });
        await audit("chain.email_failed", user.id, {
          chainId,
          candidateId: cc.candidateId,
          to: chain.vendorEmail,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (ledgerItems.length) {
      await recordVendorSubmissions({
        chainId,
        vendorName: chain.vendorName,
        vendorEmail: chain.vendorEmail,
        rawJobText: chain.rawJobText,
        items: ledgerItems,
        employeeId: user.id,
      });
    }

    const status = failed === chain.candidates.length ? "FAILED" : "SENT";
    await prisma.chain.update({ where: { id: chainId }, data: { status } });
    await audit("chain.status_changed", user.id, { chainId, status });

    revalidatePath(`/chains/${chainId}`);
    revalidatePath(`/admin/chains/${chainId}`);
    revalidatePath("/chains");
    revalidatePath("/admin/chains");
    revalidatePath("/admin/queues");
    revalidatePath("/admin/email-activity");
    const emailCfgFinal = getResendConfig();
    return {
      ok: true,
      status,
      lowAtsCount: lowAts.length,
      sent: chain.candidates.length - failed,
      failed,
      emailMode: emailCfgFinal.mode,
      to: chain.vendorEmail,
      from: emailCfgFinal.from,
      simulated: emailCfgFinal.mode === "simulated",
      dryRun: emailCfgFinal.mode === "dry_run",
      message:
        emailCfgFinal.mode === "simulated"
          ? "Marked sent in app, but RESEND_API_KEY is not set — no real email was delivered. Add the key in Vercel env."
          : emailCfgFinal.mode === "dry_run"
            ? "Dry-run mode: no real email (EMAIL_DRY_RUN=true)."
            : `Sent ${chain.candidates.length - failed} of ${chain.candidates.length} to ${chain.vendorEmail}.`,
    };
  } catch (e) {
    // Never leave SENDING forever
    console.error(`[sendChain ${chainId}] fatal`, e);
    const anySent = await prisma.chainCandidate.count({
      where: { chainId, sendStatus: "SENT" },
    });
    const status = anySent > 0 ? "SENT" : "FAILED";
    await prisma.chain.update({ where: { id: chainId }, data: { status } });
    await audit("chain.status_changed", user.id, {
      chainId,
      status,
      fatal: e instanceof Error ? e.message : String(e),
    });
    revalidatePath(`/chains/${chainId}`);
    revalidatePath(`/admin/chains/${chainId}`);
    revalidatePath("/admin/queues");
    return {
      ok: false,
      error: "SEND_FAILED",
      message: e instanceof Error ? e.message : "Send failed",
      status,
    };
  }
}
