import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { getSystemConfig } from "@/lib/system-settings";
import { formatDateTime } from "@/lib/utils";

type Tile = {
  href: string;
  title: string;
  description: string;
  stat?: string;
  badge?: string;
};

export default async function AdminHomePage() {
  const admin = await requireAdmin();
  const config = await getSystemConfig();

  const [
    employeeCount,
    adminCount,
    candidateCount,
    allocationCount,
    chainCount,
    activePrompt,
    recentAudit,
    usageToday,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "EMPLOYEE", deletedAt: null } }),
    prisma.user.count({ where: { role: "ADMIN", deletedAt: null } }),
    prisma.candidate.count(),
    prisma.allocation.count(),
    prisma.chain.count(),
    prisma.promptVersion.findFirst({ where: { status: "ACTIVE" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.apiUsageLog.findMany({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  ]);

  const todayCost = usageToday.reduce((s, u) => s + u.costUsd, 0);
  const cap = config.dailyAiCostCapUsd;
  const capPct = cap > 0 ? Math.min(100, Math.round((todayCost / cap) * 100)) : 0;

  const people: Tile[] = [
    {
      href: "/admin/employees",
      title: "Employee profiles",
      description: "Create staff logins, roles, passwords, activate/deactivate accounts.",
      stat: `${employeeCount} employees · ${adminCount} admins`,
      badge: "People",
    },
    {
      href: "/admin/candidates",
      title: "Candidates",
      description: "Master resumes, layout structure, and export format per candidate.",
      stat: `${candidateCount} on roster`,
      badge: "People",
    },
    {
      href: "/admin/allocations",
      title: "Allocations",
      description: "Assign candidates to employee marketing pools (instant save grid).",
      stat: `${allocationCount} links`,
      badge: "People",
    },
  ];

  const content: Tile[] = [
    {
      href: "/admin/prompt",
      title: "Prompt template",
      description: "Active progressive-tailor prompt, test mode, promote / rollback.",
      stat: activePrompt ? `Active · ${activePrompt.id.slice(0, 8)}` : "No active prompt",
      badge: "Content",
    },
    {
      href: "/admin/email-template",
      title: "Email template",
      description: "Vendor email subject and body versions.",
      badge: "Content",
    },
    {
      href: "/admin/email-activity",
      title: "Email activity",
      description: "Resend log — To / From / mode for each chain send.",
      badge: "Content",
    },
  ];

  const operations: Tile[] = [
    {
      href: "/admin/chains",
      title: "Chains",
      description: "System-wide marketing chain activity across all employees.",
      stat: `${chainCount} total`,
      badge: "Ops",
    },
    {
      href: "/admin/queues",
      title: "Queues",
      description: "Background generation and email send queue status.",
      badge: "Ops",
    },
    {
      href: "/admin/analytics",
      title: "Analytics",
      description: "Pipeline KPIs, employee leaderboard, AI cost, audit coverage.",
      stat: `Today $${todayCost.toFixed(3)} / $${cap} cap`,
      badge: "Ops",
    },
  ];

  const system: Tile[] = [
    {
      href: "/admin/settings",
      title: "System settings",
      description: "Company branding, default layout/export, daily AI cost cap, policies.",
      stat: config.companyName,
      badge: "System",
    },
  ];

  function Section({ title, tiles }: { title: string; tiles: Tile[] }) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-lg border p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium group-hover:text-slate-900">{t.title}</h3>
                {t.badge ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {t.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-500">{t.description}</p>
              {t.stat ? (
                <p className="mt-3 text-xs font-medium text-slate-700">{t.stat}</p>
              ) : null}
            </Link>
          ))}
        </nav>
      </section>
    );
  }

  return (
    <div className="space-y-8 p-2 lg:p-4">
      <PageHeader
        title={<>Admin console — {admin.name}</>}
        description={`${config.companyName} · manage people, candidates, templates, and system policy.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs uppercase text-slate-500">Active employees</div>
          <div className="mt-1 text-2xl font-semibold">{employeeCount}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Candidates</div>
          <div className="mt-1 text-2xl font-semibold">{candidateCount}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Chains</div>
          <div className="mt-1 text-2xl font-semibold">{chainCount}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">AI cost today</div>
          <div className="mt-1 text-2xl font-semibold">${todayCost.toFixed(2)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${capPct >= 90 ? "bg-red-500" : capPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${capPct}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {capPct}% of ${cap} daily cap
          </p>
        </Card>
      </div>

      <Section title="People & access" tiles={people} />
      <Section title="Resume & templates" tiles={content} />
      <Section title="Operations" tiles={operations} />
      <Section title="System" tiles={system} />

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recent audit activity</h2>
          <Link href="/admin/analytics" className="text-sm text-sky-700 underline underline-offset-2">
            Analytics →
          </Link>
        </div>
        {recentAudit.length === 0 ? (
          <p className="text-sm text-slate-500">No audit events yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {recentAudit.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-xs text-slate-500">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        Signed in as {admin.email} · defaults: layout{" "}
        <Badge status="READY">{config.defaultLayoutId}</Badge> · export{" "}
        <Badge status="READY">{config.defaultExportFormat}</Badge>
      </p>
    </div>
  );
}
