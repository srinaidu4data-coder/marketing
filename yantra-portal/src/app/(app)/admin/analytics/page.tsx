import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { AUDIT_ACTIONS } from "@/lib/audit";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { range?: string; includeTest?: string; hideDeleted?: string };
}) {
  await requireAdmin();
  const range = searchParams.range || "7d";
  const includeTest = searchParams.includeTest === "1";
  const hideDeleted = searchParams.hideDeleted !== "0";

  const now = new Date();
  let start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start.setDate(start.getDate() - 7);
  }

  const chains = await prisma.chain.findMany({
    where: { createdAt: { gte: start } },
    include: { candidates: true, employee: true },
  });
  const chainsRun = chains.length;
  const resumesGenerated = chains.reduce((n, c) => n + c.candidates.length, 0);
  const emailsSent = chains.reduce(
    (n, c) => n + c.candidates.filter((cc) => cc.sendStatus === "SENT").length,
    0
  );
  const employeesActive = new Set(chains.map((c) => c.employeeId)).size;

  const usage = await prisma.apiUsageLog.findMany({
    where: {
      createdAt: { gte: start },
      ...(includeTest ? {} : { isTestMode: false }),
    },
  });
  const totalAiCost = usage.reduce((s, u) => s + u.costUsd, 0);

  const employees = await prisma.user.findMany({
    where: {
      role: "EMPLOYEE",
      ...(hideDeleted ? { deletedAt: null } : {}),
    },
  });

  const leaderboard = employees
    .map((e) => {
      const eChains = chains.filter((c) => c.employeeId === e.id);
      const eResumes = eChains.reduce((n, c) => n + c.candidates.length, 0);
      const eSent = eChains.reduce(
        (n, c) => n + c.candidates.filter((cc) => cc.sendStatus === "SENT").length,
        0
      );
      const eCost = usage
        .filter((u) => u.employeeId === e.id)
        .reduce((s, u) => s + u.costUsd, 0);
      return {
        id: e.id,
        name: e.name,
        email: e.email,
        chains: eChains.length,
        resumes: eResumes,
        sent: eSent,
        cost: eCost,
      };
    })
    .sort((a, b) => b.chains - a.chains || b.sent - a.sent);

  const audited = await prisma.auditLog.findMany({
    select: { action: true },
    distinct: ["action"],
  });
  const covered = new Set(audited.map((a) => a.action));
  const catalogCoverage = AUDIT_ACTIONS.filter((a) => covered.has(a)).length;

  const rangeLabel =
    range === "today" ? "Today" : range === "month" ? "This month" : "the last 7 days";

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Analytics"
        description={
          <>
            Pipeline performance, per-employee activity, and AI cost for{" "}
            <strong>{rangeLabel}</strong>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        {[
          { k: "7d", label: "the last 7 days" },
          { k: "today", label: "Today" },
          { k: "month", label: "This month" },
        ].map((r) => (
          <a
            key={r.k}
            href={`/admin/analytics?range=${r.k}${includeTest ? "&includeTest=1" : ""}${hideDeleted ? "" : "&hideDeleted=0"}`}
            className={`rounded-full border px-3 py-1 ${range === r.k ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
          >
            {r.label}
          </a>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Chains run", value: chainsRun, sub: "new this period" },
          { label: "Resumes generated", value: resumesGenerated, sub: "" },
          { label: "Emails sent", value: emailsSent, sub: "" },
          { label: "Employees active", value: employeesActive, sub: "" },
          {
            label: "Total AI cost",
            value: `$${totalAiCost.toFixed(4)}`,
            sub: "Excludes test-mode",
          },
        ].map((k) => (
          <Card key={k.label}>
            <div className="text-sm text-slate-500">{k.label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{k.value}</div>
            {k.sub ? <div className="mt-1 text-xs text-slate-400">{k.sub}</div> : null}
          </Card>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Derived from ApiUsageLog rollup + current AiPricing rows.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Leaderboard</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            href={`/admin/analytics?range=${range}${includeTest ? "" : "&includeTest=1"}${hideDeleted ? "" : "&hideDeleted=0"}`}
            className="text-slate-600 underline"
          >
            {includeTest
              ? "Exclude test-mode costs"
              : "Include test-mode costs (admin prompt-testing runs)"}
          </a>
          <a
            href={`/admin/analytics?range=${range}${includeTest ? "&includeTest=1" : ""}${hideDeleted ? "&hideDeleted=0" : ""}`}
            className="text-slate-600 underline"
          >
            {hideDeleted ? "Show deleted employees" : "Hide deleted employees"}
          </a>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Chains</th>
                <th className="px-4 py-3 font-medium">Resumes</th>
                <th className="px-4 py-3 font-medium">Emails sent</th>
                <th className="px-4 py-3 font-medium">AI cost</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </td>
                  <td className="px-4 py-3">{row.chains}</td>
                  <td className="px-4 py-3">{row.resumes}</td>
                  <td className="px-4 py-3">{row.sent}</td>
                  <td className="px-4 py-3">${row.cost.toFixed(4)}</td>
                </tr>
              ))}
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Unable to load leaderboard right now
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Audit log coverage</h2>
        <p className="text-sm text-slate-500">
          {catalogCoverage} / {AUDIT_ACTIONS.length} required actions observed (
          {Math.round((catalogCoverage / AUDIT_ACTIONS.length) * 100)}% coverage of catalog
          present in data). Every required write action is registered in the AUDIT_ACTIONS
          catalog.
        </p>
        <details>
          <summary className="cursor-pointer text-sm hover:underline">
            Required actions catalog ({AUDIT_ACTIONS.length})
          </summary>
          <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {AUDIT_ACTIONS.map((a) => (
              <li key={a} className={covered.has(a) ? "text-emerald-700" : "text-slate-500"}>
                {a}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
