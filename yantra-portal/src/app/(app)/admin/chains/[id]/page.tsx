import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  recoverStuckChainAction,
  retryGenerateChainAction,
  sendChain,
} from "@/app/actions/chains";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import {
  decodeShipErrorMessage,
  encodeShipErrorMessage,
  shipReportsForChain,
} from "@/lib/chain-ship-ui";
import { ChainPacksTable } from "@/components/chain-packs-table";

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

  const shipErrorMsg = decodeShipErrorMessage(searchParams?.ship);

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

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title={
          <>
            Chain <span className="text-slate-400">{chain.id.slice(0, 8)}</span>
          </>
        }
        description={`${chain.employee.name} · ${formatDateTime(chain.createdAt)} · ${sent} of ${chain.candidates.length} sent`}
        actions={
          <>
            <Badge status={chain.status}>
              {chain.status.charAt(0) + chain.status.slice(1).toLowerCase()}
            </Badge>
            {stuck ? (
              <form action={recoverAction}>
                <Button type="submit" variant="destructive">
                  Recover stuck
                </Button>
              </form>
            ) : null}
            {!stuck &&
            (emptyFailed ||
              chain.status === "FAILED" ||
              chain.status === "PARTIAL" ||
              missingPacks.length > 0 ||
              badPacks.length > 0) ? (
              <form action={retryAction}>
                <Button type="submit" variant="outline">
                  Retry failed packs
                </Button>
              </form>
            ) : null}
            {canSend ? (
              <form action={sendAction}>
                <Button type="submit">
                  Send ready packs
                  {goodPacks.length ? ` (${goodPacks.length})` : ""}
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      {searchParams?.ready === "1" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Packs generated. Review ship-ready → download → Send.
        </div>
      ) : null}

      {searchParams?.partial === "1" || chain.status === "PARTIAL" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Partial generation — some candidates failed. Fix masters or Retry;
          Send stays blocked until every pack is ship-ready.
        </div>
      ) : null}

      {searchParams?.sent === "1" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Send finished. Check per-candidate send status below.
        </div>
      ) : null}

      {searchParams?.failed === "1" || chain.status === "FAILED" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {emptyFailed
            ? "Generation produced 0 packs (timeout or error). Use Retry generation — prefer 1–2 candidates on serverless."
            : shipErrorMsg ||
              "Chain failed, was recovered, or send was blocked. See ship-ready column."}
        </div>
      ) : null}

      {stuck ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          In-flight status <strong>{chain.status}</strong>. If abandoned, recover to free the
          queue; live jobs heartbeated recently will not auto-fail for ~3 minutes.
        </div>
      ) : null}

      {notShipReady.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-medium">
            {notShipReady.length} pack(s) not ship-ready — Send blocked until regenerate.
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {notShipReady.slice(0, 8).map((r) => (
              <li key={r.id}>
                {r.name}: {r.ship.issues.map((i) => i.detail).join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card className="space-y-2 text-sm">
        <div>
          <span className="text-slate-500">Employee: </span>
          {chain.employee.name} ({chain.employee.email})
        </div>
        <div>
          <span className="text-slate-500">Vendor: </span>
          {chain.vendorName} ({chain.vendorEmail})
        </div>
        <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">
          {chain.rawJobText}
        </pre>
      </Card>

      <ChainPacksTable
        chainId={chain.id}
        rawJobText={chain.rawJobText}
        candidates={chain.candidates}
        shipById={new Map(shipReports.map((r) => [r.id, r.ship]))}
      />
    </div>
  );
}
