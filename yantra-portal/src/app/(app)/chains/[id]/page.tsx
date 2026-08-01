import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  recoverStuckChainAction,
  retryGenerateChainAction,
  sendChain,
} from "@/app/actions/chains";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getResendConfig } from "@/lib/email/resend";
import { Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  decodeShipErrorMessage,
  encodeShipErrorMessage,
  shipReportsForChain,
} from "@/lib/chain-ship-ui";
import { ChainPacksTable } from "@/components/chain-packs-table";

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
  // Bad packs (have text but fail quality) block send; missing packs are PARTIAL noise
  const badPacks = shipReports.filter((r) => !r.missingPack && !r.ship.ok);
  const missingPacks = shipReports.filter((r) => r.missingPack);
  const goodPacks = shipReports.filter((r) => !r.missingPack && r.ship.ok);
  const notShipReady = shipReports.filter((r) => !r.ship.ok);
  const stuck = chain.status === "GENERATING" || chain.status === "SENDING";
  const emptyFailed = chain.status === "FAILED" && total === 0;
  // Send when at least one good pack and zero bad packs (missing = partial, use Retry)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chain"
        description={`${formatDateTime(chain.createdAt)} · ${sent}/${total} emailed · ${chain.id.slice(0, 8)}`}
        actions={
          <>
            <Badge status={chain.status}>{chain.status}</Badge>
            {stuck ? (
              <form action={recoverAction}>
                <Button type="submit" variant="destructive">
                  Recover
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
                <Button type="submit" variant="soft">
                  <Mail className="h-4 w-4" />
                  Send to vendor
                  {goodPacks.length ? ` (${goodPacks.length})` : ""}
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      {/* Email transport status */}
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              emailCfg.mode === "resend"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            <Mail className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">Email delivery</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Mode: <strong className="text-zinc-800">{emailCfg.mode}</strong>
              {" · "}
              From: <span className="font-mono text-[11px]">{emailCfg.from}</span>
            </p>
            {emailCfg.mode === "simulated" ? (
              <p className="mt-1 text-xs text-amber-800">
                No <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code> on
                the server — sends are logged only, not delivered. Add the key in Vercel
                → Environment Variables.
              </p>
            ) : emailCfg.mode === "dry_run" ? (
              <p className="mt-1 text-xs text-amber-800">
                <code className="rounded bg-amber-100 px-1">EMAIL_DRY_RUN=true</code> —
                no real delivery.
              </p>
            ) : (
              <p className="mt-1 text-xs text-emerald-700">
                Live Resend — emails go to the vendor inbox (domain must be verified).
              </p>
            )}
          </div>
        </div>
        <div className="text-xs text-zinc-500">
          To: <strong className="text-zinc-800">{chain.vendorEmail}</strong>
        </div>
      </Card>

      {searchParams?.ready === "1" ? (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Packs generated</p>
            <p className="mt-0.5 text-xs text-emerald-800/80">
              Review ship-ready below, download DOCX, then Send to vendor.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams?.partial === "1" || chain.status === "PARTIAL" ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Partial generation</p>
          <p className="mt-0.5 text-xs">
            Some candidates failed (missing master, density, or AI). Fix masters
            or Retry generation. Send only includes ship-ready packs if all rows
            pass — regenerate failed ones first.
          </p>
        </div>
      ) : null}

      {searchParams?.sent === "1" ? (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Send finished</p>
            <p className="mt-0.5 text-xs text-emerald-800/80">
              Check send status per candidate below. If mode is{" "}
              <strong>simulated</strong>, nothing hit a real inbox.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams?.failed === "1" || chain.status === "FAILED" ? (
        <div className="space-y-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {emptyFailed
              ? "No resumes generated."
              : shipErrorMsg
                ? "Send blocked — pack quality"
                : "Chain did not finish cleanly."}
          </p>
          {shipErrorMsg ? (
            <p className="text-xs text-red-900">{shipErrorMsg}</p>
          ) : null}
          {uniqueHints.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-red-900">
              {uniqueHints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {stuck ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Still <strong>{chain.status}</strong>. Use <strong>Recover</strong> if frozen.
        </div>
      ) : null}

      {total > 0 && lowAts.length > 0 ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {lowAts.length} resume(s) below ATS 95 — review before sending.
        </div>
      ) : null}

      {total > 0 && notShipReady.length > 0 ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">
            {missingPacks.length > 0
              ? `${missingPacks.length} missing pack(s)`
              : ""}
            {missingPacks.length > 0 && badPacks.length > 0 ? " · " : ""}
            {badPacks.length > 0
              ? `${badPacks.length} pack(s) fail quality`
              : ""}
            {" — use Retry failed packs."}
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
          <span className="text-zinc-500">Vendor </span>
          <span className="font-medium text-zinc-900">{chain.vendorName}</span>
          <span className="text-zinc-500"> · {chain.vendorEmail}</span>
        </div>
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Job requirement
          </span>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-xs text-zinc-700">
            {chain.rawJobText}
          </pre>
        </div>
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
