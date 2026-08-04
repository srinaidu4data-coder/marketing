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
}: {
  resumeText: string;
  jd: string;
  jobTitle?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const report = useMemo(
    () =>
      buildFitReport({
        resumeText: resumeText || "",
        jd: jd || "",
        jobTitle,
      }),
    [resumeText, jd, jobTitle]
  );

  if (!resumeText || resumeText.length < 80) return null;

  return (
    <div className="border-t border-black/[0.04] bg-[#f8fafc]/90">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left sm:px-6"
      >
        <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#1d1d1f]">
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
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[#86868b] transition",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-black/[0.04] px-5 py-4 sm:px-6">
          <div className="grid gap-2 sm:grid-cols-3">
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
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              <ListChecks className="h-3.5 w-3.5" />
              JD → proof checklist
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-black/[0.06] bg-white p-2 text-[12px]">
              {report.requirements.slice(0, 28).map((r) => (
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
            Research lab (local): primacy, peak–end, n-grams, anti-prototype,
            impersonal 10-line summary, calibrated confidence.
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
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#86868b]">
        {label}
      </p>
      <p className="text-[15px] font-semibold tabular-nums text-[#1d1d1f]">
        {value}
      </p>
      <p className="text-[11px] text-[#86868b]">{sub}</p>
    </div>
  );
}
