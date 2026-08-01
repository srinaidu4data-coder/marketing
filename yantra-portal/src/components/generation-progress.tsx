"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RESUME_BUILD_STEPS,
  type StepStatus,
} from "@/lib/resume/generation-progress";

export type UiStep = {
  id: string;
  label: string;
  status: StepStatus;
};

export function defaultSteps(): UiStep[] {
  return RESUME_BUILD_STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    status: "pending" as StepStatus,
  }));
}

export function GenerationProgressPanel({
  candidateName,
  candidateIndex,
  candidateTotal,
  steps,
  overallMessage,
}: {
  candidateName?: string;
  candidateIndex?: number;
  candidateTotal?: number;
  steps: UiStep[];
  overallMessage?: string;
}) {
  const done = steps.filter((s) => s.status === "done").length;
  const total = steps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-soft sm:p-6"
      role="status"
      aria-live="polite"
      aria-busy={done < total}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="rf-kicker text-[#0071e3]">Generating resume</p>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
            {candidateName
              ? `${candidateName}${
                  candidateTotal && candidateTotal > 1
                    ? ` (${(candidateIndex ?? 0) + 1}/${candidateTotal})`
                    : ""
                }`
              : "AI pipeline"}
          </h3>
          {overallMessage ? (
            <p className="mt-1 text-[12.5px] text-[#86868b]">{overallMessage}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-[#0071e3]/10 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-[#0071e3]">
          {pct}%
        </span>
      </div>

      <div className="mt-4 h-1 overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className="h-full rounded-full bg-[#0071e3] transition-all duration-500 ease-apple"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-4 max-h-[320px] space-y-1 overflow-y-auto">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors",
              step.status === "active" && "bg-[#0071e3]/[0.06]",
              step.status === "done" && "opacity-80",
              step.status === "error" && "bg-red-500/[0.06]"
            )}
          >
            {step.status === "done" ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
            ) : step.status === "active" ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#0071e3]" strokeWidth={2} />
            ) : step.status === "error" ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15 text-red-600">
                <X className="h-3 w-3" strokeWidth={2.5} />
              </span>
            ) : (
              <Circle className="h-5 w-5 text-[#d2d2d7]" strokeWidth={1.5} />
            )}
            <span
              className={cn(
                "tracking-tight",
                step.status === "active" && "font-semibold text-[#1d1d1f]",
                step.status === "done" && "text-[#6e6e73]",
                step.status === "pending" && "text-[#86868b]",
                step.status === "error" && "font-medium text-red-700"
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
