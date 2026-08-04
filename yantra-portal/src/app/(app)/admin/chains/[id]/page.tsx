import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
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

export default async function AdminChainDetailPage({
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
  await requireAdmin();
  const chain = await prisma.chain.findUnique({
    where: { id: params.id },
    include: {
      candidates: { include: { candidate: true } },
      employee: true,
    },
  });
  if (!chain) notFound();

  const emailCfg = getResendConfig();
  const sent = chain.candidates.filter((c) => c.sendStatus === "SENT").length;
  const shipReports = shipReportsForChain(chain.candidates);
  const badPacks = shipReports.filter((r) => !r.missingPack && !r.ship.ok);
  const missingPacks = shipReports.filter((r) => r.missingPack);
  const goodPacks = shipReports.filter((r) => !r.missingPack && r.ship.ok);
  const notShipReady = shipReports.filter((r) => !r.ship.ok);
  const stuck = chain.status === "GENERATING" || chain.status === "SENDING";
  const emptyFailed = chain.status === "FAILED" && chain.candidates.length === 0;
  const canSend =
    goodPacks.length > 0 &&
    badPacks.length === 0 &&
    !stuck &&
    (chain.status === "READY" ||
      chain.status === "PARTIAL" ||
      chain.status === "FAILED" ||
      chain.status === "SENT");
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
          `/admin/chains/${params.id}?failed=1&ship=${encodeShipErrorMessage(
            result.message || "Packs not ship-ready"
          )}`
        );
      }
      redirect(`/admin/chains/${params.id}?failed=1`);
    }
    if (result && "ok" in result && result.ok) {
      redirect(`/admin/chains/${params.id}?sent=1`);
    }
    redirect(`/admin/chains/${params.id}?failed=1`);
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
          Review ship-ready → download → send.
        </ChainBanner>
      ) : null}
      {searchParams?.partial === "1" || chain.status === "PARTIAL" ? (
        <ChainBanner variant="warning" title="Partial generation">
          Some candidates failed. Fix masters or Retry; send stays blocked until
          packs are ship-ready.
        </ChainBanner>
      ) : null}
      {searchParams?.sent === "1" ? (
        <ChainBanner variant="success" title="Send finished">
          Check per-candidate email status below.
        </ChainBanner>
      ) : null}
      {searchParams?.failed === "1" || chain.status === "FAILED" ? (
        <ChainBanner
          variant="error"
          title={
            emptyFailed
              ? "Generation produced 0 packs"
              : shipErrorMsg || "Chain failed or send was blocked"
          }
        >
          {shipErrorMsg && !emptyFailed ? null : emptyFailed ? (
            <p>Use Retry — prefer 1–2 candidates on serverless.</p>
          ) : null}
        </ChainBanner>
      ) : null}
      {stuck ? (
        <ChainBanner variant="warning" title={`In-flight: ${chain.status}`}>
          If abandoned, recover to free the queue. Live jobs heartbeated recently
          will not auto-fail for a few minutes.
        </ChainBanner>
      ) : null}
      {notShipReady.length > 0 ? (
        <ChainBanner
          variant="error"
          title={`${notShipReady.length} pack(s) not ship-ready — send blocked`}
        >
          <ul className="mt-1 list-disc pl-4">
            {notShipReady.slice(0, 8).map((r) => (
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
    <div className="p-2 lg:p-4">
      <ChainDetailShell
        chain={chain}
        employee={chain.employee}
        subtitleExtra={`${chain.employee.name}`}
        backHref="/admin/chains"
        sent={sent}
        total={chain.candidates.length}
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
    </div>
  );
}
