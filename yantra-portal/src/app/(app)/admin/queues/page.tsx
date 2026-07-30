import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { recoverStaleChains, STALE_CHAIN_MS } from "@/lib/chain-pipeline";
import {
  recoverAllStaleChainsAction,
  recoverStuckChainAction,
} from "@/app/actions/chains";

export default async function QueuesPage() {
  await requireAdmin();

  // Auto-recover abandoned work every time admin opens queues
  const auto = await recoverStaleChains();

  const generating = await prisma.chain.count({ where: { status: "GENERATING" } });
  const sending = await prisma.chain.count({ where: { status: "SENDING" } });
  const ready = await prisma.chain.count({ where: { status: "READY" } });
  const failed = await prisma.chain.count({ where: { status: "FAILED" } });
  const recent = await prisma.chain.findMany({
    where: { status: { in: ["GENERATING", "SENDING", "READY", "FAILED"] } },
    include: { employee: true, candidates: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  const staleMinutes = Math.round(STALE_CHAIN_MS / 60_000);

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Queues"
        description={`In-process generation and send. Abandoned GENERATING/SENDING older than ~${staleMinutes} minutes auto-fail so new chains are never blocked.`}
        actions={
          <form
            action={async () => {
              "use server";
              await recoverAllStaleChainsAction();
            }}
          >
            <Button type="submit" variant="outline">
              Recover stuck (30s+)
            </Button>
          </form>
        }
      />

      {auto.recovered.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Auto-recovered {auto.recovered.length} abandoned chain(s) on this page load:{" "}
          {auto.recovered.map((id) => id.slice(0, 8)).join(", ")}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-sm text-slate-500">Generating</div>
          <div className="mt-1 text-2xl font-semibold">{generating}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Sending</div>
          <div className="mt-1 text-2xl font-semibold">{sending}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Ready (awaiting send)</div>
          <div className="mt-1 text-2xl font-semibold">{ready}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Failed</div>
          <div className="mt-1 text-2xl font-semibold">{failed}</div>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium">Chain</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Candidates</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((c) => {
              const stuck = c.status === "GENERATING" || c.status === "SENDING";
              const ageMs = Date.now() - new Date(c.updatedAt).getTime();
              const ageMin = Math.round(ageMs / 60_000);
              return (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/chains/${c.id}`}
                      className="font-mono text-xs text-sky-800 underline-offset-2 hover:underline"
                    >
                      {c.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{c.employee.name}</td>
                  <td className="px-4 py-3">{c.vendorName}</td>
                  <td className="px-4 py-3">
                    <Badge status={c.status}>{c.status}</Badge>
                    {stuck ? (
                      <div className="mt-1 text-[11px] text-amber-700">
                        last update {ageMin}m ago
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{c.candidates.length}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(c.updatedAt)}</td>
                  <td className="px-4 py-3">
                    {stuck ? (
                      <form
                        action={async () => {
                          "use server";
                          await recoverStuckChainAction(c.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="text-sm font-medium text-red-700 underline underline-offset-2"
                        >
                          Mark failed
                        </button>
                      </form>
                    ) : (
                      <Link
                        href={`/admin/chains/${c.id}`}
                        className="text-sm text-slate-600 underline underline-offset-2"
                      >
                        Open
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {recent.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Queue empty.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
