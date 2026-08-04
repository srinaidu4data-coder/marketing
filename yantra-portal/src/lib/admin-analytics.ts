/**
 * Admin analytics aggregation — depth of marketing + resume-engine effort.
 * Pure compute over existing Prisma rows (no new tables).
 *
 * Research framing (what “good ops” looks like for JD-tailored marketing):
 * - Volume alone lies — quality dual scores (ATS Fit-IR + Psych honesty) show craft depth
 * - Conversion funnel (generate → ship-ready → sent) shows real yield
 * - Mode mix (same_domain vs transfer) shows how hard the JD↔master gap is
 * - Cost per shippable pack shows unit economics of the AI engine
 * - Failures / recoveries show pipeline reliability
 * - Roster readiness shows capacity before the chain even starts
 */

import { SHIP_MIN_ATS, BEST_ATS, BEST_PSYCH } from "@/lib/resume/pack-ship-ready";

export type AnalyticsRange = "today" | "7d" | "30d" | "month";

export function rangeStart(range: AnalyticsRange, now = new Date()): Date {
  const start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (range === "30d") {
    start.setDate(start.getDate() - 30);
    return start;
  }
  // 7d default
  start.setDate(start.getDate() - 7);
  return start;
}

export function rangeLabel(range: AnalyticsRange): string {
  if (range === "today") return "Today";
  if (range === "month") return "This month";
  if (range === "30d") return "the last 30 days";
  return "the last 7 days";
}

export type PackRow = {
  id: string;
  candidateId: string;
  chainId: string;
  atsScore: number;
  psychScore: number;
  atsReady: boolean;
  tailorMode: string;
  layoutId: string;
  jobTitle: string;
  skillFingerprint: string;
  sendStatus: string;
  createdAt: Date;
  employeeId: string;
  vendorName: string;
  chainStatus: string;
};

export type UsageRow = {
  employeeId: string | null;
  operation: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  isTestMode: boolean;
  createdAt: Date;
};

export type CandidateRosterRow = {
  id: string;
  name: string;
  masterResumeText: string;
  masterProfileJson: string;
  layoutId: string;
  createdAt: Date;
  chainPackCount: number;
};

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function bucketCount(
  scores: number[],
  edges: [number, number][]
): { label: string; count: number; pct: number }[] {
  return edges.map(([lo, hi]) => {
    const count = scores.filter((s) => s >= lo && s <= hi).length;
    return {
      label: lo === hi ? `${lo}` : `${lo}–${hi}`,
      count,
      pct: pct(count, scores.length),
    };
  });
}

