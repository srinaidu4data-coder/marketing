import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, StatCard, SectionLabel } from "@/components/ui";
import { getSystemConfig } from "@/lib/system-settings";
import { formatDateTime } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

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
      description: "Active AI resume prompt, test mode, promote / rollback.",
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
      description:
        "Effort depth: dual ATS/Psych quality, ship funnel, mode hardness, unit economics, leaderboard.",
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
      <section>
        <SectionLabel>{title}</SectionLabel>
        <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rf-surface rf-surface-hover block p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
                  {t.title}
                </h3>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#c7c7cc] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#86868b]" />
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#6e6e73]">
                {t.description}
              </p>
              {t.stat ? (
                <p className="mt-3 text-[12.5px] font-semibold tracking-tight text-[#1d1d1f]">
                  {t.stat}
                </p>
              ) : null}
            </Link>
          ))}
        </nav>
      </section>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Overview"
        description={`${config.companyName} · signed in as ${admin.name}`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Employees" value={employeeCount} />
        <StatCard label="Candidates" value={candidateCount} />
        <StatCard label="Chains" value={chainCount} />
        <StatCard
          label="AI cost today"
          value={`$${todayCost.toFixed(2)}`}
          hint={
            <>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    capPct >= 90
                      ? "bg-[#ff3b30]"
                      : capPct >= 70
                        ? "bg-[#ff9f0a]"
                        : "bg-[#0071e3]"
                  }`}
                  style={{ width: `${capPct}%` }}
                />
              </div>
              <span className="mt-1.5 block">
                {capPct}% of ${cap} daily cap
              </span>
            </>
          }
        />
      </div>

      <Section title="People & access" tiles={people} />
      <Section title="Resume & templates" tiles={content} />
      <Section title="Operations" tiles={operations} />
      <Section title="System" tiles={system} />

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
            Recent activity
          </h2>
          <Link
            href="/admin/analytics"
            className="text-[13px] font-semibold text-[#0071e3] hover:text-[#0077ed]"
          >
            Analytics
          </Link>
        </div>
        {recentAudit.length === 0 ? (
          <p className="text-[14px] text-[#86868b]">No audit events yet.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05] overflow-hidden rounded-xl bg-black/[0.02]">
            {recentAudit.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="font-mono text-[12.5px] font-medium text-[#1d1d1f]">
                  {a.action}
                </span>
                <span className="text-[12px] text-[#86868b]">
                  {formatDateTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[12px] text-[#86868b]">
        {admin.email} · layout{" "}
        <Badge status="READY">{config.defaultLayoutId}</Badge> · export{" "}
        <Badge status="READY">{config.defaultExportFormat}</Badge>
      </p>
    </div>
  );
}
