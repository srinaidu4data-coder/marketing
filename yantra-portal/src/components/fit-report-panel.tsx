"use client";

/**
 * Fit dashboard — coverage checklist + confidence (localhost research lab UI).
 */

import { useMemo, useState } from "react";
import { buildFitReport, type FitReport } from "@/lib/resume/fit-report";
import { cn } from "@/lib/utils";
import { ChevronDown, ListChecks, Target } from "lucide-react";

export function FitReportPanel({
  resumeText,
  jd,
  jobTitle,
  layoutId,
}: {
  resumeText: string;
  jd: string;
  jobTitle?: string | null;
  layoutId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Default so layout check always runs (packs without layoutId still get ats_classic)
  const resolvedLayoutId = (layoutId || "").trim() || "ats_classic";
  const report = useMemo(
    () =>
      buildFitReport({
        resumeText: resumeText || "",
        jd: jd || "",
        jobTitle,
        layoutId: resolvedLayoutId,
      }),
    [resumeText, jd, jobTitle, resolvedLayoutId]
  );

  if (!resumeText || resumeText.length < 80) return null;

  const layoutReqs = report.requirements.filter((r) => r.kind === "layout");
  const otherReqs = report.requirements.filter((r) => r.kind !== "layout");

  return (
    <div className="border-t border-black/[0.04] bg-[#f8fafc]/90">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left sm:px-6"
      >
        <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-[#1d1d1f]">
          <Target className="h-3.5 w-3.5 text-[#0071e3]" strokeWidth={2.25} />
          Fit dashboard
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              confClass(report)
            )}
          >
            {report.confidence}% · {report.confidenceLabel}
          </span>
          <span className="text-[11px] font-medium text-[#86868b]">
            coverage {report.coveragePct}%
          </span>
          {report.layoutApplied ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                report.layoutApplied.applied
                  ? "bg-emerald-500/15 text-emerald-800"
                  : "bg-amber-500/15 text-amber-900"
              )}
            >
              Layout {report.layoutApplied.applied ? "applied" : "mismatch"}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#86868b] transition",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-black/[0.04] px-5 py-4 sm:px-6">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Coverage"
              value={`${report.presentCount}/${report.totalCount}`}
              sub={`${report.coveragePct}% of checklist`}
            />
            <Metric
              label="Confidence"
              value={`${report.confidence}`}
              sub={report.confidenceLabel}
            />
            <Metric
              label="Scan load"
              value={`${report.scanLoad.summaryLines} lines`}
              sub={report.scanLoad.note}
            />
            <Metric
              label="Layout"
              value={
                report.layoutApplied
                  ? report.layoutApplied.applied
                    ? "Applied"
                    : "Mismatch"
                  : "n/a"
              }
              sub={
                report.layoutApplied
                  ? `${report.layoutApplied.layoutName} · ${report.layoutApplied.matchedCount}/${report.layoutApplied.expectedCount} sections`
                  : "No layoutId on pack"
              }
              tone={
                report.layoutApplied
                  ? report.layoutApplied.applied
                    ? "good"
                    : "bad"
                  : "neutral"
              }
            />
          </div>

          {/* Pinned layout structure block — always visible above JD scroll list */}
          {report.layoutApplied ? (
            <div
              className={cn(
                "rounded-xl border px-3 py-2.5 text-[12.5px]",
                report.layoutApplied.applied
                  ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
                  : "border-amber-200 bg-amber-50/80 text-amber-950"
              )}
            >
              <p className="font-semibold">
                {report.layoutApplied.applied ? "✓ " : "○ "}
                Layout structure applied: {report.layoutApplied.layoutName}
              </p>
              <p className="mt-0.5 leading-relaxed opacity-90">
                {report.layoutApplied.note}
              </p>
              {!report.layoutApplied.applied &&
              report.layoutApplied.missingHeadings.length ? (
                <p className="mt-1 text-[11px] opacity-80">
                  Missing headings:{" "}
                  {report.layoutApplied.missingHeadings.slice(0, 5).join(", ")}
                </p>
              ) : null}
              {report.layoutApplied.foundHeadings.length ? (
                <p className="mt-1 text-[11px] opacity-75">
                  Found:{" "}
                  {report.layoutApplied.foundHeadings.slice(0, 6).join(" → ")}
                </p>
              ) : null}
              {layoutReqs.length ? (
                <ul className="mt-2 space-y-1 border-t border-black/5 pt-2">
                  {layoutReqs.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start gap-2 text-[12px]"
                    >
                      <span
                        className={
                          r.present ? "text-emerald-600" : "text-amber-600"
                        }
                      >
                        {r.present ? "✓" : "○"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{r.label}</span>
                        {r.proof ? (
                          <span className="mt-0.5 block text-[11px] opacity-80">
                            {r.proof}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase opacity-50">
                        layout
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              <ListChecks className="h-3.5 w-3.5" />
              JD → proof checklist
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-black/[0.06] bg-white p-2 text-[12px]">
              {otherReqs.slice(0, 28).map((r) => (
                <li
                  key={r.id}
                  className="flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-[#f5f5f7]"
                >
                  <span
                    className={
                      r.present ? "text-emerald-600" : "text-amber-600"
                    }
                  >
                    {r.present ? "✓" : "○"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-[#1d1d1f]">{r.label}</span>
                    {r.proof ? (
                      <span className="mt-0.5 block truncate text-[11px] text-[#86868b]">
                        {r.proof}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase text-[#c7c7cc]">
                    {r.kind}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {report.missing.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                Gaps to beef up
              </p>
              <p className="text-[12px] leading-relaxed text-[#6e6e73]">
                {report.missing.slice(0, 10).join(" · ")}
              </p>
            </div>
          ) : (
            <p className="text-[12px] font-medium text-emerald-700">
              Checklist looks dense — good for ATS + skim.
            </p>
          )}

          <p className="text-[10px] leading-relaxed text-[#a1a1a6]">
            Fit checks: layout structure applied, primacy, peak–end, n-grams,
            anti-prototype, impersonal 10-line summary, calibrated confidence.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function confClass(r: FitReport) {
  if (r.confidenceLabel === "excellent")
    return "bg-emerald-500/15 text-emerald-800";
  if (r.confidenceLabel === "high") return "bg-sky-500/15 text-sky-900";
  if (r.confidenceLabel === "medium") return "bg-amber-500/15 text-amber-900";
  return "bg-red-500/10 text-red-800";
}

function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50/50"
          : tone === "bad"
            ? "border-amber-200 bg-amber-50/50"
            : "border-black/[0.06] bg-white"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#86868b]">
        {label}
      </p>
      <p
        className={cn(
          "text-[15px] font-semibold tabular-nums",
          tone === "good"
            ? "text-emerald-800"
            : tone === "bad"
              ? "text-amber-900"
              : "text-[#1d1d1f]"
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-[#86868b]">{sub}</p>
    </div>
  );
}