function countBy(keys: string[]): { key: string; count: number; pct: number }[] {
  const map = new Map<string, number>();
  for (const k of keys) {
    const key = k || "(unset)";
    map.set(key, (map.get(key) || 0) + 1);
  }
  const total = keys.length || 1;
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Is this pack a real generated artifact (not empty fail shell)? */
export function isGeneratedPack(p: PackRow): boolean {
  if (p.sendStatus === "FAILED" && p.atsScore === 0 && !p.jobTitle) return false;
  return (
    p.atsScore > 0 ||
    p.psychScore > 0 ||
    !!p.jobTitle ||
    !!p.skillFingerprint ||
    p.atsReady
  );
}

export function isShipReady(p: PackRow): boolean {
  return p.atsReady || p.atsScore >= SHIP_MIN_ATS;
}

export function isBest(p: PackRow): boolean {
  return p.atsScore >= BEST_ATS && p.psychScore >= BEST_PSYCH;
}

export function isSent(p: PackRow): boolean {
  return p.sendStatus === "SENT";
}

export type DepthAnalytics = ReturnType<typeof computeDepthAnalytics>;

export function computeDepthAnalytics(opts: {
  packs: PackRow[];
  usage: UsageRow[];
  roster: CandidateRosterRow[];
  chainStatuses: string[];
  vendorSubmissionsInRange: number;
  uniqueVendorsSubmitted: number;
  auditActionsSeen: string[];
  auditCatalogSize: number;
  recoveries: number;
  emailFailed: number;
  emailSentAudit: number;
  candidateCreates: number;
  masterReplaces: number;
}) {
  const packs = opts.packs;
  const generated = packs.filter(isGeneratedPack);
  const failed = packs.filter((p) => p.sendStatus === "FAILED" || !isGeneratedPack(p));
  const ship = generated.filter(isShipReady);
  const best = generated.filter(isBest);
  const sent = packs.filter(isSent);
  const pending = packs.filter((p) => p.sendStatus === "PENDING");
  const genFailRate = pct(failed.length, packs.length || 1);

  const atsScores = generated.map((p) => p.atsScore);
  const psychScores = generated.map((p) => p.psychScore);

  const totalCost = opts.usage.reduce((s, u) => s + u.costUsd, 0);
  const totalTokensIn = opts.usage.reduce((s, u) => s + u.tokensIn, 0);
  const totalTokensOut = opts.usage.reduce((s, u) => s + u.tokensOut, 0);
  const costPerGenerated = generated.length ? totalCost / generated.length : 0;
  const costPerShip = ship.length ? totalCost / ship.length : 0;
  const costPerSent = sent.length ? totalCost / sent.length : 0;

  const ops = countBy(opts.usage.map((u) => u.operation));

  // Daily series (packs + sends)
  const byDay = new Map<string, { generated: number; ship: number; sent: number; cost: number }>();
  for (const p of packs) {
    const k = dayKey(p.createdAt);
    const row = byDay.get(k) || { generated: 0, ship: 0, sent: 0, cost: 0 };
    if (isGeneratedPack(p)) row.generated += 1;
    if (isShipReady(p)) row.ship += 1;
    if (isSent(p)) row.sent += 1;
    byDay.set(k, row);
  }
  for (const u of opts.usage) {
    const k = dayKey(u.createdAt);
    const row = byDay.get(k) || { generated: 0, ship: 0, sent: 0, cost: 0 };
    row.cost += u.costUsd;
    byDay.set(k, row);
  }
  const daily = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  // Mode / layout / title
  const modes = countBy(generated.map((p) => p.tailorMode || "unknown"));
  const layouts = countBy(generated.map((p) => p.layoutId || "ats_classic"));
  const topTitles = countBy(generated.map((p) => (p.jobTitle || "").trim() || "(untitled)")).slice(
    0,
    12
  );
  const uniqueVendors = new Set(packs.map((p) => p.vendorName.toLowerCase().trim())).size;
  const uniqueCandidates = new Set(packs.map((p) => p.candidateId)).size;
  const uniqueJobTitles = new Set(
    generated.map((p) => (p.jobTitle || "").trim().toLowerCase()).filter(Boolean)
  ).size;

  // Transfer share = hard-path effort (JD↔master gap)
  const transferCount = generated.filter((p) =>
    /transfer/i.test(p.tailorMode || "")
  ).length;
  const sameDomainCount = generated.filter((p) =>
    /same_domain|same-domain|samedomain/i.test(p.tailorMode || "")
  ).length;

  // Dual-score quality matrix
  const qualityMatrix = {
    best: best.length,
    shipNotBest: ship.filter((p) => !isBest(p)).length,
    mid: generated.filter((p) => p.atsScore >= 70 && p.atsScore < SHIP_MIN_ATS).length,
    low: generated.filter((p) => p.atsScore > 0 && p.atsScore < 70).length,
    zeroOrFail: packs.length - generated.length,
  };

  // Funnel
  const funnel = [
    { step: "Packs attempted", count: packs.length, of: packs.length },
    { step: "Generated (non-empty)", count: generated.length, of: packs.length },
    { step: `Ship-ready (ATS ≥ ${SHIP_MIN_ATS})`, count: ship.length, of: generated.length },
    {
      step: `BEST (ATS ${BEST_ATS} + Psych ${BEST_PSYCH})`,
      count: best.length,
      of: generated.length,
    },
    { step: "Emails sent", count: sent.length, of: ship.length || generated.length },
  ].map((f) => ({
    ...f,
    rate: pct(f.count, f.of || 1),
  }));

  // Roster health
  const mastersWithText = opts.roster.filter((c) => (c.masterResumeText || "").trim().length > 200);
  const mastersParsed = opts.roster.filter((c) => {
    try {
      const j = JSON.parse(c.masterProfileJson || "{}") as {
        engagements?: unknown[];
      };
      return Array.isArray(j.engagements) && j.engagements.length > 0;
    } catch {
      return false;
    }
  });
  const idleRoster = opts.roster.filter((c) => c.chainPackCount === 0);
  const heavyRoster = opts.roster
    .filter((c) => c.chainPackCount > 0)
    .sort((a, b) => b.chainPackCount - a.chainPackCount)
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      packs: c.chainPackCount,
      layout: c.layoutId,
      ready: (c.masterResumeText || "").trim().length > 200,
    }));

  // Chain status mix
  const chainStatusMix = countBy(opts.chainStatuses);

  // ATS / Psych distributions
  const atsBuckets = bucketCount(atsScores, [
    [0, 69],
    [70, 84],
    [85, 94],
    [95, 99],
    [100, 100],
  ]);
  const psychBuckets = bucketCount(psychScores, [
    [0, 69],
    [70, 84],
    [85, 94],
    [95, 99],
    [100, 100],
  ]);

  // Effort index: synthetic 0–100 “depth of effort” score for the period
  // Weights quality yield, conversion, reliability, transfer work, dual BEST share.
  const shipYield = generated.length ? ship.length / generated.length : 0;
  const bestYield = generated.length ? best.length / generated.length : 0;
  const sendYield = ship.length ? sent.length / ship.length : sent.length && generated.length ? sent.length / generated.length : 0;
  const reliability = packs.length ? 1 - failed.length / packs.length : 1;
  const transferShare = generated.length ? transferCount / generated.length : 0;
  const rosterReady = opts.roster.length ? mastersParsed.length / opts.roster.length : 0;
  const effortIndex = Math.round(
    100 *
      (0.28 * shipYield +
        0.18 * bestYield +
        0.18 * sendYield +
        0.16 * reliability +
        0.1 * Math.min(1, transferShare * 1.4) + // credit hard transfers
        0.1 * rosterReady)
  );

  const effortDrivers = [
    {
      label: "Ship yield",
      value: `${pct(ship.length, generated.length || 1)}%`,
      weight: "28%",
      note: `Packs meeting ATS ≥ ${SHIP_MIN_ATS}`,
    },
    {
      label: "BEST yield",
      value: `${pct(best.length, generated.length || 1)}%`,
      weight: "18%",
      note: "Dual 100 ATS + Psych",
    },
    {
      label: "Send conversion",
      value: `${pct(sent.length, ship.length || generated.length || 1)}%`,
      weight: "18%",
      note: "Ship-ready → vendor email",
    },
    {
      label: "Pipeline reliability",
      value: `${100 - genFailRate}%`,
      weight: "16%",
      note: "Non-failed pack attempts",
    },
    {
      label: "Transfer workload",
      value: `${pct(transferCount, generated.length || 1)}%`,
      weight: "10%",
      note: "Harder JD↔master gaps (credit for depth)",
    },
    {
      label: "Roster readiness",
      value: `${pct(mastersParsed.length, opts.roster.length || 1)}%`,
      weight: "10%",
      note: "Masters with parsed engagements",
    },
  ];

  return {
    volume: {
      packs: packs.length,
      generated: generated.length,
      failed: failed.length,
      ship: ship.length,
      best: best.length,
      sent: sent.length,
      pending: pending.length,
      uniqueVendors,
      uniqueCandidates,
      uniqueJobTitles,
      vendorSubmissions: opts.vendorSubmissionsInRange,
      uniqueVendorsSubmitted: opts.uniqueVendorsSubmitted,
    },
    quality: {
      avgAts: Math.round(avg(atsScores) * 10) / 10,
      medianAts: Math.round(median(atsScores) * 10) / 10,
      avgPsych: Math.round(avg(psychScores) * 10) / 10,
      medianPsych: Math.round(median(psychScores) * 10) / 10,
      shipRate: pct(ship.length, generated.length || 1),
      bestRate: pct(best.length, generated.length || 1),
      sendOfShipRate: pct(sent.length, ship.length || 1),
      sendOfGeneratedRate: pct(sent.length, generated.length || 1),
      failRate: genFailRate,
      atsBuckets,
      psychBuckets,
      qualityMatrix,
    },
    modes: {
      rows: modes,
      transferCount,
      sameDomainCount,
      transferShare: pct(transferCount, generated.length || 1),
      sameDomainShare: pct(sameDomainCount, generated.length || 1),
    },
    layouts,
    topTitles,
    funnel,
    economics: {
      totalCost,
      totalTokensIn,
      totalTokensOut,
      costPerGenerated,
      costPerShip,
      costPerSent,
      ops,
    },
    daily,
    chainStatusMix,
    roster: {
      total: opts.roster.length,
      withMasterText: mastersWithText.length,
      withParsedProfile: mastersParsed.length,
      idle: idleRoster.length,
      readyRate: pct(mastersParsed.length, opts.roster.length || 1),
      heavy: heavyRoster,
    },
    opsSignals: {
      recoveries: opts.recoveries,
      emailFailed: opts.emailFailed,
      emailSentAudit: opts.emailSentAudit,
      candidateCreates: opts.candidateCreates,
      masterReplaces: opts.masterReplaces,
      auditCoverage: opts.auditActionsSeen.length,
      auditCatalogSize: opts.auditCatalogSize,
      auditCoveragePct: pct(opts.auditActionsSeen.length, opts.auditCatalogSize || 1),
    },
    effortIndex,
    effortDrivers,
    constants: {
      SHIP_MIN_ATS,
      BEST_ATS,
      BEST_PSYCH,
    },
  };
}

