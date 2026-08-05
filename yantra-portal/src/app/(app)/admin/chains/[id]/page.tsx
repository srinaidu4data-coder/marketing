import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  hideSingleEmployeeChainAction,
  recoverStuckChainAction,
  retryGenerateChainAction,
  sendChain,
  unhideChainFromEmployeeAction,
} from "@/app/actions/chains";
import { getResendConfig } from "@/lib/email/resend";
import {
  encodeShipErrorMessage,
  shipReportsForChain,
} from "@/lib/chain-ship-ui";
import { ChainPacksTable } from "@/components/chain-packs-table";
import {
  ChainBanner,
  ChainDetailShell,
} from "@/components/chain-detail-shell";
import { ChainGeneratingLive } from "@/components/chain-generating-live";
import { Button } from "@/components/ui";

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
        <ChainBanner variant="warning" title="Packs need a refresh">
          <p>
            Use <strong>Retry</strong> — generation finishes via unrestricted AI
            and does not show engine/precheck diagnostics to users.
          </p>
        </ChainBanner>
      ) : null}
      {stuck ? (
        <div className="space-y-3">
          <ChainGeneratingLive
            chainId={chain.id}
            initialStatus={chain.status}
          />
          <ChainBanner variant="warning" title={`In-flight: ${chain.status}`}>
            Live panel shows what the engine is waiting on. Recover only if
            abandoned for several minutes.
          </ChainBanner>
        </div>
      ) : null}
      {notShipReady.length > 0 ? (
        <ChainBanner
          variant="warning"
          title={`${notShipReady.length} pack(s) need review before send`}
        >
          <p className="text-sm">
            Open packs and use Retry if text is thin. Technical bullet/ATS
            diagnostics are not shown to employees.
          </p>
          <ul className="mt-1 list-disc pl-4 text-sm">
            {notShipReady.slice(0, 8).map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
        </ChainBanner>
      ) : null}
    </>
  );

  const employeeViewBanner =
    chain.employee.role === "EMPLOYEE" ? (
      chain.employeeHiddenAt ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>
            <strong>Hidden from employee</strong> — they cannot open this chain.
            Full pack history stays here for admin.
          </p>
          <form
            action={async () => {
              "use server";
              await unhideChainFromEmployeeAction(chain.id);
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Restore to employee
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white px-4 py-3 text-sm text-slate-700 shadow-soft">
          <p>
            Visible in the employee workspace. Cleaning hides it from them only.
          </p>
          <form
            action={async () => {
              "use server";
              await hideSingleEmployeeChainAction(chain.id);
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Hide from employee
            </Button>
          </form>
        </div>
      )
    ) : null;

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
        banners={
          <>
            {employeeViewBanner}
            {banners}
          </>
        }
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
