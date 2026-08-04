import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  recoverStuckChainAction,
  retryGenerateChainAction,
  sendChain,
} from "@/app/actions/chains";
import { getResendConfig } from "@/lib/email/resend";
import {
  decodeShipErrorMessage,
  encodeShipErrorMessage,
  shipReportsForChain,
} from "@/lib/chain-ship-ui";
import { ChainPacksTable } from "@/components/chain-packs-table";
import {
  ChainBanner,
  ChainDetailShell,
} from "@/components/chain-detail-shell";

export default async function ChainDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    failed?: string;
    sent?: string;
    ship?: string;
    partial?: string;
    ready?: string;
  };
}) {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect(`/admin/chains/${params.id}`);

  const chain = await prisma.chain.findUnique({
    where: { id: params.id },
    include: {
      candidates: { include: { candidate: true } },
      employee: true,
    },
  });
  if (!chain || chain.employeeId !== user.id) notFound();
  // Admin cleaned this chain from the employee workspace — still exists for admin audit
  if (chain.employeeHiddenAt) notFound();

  const emailCfg = getResendConfig();

  const genErrors = await prisma.auditLog.findMany({
    where: {
      OR: [
        { action: "chain.candidate_failed", meta: { contains: chain.id } },
        { action: "chain.status_changed", meta: { contains: chain.id } },
        { action: "chain.email_failed", meta: { contains: chain.id } },
        { action: "chain.email_sent", meta: { contains: chain.id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 16,
  });

  const errorHints: string[] = [];
  for (const row of genErrors) {
    try {
      const meta = JSON.parse(row.meta || "{}") as {
        chainId?: string;
        message?: string;
        fatal?: string;
        errors?: { name?: string; message?: string }[];
        reason?: string;
        timedOut?: boolean;
        error?: string;
      };
      if (meta.chainId && meta.chainId !== chain.id) continue;
      if (meta.fatal) errorHints.push(meta.fatal);
      if (meta.message) errorHints.push(meta.message);
      if (meta.error) errorHints.push(meta.error);
      if (meta.reason) errorHints.push(String(meta.reason));
      if (meta.timedOut) errorHints.push("Generation hit serverless time budget");
      if (meta.errors?.length) {
        for (const e of meta.errors.slice(0, 4)) {
          errorHints.push(`${e.name || "candidate"}: ${e.message || "failed"}`);
        }
      }
    } catch {
      /* ignore */
    }
  }
  const uniqueHints = Array.from(new Set(errorHints)).slice(0, 6);

  const sent = chain.candidates.filter((c) => c.sendStatus === "SENT").length;
  const total = chain.candidates.length;
  const lowAts = chain.candidates.filter((c) => c.atsScore < 95);
  const shipReports = shipReportsForChain(chain.candidates);
  const badPacks = shipReports.filter((r) => !r.missingPack && !r.ship.ok);
  const missingPacks = shipReports.filter((r) => r.missingPack);
  const goodPacks = shipReports.filter((r) => !r.missingPack && r.ship.ok);
  const notShipReady = shipReports.filter((r) => !r.ship.ok);
  const stuck = chain.status === "GENERATING" || chain.status === "SENDING";
  const emptyFailed = chain.status === "FAILED" && total === 0;
  const canSend =
    goodPacks.length > 0 &&
    badPacks.length === 0 &&
    !stuck &&
    (chain.status === "READY" ||
      chain.status === "PARTIAL" ||
      chain.status === "FAILED" ||
      chain.status === "SENT");
  // Every ship-ready pack has been emailed (primary CTA → Sent / Resend)
  const allEmailed =
    goodPacks.length > 0 &&
    goodPacks.every((r) => {
      const row = chain.candidates.find((c) => c.id === r.id);
      return row?.sendStatus === "SENT";
    });
  const shipErrorMsg = decodeShipErrorMessage(searchParams?.ship);
  const showRetry =
    !stuck &&
    (emptyFailed ||
      chain.status === "FAILED" ||
      chain.status === "PARTIAL" ||
      missingPacks.length > 0 ||
      badPacks.length > 0);

  async function sendAction() {
    "use server";
    const result = await sendChain(params.id);
    if (result && "error" in result) {
      if (result.error === "VENDOR_SKILL_CONFLICT") {
        const payload = Buffer.from(
          JSON.stringify(result.conflicts || []),
          "utf8"
        ).toString("base64url");
        redirect(`/chains/new?blocked=1&conflicts=${payload}`);
      }
      if (result.error === "PACK_NOT_SHIP_READY") {
        redirect(
          `/chains/${params.id}?failed=1&ship=${encodeShipErrorMessage(
            result.message || "Packs not ship-ready"
          )}`
        );
      }
      redirect(`/chains/${params.id}?failed=1`);
    }
    if (result && "ok" in result && result.ok) {
      redirect(`/chains/${params.id}?sent=1`);
    }
    redirect(`/chains/${params.id}?failed=1`);
  }

  async function recoverAction() {
    "use server";
    await recoverStuckChainAction(params.id);
  }

  async function retryAction() {
    "use server";
    await retryGenerateChainAction(params.id);
  }

  const banners = (
    <>
      {searchParams?.ready === "1" ? (
        <ChainBanner variant="success" title="Packs are ready">
          Review scores below, download Word or PDF, then send to the vendor.
        </ChainBanner>
      ) : null}

      {searchParams?.partial === "1" || chain.status === "PARTIAL" ? (
        <ChainBanner variant="warning" title="Partial generation">
          Some candidates failed. Fix masters or use Retry — only ship-ready
          packs can be emailed.
        </ChainBanner>
      ) : null}

      {searchParams?.sent === "1" ? (
        <ChainBanner variant="success" title="Send finished">
          {emailCfg.mode === "resend"
            ? "Mail was handed to Resend. Check each candidate’s email status and the vendor inbox."
            : emailCfg.mode === "dry_run"
              ? "Dry-run mode — no real delivery. Turn off EMAIL_DRY_RUN for live sends."
              : "Simulated mode — no RESEND_API_KEY; nothing hit a real inbox."}
        </ChainBanner>
      ) : null}

      {searchParams?.failed === "1" || chain.status === "FAILED" ? (
        <ChainBanner
          variant="error"
          title={
            emptyFailed
              ? "No resumes generated"
              : shipErrorMsg
                ? "Send blocked — pack quality"
                : "Chain did not finish cleanly"
          }
        >
          {shipErrorMsg ? <p>{shipErrorMsg}</p> : null}
          {uniqueHints.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {uniqueHints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
        </ChainBanner>
      ) : null}

      {stuck ? (
        <ChainBanner variant="warning" title={`Still ${chain.status}`}>
          If this has been stuck for several minutes, use Recover.
        </ChainBanner>
      ) : null}

      {total > 0 && lowAts.length > 0 ? (
        <ChainBanner variant="warning" title="ATS below target">
          {lowAts.length} resume{lowAts.length === 1 ? "" : "s"} under 95 —
          review before sending.
        </ChainBanner>
      ) : null}

      {total > 0 && notShipReady.length > 0 ? (
        <ChainBanner
          variant="error"
          title={
            [
              missingPacks.length
                ? `${missingPacks.length} missing pack${missingPacks.length === 1 ? "" : "s"}`
                : "",
              badPacks.length
                ? `${badPacks.length} quality issue${badPacks.length === 1 ? "" : "s"}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ") + " — use Retry failed"
          }
        >
          <ul className="mt-1 list-disc pl-4">
            {notShipReady.slice(0, 6).map((r) => (
              <li key={r.id}>
                {r.name}: {r.ship.issues.map((i) => i.detail).join("; ")}
              </li>
            ))}
          </ul>
        </ChainBanner>
      ) : null}
    </>
  );

  return (
    <ChainDetailShell
      chain={chain}
      employee={chain.employee}
      backHref="/chains"
      sent={sent}
      total={total}
      goodPacks={goodPacks.length}
      canSend={canSend}
      allEmailed={allEmailed}
      stuck={stuck}
      showRetry={showRetry}
      emailMode={emailCfg.mode}
      emailFromFallback={emailCfg.from}
      sendAction={sendAction}
      recoverAction={recoverAction}
      retryAction={retryAction}
      banners={banners}
    >
      <ChainPacksTable
        chainId={chain.id}
        rawJobText={chain.rawJobText}
        candidates={chain.candidates}
        shipById={new Map(shipReports.map((r) => [r.id, r.ship]))}
      />
    </ChainDetailShell>
  );
}