export type EmployeeLeaderRow = {
  id: string;
  name: string;
  email: string;
  chains: number;
  packs: number;
  generated: number;
  ship: number;
  best: number;
  sent: number;
  failed: number;
  avgAts: number;
  avgPsych: number;
  cost: number;
  costPerShip: number;
  shipRate: number;
  transferPacks: number;
};

export function buildEmployeeLeaderboard(
  employees: { id: string; name: string; email: string }[],
  packs: PackRow[],
  usage: UsageRow[],
  chainsByEmployee: Map<string, number>
): EmployeeLeaderRow[] {
  return employees
    .map((e) => {
      const ePacks = packs.filter((p) => p.employeeId === e.id);
      const gen = ePacks.filter(isGeneratedPack);
      const ship = gen.filter(isShipReady);
      const best = gen.filter(isBest);
      const sent = ePacks.filter(isSent);
      const failed = ePacks.filter((p) => p.sendStatus === "FAILED" || !isGeneratedPack(p));
      const cost = usage
        .filter((u) => u.employeeId === e.id)
        .reduce((s, u) => s + u.costUsd, 0);
      const ats = gen.map((p) => p.atsScore);
      const psy = gen.map((p) => p.psychScore);
      return {
        id: e.id,
        name: e.name,
        email: e.email,
        chains: chainsByEmployee.get(e.id) || 0,
        packs: ePacks.length,
        generated: gen.length,
        ship: ship.length,
        best: best.length,
        sent: sent.length,
        failed: failed.length,
        avgAts: Math.round(avg(ats) * 10) / 10,
        avgPsych: Math.round(avg(psy) * 10) / 10,
        cost,
        costPerShip: ship.length ? cost / ship.length : 0,
        shipRate: pct(ship.length, gen.length || 1),
        transferPacks: gen.filter((p) => /transfer/i.test(p.tailorMode || "")).length,
      };
    })
    .sort(
      (a, b) =>
        b.ship - a.ship ||
        b.sent - a.sent ||
        b.best - a.best ||
        b.chains - a.chains
    );
}
