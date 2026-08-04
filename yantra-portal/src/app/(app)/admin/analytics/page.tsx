import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader, StatCard, SectionLabel } from "@/components/ui";
import { AUDIT_ACTIONS } from "@/lib/audit";
import {
  type AnalyticsRange,
  rangeStart,
  rangeLabel,
  computeDepthAnalytics,
  buildEmployeeLeaderboard,
  type PackRow,
} from "@/lib/admin-analytics";

function qs(base: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v != null && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function BarRow({
  label,
  count,
  pct: percent,
  maxPct = 100,
  tone = "sky",
}: {
  label: string;
  count: number;
  pct: number;
  maxPct?: number;
  tone?: "sky" | "emerald" | "amber" | "violet" | "slate";
}) {
  const colors: Record<string, string> = {
    sky: "bg-sky-500/80",
    emerald: "bg-emerald-500/80",
    amber: "bg-amber-500/80",
    violet: "bg-violet-500/80",
    slate: "bg-slate-400/80",
  };
  const width = maxPct > 0 ? Math.min(100, (percent / maxPct) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
      <div className="min-w-0 truncate text-[#1d1d1f]" title={label}>
        {label}
      </div>
      <div className="tabular-nums text-[#6e6e73]">
        {count}
        <span className="ml-1 text-xs text-[#86868b]">({percent}%)</span>
      </div>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-black/[0.05]">
        <div
          className={`h-full rounded-full transition-all ${colors[tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function FunnelStep({
  step,
  count,
  rate,
  isLast,
}: {
  step: string;
  count: number;
  rate: number;
  isLast?: boolean;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center text-center">
      <div className="w-full rounded-2xl border border-black/[0.06] bg-white px-3 py-4 shadow-soft">
        <div className="text-[1.5rem] font-semibold tabular-nums tracking-tight text-[#1d1d1f]">
          {count}
        </div>
        <div className="mt-1 text-[12px] font-medium leading-snug text-[#6e6e73]">{step}</div>
        <div className="mt-1 text-[11px] text-[#86868b]">{rate}% of prior</div>
      </div>
      {!isLast ? (
        <div className="hidden text-[#c7c7cc] sm:absolute sm:-right-2 sm:top-1/2 sm:-translate-y-1/2 sm:block">
          →
        </div>
      ) : null}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { range?: string; includeTest?: string; hideDeleted?: string };
}) {
  await requireAdmin();
  const rawRange = searchParams.range || "7d";
  const range: AnalyticsRange =
    rawRange === "today" || rawRange === "month" || rawRange === "30d" || rawRange === "7d"
      ? rawRange
      : "7d";
  const includeTest = searchParams.includeTest === "1";
  const hideDeleted = searchParams.hideDeleted !== "0";
  const start = rangeStart(range);
  const label = rangeLabel(range);

  const linkBase = {
    range,
    includeTest: includeTest ? "1" : undefined,
    hideDeleted: hideDeleted ? undefined : "0",
  };

  const [
    chains,
    usage,
    employees,
    rosterRaw,
    vendorSubs,
    auditDistinct,
    auditPeriod,
    packCounts,
  ] = await Promise.all([
    prisma.chain.findMany({
      where: { createdAt: { gte: start } },
      select: {
        id: true,
        employeeId: true,
        vendorName: true,
        status: true,
        createdAt: true,
        candidates: {
          select: {
            id: true,
            candidateId: true,
            atsScore: true,
            psychScore: true,
            atsReady: true,
            tailorMode: true,
            layoutId: true,
            jobTitle: true,
            skillFingerprint: true,
            sendStatus: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.apiUsageLog.findMany({
      where: {
        createdAt: { gte: start },
        ...(includeTest ? {} : { isTestMode: false }),
      },
      select: {
        employeeId: true,
        operation: true,
        tokensIn: true,
        tokensOut: true,
        costUsd: true,
        isTestMode: true,
        createdAt: true,
      },
    }),
    prisma.user.findMany({
      where: {
        role: "EMPLOYEE",
        ...(hideDeleted ? { deletedAt: null } : {}),
      },
      select: { id: true, name: true, email: true },
    }),
    prisma.candidate.findMany({
      select: {
        id: true,
        name: true,
        masterResumeText: true,
        masterProfileJson: true,
        layoutId: true,
        createdAt: true,
        _count: { select: { chainCandidates: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.vendorSubmission.findMany({
      where: { sentAt: { gte: start } },
      select: { vendorEmail: true, vendorName: true },
    }),
    prisma.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: start } },
      select: { action: true },
    }),
    // lifetime pack counts already via roster _count
    Promise.resolve(null),
  ]);
  void packCounts;

  const packs: PackRow[] = chains.flatMap((ch) =>
    ch.candidates.map((cc) => ({
      id: cc.id,
      candidateId: cc.candidateId,
      chainId: ch.id,
      atsScore: cc.atsScore,
      psychScore: cc.psychScore,
      atsReady: cc.atsReady,
      tailorMode: cc.tailorMode,
      layoutId: cc.layoutId,
      jobTitle: cc.jobTitle,
      skillFingerprint: cc.skillFingerprint,
      sendStatus: cc.sendStatus,
      createdAt: cc.createdAt,
      employeeId: ch.employeeId,
      vendorName: ch.vendorName,
      chainStatus: ch.status,
    }))
  );

  const chainsByEmployee = new Map<string, number>();
  for (const ch of chains) {
    chainsByEmployee.set(ch.employeeId, (chainsByEmployee.get(ch.employeeId) || 0) + 1);
  }

  const actionCounts = new Map<string, number>();
  for (const a of auditPeriod) {
    actionCounts.set(a.action, (actionCounts.get(a.action) || 0) + 1);
  }

  const depth = computeDepthAnalytics({
    packs,
    usage,
    roster: rosterRaw.map((c) => ({
      id: c.id,
      name: c.name,
      masterResumeText: c.masterResumeText,
      masterProfileJson: c.masterProfileJson,
      layoutId: c.layoutId,
      createdAt: c.createdAt,
      chainPackCount: c._count.chainCandidates,
    })),
    chainStatuses: chains.map((c) => c.status),
    vendorSubmissionsInRange: vendorSubs.length,
    uniqueVendorsSubmitted: new Set(
      vendorSubs.map((v) => v.vendorEmail.toLowerCase().trim())
    ).size,
    auditActionsSeen: auditDistinct.map((a) => a.action),
    auditCatalogSize: AUDIT_ACTIONS.length,
    recoveries:
      (actionCounts.get("chain.stale_recovered") || 0) +
      (actionCounts.get("chain.manual_recover") || 0),
    emailFailed: actionCounts.get("chain.email_failed") || 0,
    emailSentAudit: actionCounts.get("chain.email_sent") || 0,
    candidateCreates: actionCounts.get("candidate.create") || 0,
    masterReplaces: Array.from(actionCounts.entries())
      .filter(([k]) => k === "candidate.update")
      .reduce((s, [, n]) => s + n, 0),
  });

  const leaderboard = buildEmployeeLeaderboard(employees, packs, usage, chainsByEmployee);
  const covered = new Set(auditDistinct.map((a) => a.action));
  const employeesActive = new Set(chains.map((c) => c.employeeId)).size;
  const maxDaily = Math.max(1, ...depth.daily.map((d) => d.generated));

  const effortTone =
    depth.effortIndex >= 75
      ? "text-emerald-700"
      : depth.effortIndex >= 50
        ? "text-sky-700"
        : depth.effortIndex >= 30
          ? "text-amber-700"
          : "text-red-700";

  return (
    <div className="space-y-8 p-2 lg:p-4">
      <PageHeader
        title="Analytics"
        description={
          <>
            Depth of marketing + resume-engine effort for <strong>{label}</strong>
            {" — "}volume, dual-score quality (ATS Fit-IR + Psych), conversion funnel,
            mode hardness, and unit economics.
          </>
        }
      />

      {/* Range + toggles */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(
          [
            { k: "today", label: "Today" },
            { k: "7d", label: "7 days" },
            { k: "30d", label: "30 days" },
            { k: "month", label: "This month" },
          ] as const
        ).map((r) => (
          <a
            key={r.k}
            href={`/admin/analytics${qs({ ...linkBase, range: r.k })}`}
            className={`rounded-full border px-3 py-1.5 transition ${
              range === r.k
                ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                : "border-black/[0.08] bg-white text-[#6e6e73] hover:bg-black/[0.03]"
            }`}
          >
            {r.label}
          </a>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-black/10 sm:inline-block" />
        <a
          href={`/admin/analytics${qs({
            ...linkBase,
            includeTest: includeTest ? undefined : "1",
          })}`}
          className="text-[13px] text-[#6e6e73] underline-offset-2 hover:underline"
        >
          {includeTest ? "Exclude test-mode AI" : "Include test-mode AI"}
        </a>
        <a
          href={`/admin/analytics${qs({
            ...linkBase,
            hideDeleted: hideDeleted ? "0" : undefined,
          })}`}
          className="text-[13px] text-[#6e6e73] underline-offset-2 hover:underline"
        >
          {hideDeleted ? "Show deleted employees" : "Hide deleted employees"}
        </a>
      </div>

      {/* Effort index hero */}
      <Card className="!p-6 bg-gradient-to-br from-white to-slate-50/80">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl space-y-2">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
              Effort depth index
            </div>
            <div className={`text-[3.25rem] font-semibold leading-none tracking-[-0.04em] ${effortTone}`}>
              {depth.effortIndex}
              <span className="ml-1 text-lg font-medium text-[#86868b]">/ 100</span>
            </div>
            <p className="text-[14px] leading-relaxed text-[#6e6e73]">
              Weighted blend of ship yield, dual-score BEST rate, send conversion, pipeline
              reliability, transfer-mode workload (harder JD gaps), and roster readiness.
              Higher means the org is producing client-submittable, honest, JD-aligned packs
              — not just raw volume.
            </p>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:max-w-xl">
            {depth.effortDrivers.map((d) => (
              <div
                key={d.label}
                className="rounded-xl border border-black/[0.05] bg-white/80 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-[#1d1d1f]">{d.label}</span>
                  <span className="tabular-nums text-[13px] font-semibold text-[#1d1d1f]">
                    {d.value}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-[#86868b]">
                  weight {d.weight} · {d.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Volume KPIs */}
      <section>
        <SectionLabel>Volume</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <StatCard label="Chains" value={chains.length} hint="New this period" />
          <StatCard
            label="Packs generated"
            value={depth.volume.generated}
            hint={`${depth.volume.packs} attempted · ${depth.volume.failed} failed`}
          />
          <StatCard
            label="Ship-ready"
            value={depth.volume.ship}
            hint={`${depth.quality.shipRate}% of generated · ATS ≥ ${depth.constants.SHIP_MIN_ATS}`}
          />
          <StatCard
            label="BEST dual-100"
            value={depth.volume.best}
            hint={`${depth.quality.bestRate}% · ATS+Psych perfect`}
          />
          <StatCard
            label="Emails sent"
            value={depth.volume.sent}
            hint={`${depth.quality.sendOfShipRate}% of ship-ready`}
          />
          <StatCard
            label="Employees active"
            value={employeesActive}
            hint={`${depth.volume.uniqueCandidates} candidates · ${depth.volume.uniqueVendors} vendors`}
          />
        </div>
      </section>

      {/* Dual-score quality */}
      <section>
        <SectionLabel>Quality depth — dual scores</SectionLabel>
        <p className="mb-3 max-w-3xl text-[13.5px] leading-relaxed text-[#6e6e73]">
          <strong>ATS</strong> = Fit-IR (keywords, role, temporal, progressive).{" "}
          <strong>Psych</strong> = credibility (no cosplay, no free metrics, employer fidelity).{" "}
          <strong>SHIP</strong> ⇔ structural OK ∧ ATS ≥ {depth.constants.SHIP_MIN_ATS}.{" "}
          <strong>BEST</strong> ⇔ ATS {depth.constants.BEST_ATS} ∧ Psych {depth.constants.BEST_PSYCH}.
          This is the research engine&apos;s real product of effort — not pack count alone.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Avg / median ATS"
            value={`${depth.quality.avgAts} / ${depth.quality.medianAts}`}
          />
          <StatCard
            label="Avg / median Psych"
            value={`${depth.quality.avgPsych} / ${depth.quality.medianPsych}`}
          />
          <StatCard
            label="Ship yield"
            value={`${depth.quality.shipRate}%`}
            hint={`${depth.volume.ship} of ${depth.volume.generated} generated`}
          />
          <StatCard
            label="BEST yield"
            value={`${depth.quality.bestRate}%`}
            hint={`${depth.volume.best} dual-perfect packs`}
          />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-[14px] font-semibold text-[#1d1d1f]">ATS distribution</h3>
            <div className="mt-3 space-y-3">
              {depth.quality.atsBuckets.map((b) => (
                <BarRow
                  key={`ats-${b.label}`}
                  label={b.label}
                  count={b.count}
                  pct={b.pct}
                  tone={
                    b.label === "100"
                      ? "emerald"
                      : b.label.startsWith("95")
                        ? "sky"
                        : b.label.startsWith("0")
                          ? "slate"
                          : "amber"
                  }
                />
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="text-[14px] font-semibold text-[#1d1d1f]">Psych distribution</h3>
            <div className="mt-3 space-y-3">
              {depth.quality.psychBuckets.map((b) => (
                <BarRow
                  key={`psy-${b.label}`}
                  label={b.label}
                  count={b.count}
                  pct={b.pct}
                  tone={
                    b.label === "100"
                      ? "emerald"
                      : b.label.startsWith("95")
                        ? "violet"
                        : b.label.startsWith("0")
                          ? "slate"
                          : "amber"
                  }
                />
              ))}
            </div>
          </Card>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: "BEST",
              value: depth.quality.qualityMatrix.best,
              hint: "Dual 100",
            },
            {
              label: "Ship, not BEST",
              value: depth.quality.qualityMatrix.shipNotBest,
              hint: "Client-submittable floor",
            },
            {
              label: "Mid (70–94)",
              value: depth.quality.qualityMatrix.mid,
              hint: "Needs refine / rework",
            },
            {
              label: "Low (<70)",
              value: depth.quality.qualityMatrix.low,
              hint: "Honesty cap or weak match",
            },
            {
              label: "Empty / failed",
              value: depth.quality.qualityMatrix.zeroOrFail,
              hint: "No usable pack text",
            },
          ].map((k) => (
            <Card key={k.label} className="!p-4">
              <div className="text-[12px] text-[#86868b]">{k.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
              <div className="mt-0.5 text-[11px] text-[#86868b]">{k.hint}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Funnel */}
      <section>
        <SectionLabel>Conversion funnel</SectionLabel>
        <p className="mb-3 max-w-3xl text-[13.5px] text-[#6e6e73]">
          Where effort leaks: generation failures, quality below ship floor, or ship-ready
          packs that never get emailed to a vendor.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {depth.funnel.map((f, i) => (
            <FunnelStep
              key={f.step}
              step={f.step}
              count={f.count}
              rate={f.rate}
              isLast={i === depth.funnel.length - 1}
            />
          ))}
        </div>
      </section>

      {/* Mode hardness + layouts */}
      <section>
        <SectionLabel>Engine mix — mode hardness & layouts</SectionLabel>
        <p className="mb-3 max-w-3xl text-[13.5px] text-[#6e6e73]">
          <strong>same_domain</strong> = master already close to JD.{" "}
          <strong>transfer</strong> = larger skill/domain gap — more progressive rewrite work,
          higher research-engine load. Layout mix shows structure variety (non-isomorphic
          spines).
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <h3 className="text-[14px] font-semibold">Tailor mode</h3>
            <div className="mt-2 flex gap-4 text-sm">
              <div>
                <div className="text-2xl font-semibold tabular-nums text-sky-700">
                  {depth.modes.sameDomainShare}%
                </div>
                <div className="text-[12px] text-[#86868b]">
                  same_domain ({depth.modes.sameDomainCount})
                </div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums text-violet-700">
                  {depth.modes.transferShare}%
                </div>
                <div className="text-[12px] text-[#86868b]">
                  transfer ({depth.modes.transferCount})
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {depth.modes.rows.map((r) => (
                <BarRow
                  key={r.key}
                  label={r.key}
                  count={r.count}
                  pct={r.pct}
                  tone={/transfer/i.test(r.key) ? "violet" : "sky"}
                />
              ))}
              {depth.modes.rows.length === 0 ? (
                <p className="text-sm text-[#86868b]">No generated packs in range.</p>
              ) : null}
            </div>
          </Card>
          <Card>
            <h3 className="text-[14px] font-semibold">Layouts used</h3>
            <div className="mt-4 space-y-3">
              {depth.layouts.map((r) => (
                <BarRow key={r.key} label={r.key} count={r.count} pct={r.pct} tone="emerald" />
              ))}
              {depth.layouts.length === 0 ? (
                <p className="text-sm text-[#86868b]">No layout data yet.</p>
              ) : null}
            </div>
          </Card>
          <Card>
            <h3 className="text-[14px] font-semibold">Top job titles targeted</h3>
            <div className="mt-4 space-y-3">
              {depth.topTitles.map((r) => (
                <BarRow key={r.key} label={r.key} count={r.count} pct={r.pct} tone="amber" />
              ))}
              {depth.topTitles.length === 0 ? (
                <p className="text-sm text-[#86868b]">No titles stored on packs yet.</p>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] text-[#86868b]">
              {depth.volume.uniqueJobTitles} unique titles · schema-match diversity
            </p>
          </Card>
        </div>
      </section>

      {/* Economics */}
      <section>
        <SectionLabel>Unit economics — AI effort</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total AI cost"
            value={`$${depth.economics.totalCost.toFixed(4)}`}
            hint={includeTest ? "Includes test-mode" : "Excludes test-mode"}
          />
          <StatCard
            label="Cost / generated pack"
            value={`$${depth.economics.costPerGenerated.toFixed(4)}`}
          />
          <StatCard
            label="Cost / ship-ready"
            value={`$${depth.economics.costPerShip.toFixed(4)}`}
            hint="True unit cost of submittable work"
          />
          <StatCard
            label="Cost / email sent"
            value={`$${depth.economics.costPerSent.toFixed(4)}`}
            hint="Yield-adjusted spend"
          />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-[14px] font-semibold">Token burn</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[12px] text-[#86868b]">Tokens in</div>
                <div className="text-xl font-semibold tabular-nums">
                  {depth.economics.totalTokensIn.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-[#86868b]">Tokens out</div>
                <div className="text-xl font-semibold tabular-nums">
                  {depth.economics.totalTokensOut.toLocaleString()}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[12px] text-[#86868b]">
              Multi-pass refine + AI summary work shows up here — depth of engine effort
              beyond a single completion.
            </p>
          </Card>
          <Card>
            <h3 className="text-[14px] font-semibold">Operations</h3>
            <div className="mt-3 space-y-3">
              {depth.economics.ops.map((r) => (
                <BarRow key={r.key} label={r.key} count={r.count} pct={r.pct} tone="slate" />
              ))}
              {depth.economics.ops.length === 0 ? (
                <p className="text-sm text-[#86868b]">No API usage logged in this period.</p>
              ) : null}
            </div>
          </Card>
        </div>
      </section>

      {/* Daily activity */}
      <section>
        <SectionLabel>Daily activity</SectionLabel>
        <Card>
          {depth.daily.length === 0 ? (
            <p className="text-sm text-[#86868b]">No pack activity in this range.</p>
          ) : (
            <div className="space-y-2">
              {depth.daily.map((d) => (
                <div key={d.date} className="flex items-center gap-3 text-sm">
                  <div className="w-24 shrink-0 tabular-nums text-[#6e6e73]">{d.date.slice(5)}</div>
                  <div className="flex h-7 min-w-0 flex-1 items-center gap-1">
                    <div
                      className="h-full rounded-md bg-sky-500/70"
                      style={{
                        width: `${Math.max(4, (d.generated / maxDaily) * 100)}%`,
                      }}
                      title={`${d.generated} generated`}
                    />
                    {d.sent > 0 ? (
                      <div
                        className="h-full rounded-md bg-emerald-500/80"
                        style={{
                          width: `${Math.max(3, (d.sent / maxDaily) * 60)}%`,
                        }}
                        title={`${d.sent} sent`}
                      />
                    ) : null}
                  </div>
                  <div className="w-40 shrink-0 text-right text-[12px] tabular-nums text-[#6e6e73]">
                    {d.generated} gen · {d.ship} ship · {d.sent} sent
                  </div>
                  <div className="w-16 shrink-0 text-right text-[12px] tabular-nums text-[#86868b]">
                    ${d.cost.toFixed(2)}
                  </div>
                </div>
              ))}
              <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-[#86868b]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 rounded-sm bg-sky-500/70" /> Generated
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500/80" /> Sent
                </span>
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Roster + reliability */}
      <section>
        <SectionLabel>Capacity & reliability</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-[14px] font-semibold">Roster readiness (all-time masters)</h3>
            <p className="mt-1 text-[12.5px] text-[#6e6e73]">
              Effort starts before the chain: masters with parsed engagements are the ground
              truth the progressive / AI engine needs.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-[11px] text-[#86868b]">Roster</div>
                <div className="text-xl font-semibold tabular-nums">{depth.roster.total}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#86868b]">Master text</div>
                <div className="text-xl font-semibold tabular-nums">
                  {depth.roster.withMasterText}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#86868b]">Parsed profile</div>
                <div className="text-xl font-semibold tabular-nums">
                  {depth.roster.withParsedProfile}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#86868b]">Never packed</div>
                <div className="text-xl font-semibold tabular-nums">{depth.roster.idle}</div>
              </div>
            </div>
            <div className="mt-3 text-sm text-[#6e6e73]">
              Ready rate{" "}
              <strong className="text-[#1d1d1f]">{depth.roster.readyRate}%</strong>
            </div>
            {depth.roster.heavy.length > 0 ? (
              <div className="mt-4">
                <div className="text-[12px] font-medium text-[#86868b]">Most-packed candidates</div>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {depth.roster.heavy.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <a
                        href={`/admin/candidates/${c.id}`}
                        className="truncate font-medium text-[#0071e3] hover:underline"
                      >
                        {c.name}
                      </a>
                      <span className="shrink-0 tabular-nums text-[#6e6e73]">
                        {c.packs} packs · {c.layout}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
          <Card>
            <h3 className="text-[14px] font-semibold">Pipeline reliability signals</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                {
                  label: "Fail rate",
                  value: `${depth.quality.failRate}%`,
                  hint: "Empty / FAILED packs",
                },
                {
                  label: "Recoveries",
                  value: depth.opsSignals.recoveries,
                  hint: "Stale + manual recover",
                },
                {
                  label: "Email sent (audit)",
                  value: depth.opsSignals.emailSentAudit,
                  hint: "chain.email_sent events",
                },
                {
                  label: "Email failed",
                  value: depth.opsSignals.emailFailed,
                  hint: "chain.email_failed events",
                },
                {
                  label: "Vendor submissions",
                  value: depth.volume.vendorSubmissions,
                  hint: `${depth.volume.uniqueVendorsSubmitted} unique vendors`,
                },
                {
                  label: "New candidates",
                  value: depth.opsSignals.candidateCreates,
                  hint: "Creates this period",
                },
              ].map((k) => (
                <div
                  key={k.label}
                  className="rounded-xl border border-black/[0.05] bg-black/[0.015] px-3 py-2.5"
                >
                  <div className="text-[11px] text-[#86868b]">{k.label}</div>
                  <div className="text-lg font-semibold tabular-nums text-[#1d1d1f]">
                    {k.value}
                  </div>
                  <div className="text-[11px] text-[#86868b]">{k.hint}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="text-[12px] font-medium text-[#86868b]">Chain status mix</div>
              <div className="mt-2 space-y-2">
                {depth.chainStatusMix.map((r) => (
                  <BarRow
                    key={r.key}
                    label={r.key}
                    count={r.count}
                    pct={r.pct}
                    tone={
                      r.key === "READY" || r.key === "SENT"
                        ? "emerald"
                        : r.key === "FAILED"
                          ? "amber"
                          : "slate"
                    }
                  />
                ))}
                {depth.chainStatusMix.length === 0 ? (
                  <p className="text-sm text-[#86868b]">No chains in range.</p>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="space-y-3">
        <SectionLabel>Employee leaderboard — depth, not vanity volume</SectionLabel>
        <p className="text-[13.5px] text-[#6e6e73]">
          Ranked by ship-ready packs, then sends and BEST dual-100. Avg ATS/Psych and cost
          per ship show craft quality and efficiency.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white shadow-soft">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-black/[0.06] bg-black/[0.02]">
              <tr className="text-[12px] text-[#6e6e73]">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-3 py-3 font-medium">Chains</th>
                <th className="px-3 py-3 font-medium">Gen</th>
                <th className="px-3 py-3 font-medium">Ship</th>
                <th className="px-3 py-3 font-medium">BEST</th>
                <th className="px-3 py-3 font-medium">Sent</th>
                <th className="px-3 py-3 font-medium">Ship %</th>
                <th className="px-3 py-3 font-medium">Avg ATS</th>
                <th className="px-3 py-3 font-medium">Avg Psych</th>
                <th className="px-3 py-3 font-medium">Transfer</th>
                <th className="px-3 py-3 font-medium">AI cost</th>
                <th className="px-4 py-3 font-medium">$/ship</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => (
                <tr key={row.id} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#1d1d1f]">{row.name}</div>
                    <div className="text-[11px] text-[#86868b]">{row.email}</div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{row.chains}</td>
                  <td className="px-3 py-3 tabular-nums">{row.generated}</td>
                  <td className="px-3 py-3 tabular-nums font-medium">{row.ship}</td>
                  <td className="px-3 py-3 tabular-nums text-emerald-700">{row.best}</td>
                  <td className="px-3 py-3 tabular-nums">{row.sent}</td>
                  <td className="px-3 py-3 tabular-nums">{row.shipRate}%</td>
                  <td className="px-3 py-3 tabular-nums">{row.avgAts || "—"}</td>
                  <td className="px-3 py-3 tabular-nums">{row.avgPsych || "—"}</td>
                  <td className="px-3 py-3 tabular-nums text-violet-700">{row.transferPacks}</td>
                  <td className="px-3 py-3 tabular-nums">${row.cost.toFixed(3)}</td>
                  <td className="px-4 py-3 tabular-nums">${row.costPerShip.toFixed(3)}</td>
                </tr>
              ))}
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-[#86868b]">
                    No employees to rank
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit coverage */}
      <section className="space-y-3">
        <SectionLabel>Audit catalog coverage</SectionLabel>
        <Card>
          <p className="text-sm text-[#6e6e73]">
            <strong className="text-[#1d1d1f]">
              {depth.opsSignals.auditCoverage} / {depth.opsSignals.auditCatalogSize}
            </strong>{" "}
            required actions observed historically (
            {depth.opsSignals.auditCoveragePct}% of catalog present in data). Every required
            write action is registered in the AUDIT_ACTIONS catalog.
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-[#0071e3] hover:underline">
              Required actions catalog ({AUDIT_ACTIONS.length})
            </summary>
            <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {AUDIT_ACTIONS.map((a) => (
                <li
                  key={a}
                  className={covered.has(a) ? "text-emerald-700" : "text-[#86868b]"}
                >
                  {covered.has(a) ? "✓ " : "○ "}
                  {a}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      </section>

      <p className="pb-6 text-[12px] leading-relaxed text-[#86868b]">
        Metrics derive from Chain / ChainCandidate dual scores, ApiUsageLog, VendorSubmission,
        Candidate masters, and AuditLog — no separate warehouse. Effort index encodes the
        research product thesis: shippable honest packs under real JD gaps beat raw chain
        volume.
      </p>
    </div>
  );
}
