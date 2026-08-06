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
  formatEmployeeFrom,
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
  if (user.role === "EMPLOYEE" && chain.employeeHiddenAt) {
    return { ok: false as const, error: "Not found" };
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
 * Re-run resume generation. Always regenerates (forceAll default true from UI).
 * Optional form fields: chainId, forceAll=1, candidateId (single pack).
 */
export async function retryGenerateChainAction(formData?: FormData | string) {
  const user = await requireUser();
  const chainId =
    typeof formData === "string"
      ? formData
      : String(formData?.get("chainId") || "").trim();
  const forceAll =
    typeof formData === "string"
      ? true
      : formData?.get("forceAll") !== "0";
  const oneCandidate =
    typeof formData === "string"
      ? ""
      : String(formData?.get("candidateId") || "").trim();

  if (!chainId) return { ok: false as const, error: "Missing chain" };

  const chain = await prisma.chain.findUnique({ where: { id: chainId } });
  if (!chain) return { ok: false as const, error: "Not found" };
  if (user.role === "EMPLOYEE" && chain.employeeId !== user.id) {
    return { ok: false as const, error: "Forbidden" };
  }
  if (user.role === "EMPLOYEE" && chain.employeeHiddenAt) {
    return { ok: false as const, error: "Not found" };
  }

  const nextPath =
    typeof formData === "string"
      ? ""
      : String(formData?.get("next") || "").trim();

  const result = await retryGenerateChain(
    chainId,
    user.id,
    oneCandidate ? [oneCandidate] : undefined,
    { forceAll: forceAll && !oneCandidate }
  );
  revalidatePath(`/chains/${chainId}`);
  revalidatePath(`/admin/chains/${chainId}`);
  revalidatePath("/admin/queues");
  revalidatePath("/chains");
  revalidatePath("/admin/chains");
  const { redirect } = await import("next/navigation");
  const dest =
    nextPath.startsWith("/admin/chains/") || nextPath.startsWith("/chains/")
      ? `${nextPath.split("?")[0]}?retry=1`
      : user.role === "ADMIN"
        ? `/admin/chains/${chainId}?retry=1`
        : `/chains/${chainId}?retry=1`;
  // result used for logging only — redirect always
  void result;
  redirect(dest);
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
  if (user.role === "EMPLOYEE" && chain.employeeHiddenAt) {
    return { error: "Not found" };
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

  // Product law: send if pack has real body (aligned with shipReportsForChain soft UI).
  // Hard empty packs still blocked. Structural nits (bullet pad, residue notes) no longer block email.
  const readyToSend = chain.candidates.filter((cc) => {
    const text = (cc.tailoredResumeText || "").trim();
    if (text.length < 200) return false;
    // Prefer packs with Employer/Client shape; still allow long body packs
    return (
      /Employer\s*\/\s*Client\s*:/i.test(text) || text.length >= 800
    );
  });
  if (readyToSend.length === 0) {
    return {
      error: "PACK_NOT_SHIP_READY",
      message:
        "Cannot send: no pack text ready. Use Retry so AI can finish packs, then send again.",
    };
  }
  const emptyPacks = chain.candidates.filter((cc) => {
    const text = (cc.tailoredResumeText || "").trim();
    return text.length > 0 && text.length < 200;
  });
  // Only block when some candidates have partial junk and none are ready — if any ready, send those
  if (emptyPacks.length && readyToSend.length === 0) {
    return {
      error: "PACK_NOT_SHIP_READY",
      message: `Cannot send while ${emptyPacks.length} pack(s) are empty (retry those first): ${emptyPacks
        .map((c) => c.candidate.name)
        .join(", ")}`,
    };
  }

  const lowAts = readyToSend.filter((c) => c.atsScore < 95);

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

    for (const cc of readyToSend) {
      // Heartbeat during send so stale sweeper won't kill live sends
      await prisma.chain.update({
        where: { id: chainId },
        data: { status: "SENDING" },
      });

      const { extractJobTitle } = await import("@/lib/resume/jd-parse");
      const roleTitle =
        (cc.jobTitle || "").trim() ||
        extractJobTitle(chain.rawJobText) ||
        "SAP Consultant";
      const ctx = {
        candidate_name: cc.candidate.name,
        // Clean role for subject lines — never dump raw JD into the subject
        job_title_or_vendor_line: roleTitle,
        vendor_name: chain.vendorName,
        employee_name: chain.employee.name,
        employee_email: chain.employee.email,
        employee_note: chain.employeeNote || "",
        job_requirement_summary: chain.rawJobText.slice(0, 500),
      };
      const subject = renderEmailTemplate(subjectTpl?.content || "{{candidate_name}}", ctx);
      const body = renderEmailTemplate(bodyTpl?.content || "", ctx);
      const emailCfg = getResendConfig();
      // From = sending employee (e.g. Akanksha <akanksha@srsoftllc.com>)
      const fromAddr = formatEmployeeFrom({
        name: chain.employee.name,
        email: chain.employee.email,
        fallback: emailCfg.from,
      });
      // CC candidate so they see vendor outreach; also keep env default CC
      const candidateEmail = (cc.candidate.email || "").trim();
      const ccList = [
        ...(candidateEmail && candidateEmail.includes("@")
          ? [candidateEmail]
          : []),
      ];

      try {
        await audit("chain.email_enqueued", user.id, {
          chainId,
          to: chain.vendorEmail,
          from: fromAddr,
          cc: ccList,
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
          skillFingerprint: cc.skillFingerprint,
          layoutId: cc.layoutId || cc.candidate.layoutId,
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
            from: fromAddr,
            error: "No resume attachment available (empty pack)",
            emailMode: emailCfg.mode,
          });
          continue;
        }

        const sent = await sendWithResend({
          to: chain.vendorEmail,
          from: fromAddr,
          subject,
          text: body,
          html: textToSimpleHtml(body),
          // Reply-To: employee (same as From usually); candidate already on CC
          replyTo:
            chain.employee.email ||
            emailCfg.replyToDefault ||
            undefined,
          cc: ccList,
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
            from: fromAddr,
            cc: ccList,
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
          from: fromAddr,
          cc: ccList,
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

/**
 * Hide chains from employee UI only. Admin retains full history.
 * Only affects owners with role EMPLOYEE (never wipes admin-owned chains).
 */
export async function hideEmployeeChainsAction(formData: FormData) {
  const admin = await requireAdmin();
  const employeeId = String(formData.get("employeeId") || "").trim() || null;
  const scope = String(formData.get("scope") || "employee"); // employee | all_employees

  const whereBase: {
    employeeHiddenAt: null;
    employeeId?: string;
    employee: { role: "EMPLOYEE" };
  } = {
    employeeHiddenAt: null,
    employee: { role: "EMPLOYEE" },
  };

  if (scope === "employee") {
    if (!employeeId) return { ok: false as const, error: "employeeId required" };
    const emp = await prisma.user.findUnique({ where: { id: employeeId } });
    if (!emp || emp.role !== "EMPLOYEE") {
      return { ok: false as const, error: "Only employee accounts can be cleaned" };
    }
    whereBase.employeeId = employeeId;
  }

  const result = await prisma.chain.updateMany({
    where: whereBase,
    data: {
      employeeHiddenAt: new Date(),
      employeeHiddenBy: admin.id,
    },
  });

  await audit("chain.employee_hide", admin.id, {
    employeeId: employeeId || "all_employees",
    scope,
    count: result.count,
  });

  revalidatePath("/chains");
  revalidatePath("/admin/chains");
  revalidatePath("/admin/employees");
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/");
  revalidatePath("/admin/queues");

  return { ok: true as const, count: result.count };
}

/** Hide one chain from its employee owner (admin only). */
export async function hideSingleEmployeeChainAction(chainId: string) {
  const admin = await requireAdmin();
  const chain = await prisma.chain.findUnique({
    where: { id: chainId },
    include: { employee: true },
  });
  if (!chain) return { ok: false as const, error: "Not found" };
  if (chain.employee.role !== "EMPLOYEE") {
    return { ok: false as const, error: "Only employee-owned chains can be cleaned" };
  }

  await prisma.chain.update({
    where: { id: chainId },
    data: {
      employeeHiddenAt: new Date(),
      employeeHiddenBy: admin.id,
    },
  });

  await audit("chain.employee_hide", admin.id, {
    chainId,
    employeeId: chain.employeeId,
    scope: "single",
    count: 1,
  });

  revalidatePath(`/admin/chains/${chainId}`);
  revalidatePath("/admin/chains");
  revalidatePath("/chains");
  revalidatePath(`/admin/employees/${chain.employeeId}`);
  revalidatePath("/");

  return { ok: true as const };
}

/** Restore a single chain to the employee’s list (admin only). */
export async function unhideChainFromEmployeeAction(chainId: string) {
  const admin = await requireAdmin();
  const chain = await prisma.chain.findUnique({
    where: { id: chainId },
    include: { employee: true },
  });
  if (!chain) return { ok: false as const, error: "Not found" };

  await prisma.chain.update({
    where: { id: chainId },
    data: { employeeHiddenAt: null, employeeHiddenBy: null },
  });

  await audit("chain.employee_unhide", admin.id, {
    chainId,
    employeeId: chain.employeeId,
  });

  revalidatePath(`/admin/chains/${chainId}`);
  revalidatePath("/admin/chains");
  revalidatePath("/chains");
  revalidatePath(`/admin/employees/${chain.employeeId}`);
  revalidatePath("/");

  return { ok: true as const };
}
