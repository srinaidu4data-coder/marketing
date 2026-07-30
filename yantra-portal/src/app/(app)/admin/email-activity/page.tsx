import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getResendConfig } from "@/lib/email/resend";

export default async function EmailActivityPage() {
  await requireAdmin();
  const cfg = getResendConfig();

  const logs = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "chain.email_enqueued",
          "chain.email_sent",
          "chain.email_failed",
          "chain.send_requested",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const rows = logs.map((l) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(l.meta || "{}") as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    return { ...l, meta };
  });

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Email activity"
        description="Resend delivery log — verify To / From / mode for every chain send."
        actions={
          <Link href="/admin/settings" className="text-sm text-sky-700 underline underline-offset-2">
            Email settings →
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs uppercase text-slate-500">Provider mode</div>
          <div className="mt-1 text-lg font-semibold capitalize">{cfg.mode.replace("_", " ")}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">RESEND_API_KEY</div>
          <div className="mt-1 text-lg font-semibold">
            {cfg.apiKeyPresent ? "Set" : "Missing"}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">From</div>
          <div className="mt-1 break-all text-sm font-medium">{cfg.from}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Reply-To default</div>
          <div className="mt-1 break-all text-sm font-medium">
            {cfg.replyToDefault || "Employee email per send"}
          </div>
        </Card>
      </div>

      {!cfg.apiKeyPresent ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>No RESEND_API_KEY</strong> in environment. Sends are{" "}
          <em>simulated</em> (audit only) — vendors will not receive real mail. Copy the key from
          Yantra&apos;s Vercel project env (or Resend dashboard) into local{" "}
          <code className="rounded bg-white px-1">.env</code> and restart.
        </div>
      ) : cfg.dryRun ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <strong>EMAIL_DRY_RUN</strong> is on — Resend API is not called; useful for testing To/From
          wiring without hitting vendors.
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Live Resend mode — chain sends call Resend with attachments when files exist.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">Subject / error</th>
              <th className="px-3 py-2 font-medium">Mode</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 text-xs text-slate-600">
                  {formatDateTime(r.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    status={
                      r.action.includes("failed")
                        ? "FAILED"
                        : r.action.includes("sent")
                          ? "SENT"
                          : "READY"
                    }
                  >
                    {r.action.replace("chain.", "")}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {String(r.meta.to || "—")}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {String(r.meta.from || "—")}
                </td>
                <td className="max-w-xs px-3 py-2 text-xs text-slate-700">
                  {String(r.meta.subject || r.meta.error || r.meta.resendId || "—")}
                </td>
                <td className="px-3 py-2 text-xs">
                  {String(r.meta.emailMode || "—")}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  No email events yet. Send a chain to populate this log.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
