import Link from "next/link";
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
import { getLayout } from "@/lib/resume/templates";
import {
  decodeShipErrorMessage,
  encodeShipErrorMessage,
  shipReportsForChain,
} from "@/lib/chain-ship-ui";

export default async function AdminChainDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { failed?: string; sent?: string; ship?: string };
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
  const notShipReady = shipReports.filter((r) => !r.ship.ok);
  const stuck = chain.status === "GENERATING" || chain.status === "SENDING";
  const emptyFailed = chain.status === "FAILED" && chain.candidates.length === 0;
  const canSend =
    chain.candidates.length > 0 &&
    notShipReady.length === 0 &&
    (chain.status === "READY" ||
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
            {chain.status === "FAILED" || emptyFailed ? (
              <form action={retryAction}>
                <Button type="submit" variant="outline">
                  Retry generation
                </Button>
              </form>
            ) : null}
            {canSend && !stuck ? (
              <form action={sendAction}>
                <Button type="submit" disabled={chain.candidates.length === 0}>
                  Send all
                </Button>
              </form>
            ) : null}
          </>
        }
      />

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

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium">Candidate</th>
              <th className="px-4 py-3 font-medium">Layout</th>
              <th className="px-4 py-3 font-medium">ATS</th>
              <th className="px-4 py-3 font-medium">Ship-ready</th>
              <th className="px-4 py-3 font-medium">Send Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {chain.candidates.map((cc) => {
              const ship = shipReports.find((r) => r.id === cc.id)?.ship;
              return (
                <tr key={cc.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{cc.candidate.name}</div>
                    <div className="text-xs text-slate-500">{cc.candidate.email}</div>
                    {cc.jobTitle ? (
                      <div className="text-[11px] text-slate-400">{cc.jobTitle}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs">{getLayout(cc.layoutId).name}</td>
                  <td className="px-4 py-3 font-semibold">
                    <span
                      className={
                        cc.atsScore >= 95 ? "text-emerald-700" : "text-amber-700"
                      }
                    >
                      {cc.atsScore}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ship?.ok ? (
                      <span className="font-semibold text-emerald-700">
                        OK
                        {ship.minBulletsSeen != null
                          ? ` · ≥${ship.minBulletsSeen} bullets`
                          : ""}
                      </span>
                    ) : (
                      <span
                        className="font-semibold text-red-700"
                        title={ship?.issues.map((i) => i.detail).join("; ")}
                      >
                        Blocked
                        {ship?.issues[0]
                          ? ` · ${ship.issues[0].detail.slice(0, 48)}`
                          : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={cc.sendStatus}>{cc.sendStatus}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      <details>
                        <summary className="cursor-pointer hover:underline">
                          Preview
                        </summary>
                        <pre className="mt-2 max-h-64 max-w-xl overflow-auto rounded border bg-slate-50 p-3 text-xs">
                          {cc.tailoredResumeText.slice(0, 4000)}
                        </pre>
                      </details>
                      <Link
                        href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=txt`}
                        className="hover:underline"
                      >
                        TXT
                      </Link>
                      <Link
                        href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=docx`}
                        className="hover:underline"
                      >
                        DOCX
                      </Link>
                      {cc.pdfPath ? (
                        <Link
                          href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=pdf`}
                          className="hover:underline"
                        >
                          PDF
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {chain.candidates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No resume packs yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
