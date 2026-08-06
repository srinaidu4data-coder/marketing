"use client";

/**
 * Fit dashboard — coverage checklist + confidence + layout structure checks.
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
  const [open, setOpen] = useState(true);
  // Default so layout rows always appear in the checklist
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

  // Single unified checklist — layout rules first (same list as screenshot)
  const checklist = report.requirements.slice(0, 32);

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

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              <ListChecks className="h-3.5 w-3.5" />
              JD → proof checklist
            </p>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-black/[0.06] bg-white p-2 text-[12px]">
              {checklist.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-[#f5f5f7]",
                    r.kind === "layout" && "bg-sky-50/80",
                    r.kind === "quality" && "bg-violet-50/80"
                  )}
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
                  <span
                    className={cn(
                      "shrink-0 text-[10px] uppercase",
                      r.kind === "layout"
                        ? "font-semibold text-sky-600"
                        : r.kind === "quality"
                          ? "font-semibold text-violet-600"
                          : r.kind === "phrase"
                            ? "font-semibold text-amber-700"
                            : r.kind === "keyword"
                              ? "font-semibold text-indigo-600"
                              : "text-[#c7c7cc]"
                    )}
                    title={
                      r.kind === "phrase"
                        ? "JD multi-word phrase — must be woven into stack/env/bullets if missing"
                        : r.kind === "keyword"
                          ? "JD keyword — weave into skills/stack/bullets if missing"
                          : undefined
                    }
                  >
                    {r.kind === "phrase"
                      ? "must weave"
                      : r.kind === "keyword"
                        ? "keyword"
                        : r.kind}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {report.missing.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                Gaps auto-sent to AI if Fit &lt; 80
              </p>
              <p className="text-[12px] leading-relaxed text-[#6e6e73]">
                {report.missing.slice(0, 14).join(" · ")}
              </p>
            </div>
          ) : (
            <p className="text-[12px] font-medium text-emerald-700">
              Checklist looks dense — good for ATS + skim.
            </p>
          )}

          <p className="text-[10px] leading-relaxed text-[#a1a1a6]">
            Layout rows check that the assigned template structure is present in
            the generated pack (first section + heading coverage).
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
