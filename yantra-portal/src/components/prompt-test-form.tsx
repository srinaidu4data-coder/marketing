"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Label, Textarea } from "@/components/ui";
import { runPromptTest } from "@/app/actions/templates";
import { cn } from "@/lib/utils";

type TestResult = {
  id: string;
  label: string;
  ranAt: string;
  text: string;
  atsScore: number;
  psychScore: number;
  atsReady: boolean;
  best: boolean;
  mode?: string;
  layoutId: string;
  jobTitle: string;
};

const MAX_RUNS = 8;

function scorePill(score: number, kind: "ATS" | "Psych") {
  const good = score === 100;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        good
          ? "bg-emerald-100 text-emerald-800"
          : score >= 95
            ? "bg-sky-100 text-sky-900"
            : "bg-amber-100 text-amber-900"
      )}
    >
      {kind} {score}
    </span>
  );
}

function ResultPanel({
  result,
  compact,
}: {
  result: TestResult;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4",
        compact && "bg-white"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-[#1d1d1f]">{result.label}</span>
        <span className="text-[11px] text-[#86868b]">{result.ranAt}</span>
        {scorePill(result.atsScore, "ATS")}
        {scorePill(result.psychScore, "Psych")}
        {result.best ? (
          <span className="rounded-full bg-[#0071e3]/15 px-2 py-0.5 text-[11px] font-semibold text-[#0071e3]">
            BEST
          </span>
        ) : result.atsScore >= 95 ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
            SHIP
          </span>
        ) : null}
        {result.mode ? (
          <span className="text-[11px] text-[#6e6e73]">Mode: {result.mode}</span>
        ) : null}
        <span className="text-[11px] text-[#6e6e73]">Title: {result.jobTitle}</span>
        <span className="text-[11px] text-[#6e6e73]">Layout: {result.layoutId}</span>
        <a
          href={`/api/layouts/preview?layoutId=${encodeURIComponent(result.layoutId)}&fmt=html`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-sky-700 underline"
        >
          Layout preview
        </a>
      </div>
      <pre
        className={cn(
          "overflow-auto whitespace-pre-wrap rounded-lg border border-black/[0.06] bg-white p-3 text-xs leading-relaxed text-[#1d1d1f]",
          compact ? "max-h-[22rem]" : "max-h-[28rem]"
        )}
      >
        {result.text}
      </pre>
    </div>
  );
}

export function PromptTestForm({ versionId }: { versionId: string }) {
  const [jd, setJd] = useState(
    "10+ years of functional SAP consulting experience with at least 1-2 end-to-end full life-cycle implementations of SAP ATTP as functional consultant.\nProven experience in leading functional workstreams in large-scale SAP transformation programs.\nDeep understanding of pharmaceutical supply chains, packaging, and aggregation processes.\nStrong knowledge of business process design and system implementation.\nHands-on expertise in GS1 standards (GTIN, GLN, SSCC), EPCIS messaging, and SAP integration architectures (EDI/ALE)."
  );
  const [master, setMaster] = useState(
    "Jane Smith — SAP FICO Consultant with 10 years GL, AP, AR, Asset Accounting experience."
  );
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<TestResult[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [view, setView] = useState<"single" | "compare">("single");
  const [pending, startTransition] = useTransition();

  const active = useMemo(
    () => runs.find((r) => r.id === activeId) || runs[0] || null,
    [runs, activeId]
  );
  const compare = useMemo(
    () => runs.find((r) => r.id === compareId) || null,
    [runs, compareId]
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const res = await runPromptTest(versionId, jd, master);
        if (!res.ok) {
          setError(res.error || "Test failed");
          return;
        }
        const now = new Date();
        const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
        const next: TestResult = {
          id,
          label: "Run 1",
          ranAt: now.toLocaleString(),
          text: res.text,
          atsScore: res.atsScore,
          psychScore: res.psychScore,
          atsReady: res.atsReady,
          best: res.best,
          mode: res.mode,
          layoutId: res.layoutId,
          jobTitle: res.jobTitle,
        };
        setRuns((prev) => {
          const previousLatest = prev[0] || null;
          const merged = [next, ...prev].slice(0, MAX_RUNS).map((r, i) => ({
            ...r,
            label: `Run ${i + 1}`,
          }));
          // Default compare right side to previous run (if any)
          if (previousLatest) {
            setCompareId(previousLatest.id);
          }
          return merged;
        });
        setActiveId(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error running test");
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="jobRequirement">Sample job requirement</Label>
          <Textarea
            id="jobRequirement"
            name="jobRequirement"
            rows={6}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="masterResume">Sample master resume</Label>
          <Textarea
            id="masterResume"
            name="masterResume"
            rows={4}
            value={master}
            onChange={(e) => setMaster(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Running test…" : "Run Test"}
          </Button>
          {runs.length > 0 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setView((v) => (v === "single" ? "compare" : "single"))}
              >
                {view === "single" ? "Compare runs" : "Single run"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRuns([]);
                  setActiveId(null);
                  setCompareId(null);
                  setView("single");
                }}
              >
                Clear history
              </Button>
            </>
          ) : null}
        </div>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {runs.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[#86868b]">
                Test results
              </p>
              <p className="text-[12.5px] text-[#6e6e73]">
                Each Run Test adds a tab. Switch tabs to review; use Compare to view two side by
                side.
              </p>
            </div>
            {view === "compare" && runs.length >= 2 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="text-[#6e6e73]">
                  Left{" "}
                  <select
                    className="ml-1 rounded-md border border-black/[0.08] bg-white px-2 py-1"
                    value={active?.id || ""}
                    onChange={(e) => setActiveId(e.target.value)}
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} · ATS {r.atsScore}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[#6e6e73]">
                  Right{" "}
                  <select
                    className="ml-1 rounded-md border border-black/[0.08] bg-white px-2 py-1"
                    value={compare?.id || runs[1]?.id || ""}
                    onChange={(e) => setCompareId(e.target.value)}
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} · ATS {r.atsScore}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          {/* Tabs — first tab is latest run */}
          <div
            role="tablist"
            aria-label="Test run results"
            className="flex flex-wrap gap-1 border-b border-black/[0.06] pb-px"
          >
            {runs.map((r) => {
              const selected = r.id === (active?.id || runs[0]?.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveId(r.id)}
                  className={cn(
                    "relative -mb-px rounded-t-lg px-3 py-2 text-left text-[12.5px] font-medium transition",
                    selected
                      ? "border border-b-white border-black/[0.08] bg-white text-[#1d1d1f]"
                      : "border border-transparent text-[#6e6e73] hover:bg-black/[0.03] hover:text-[#1d1d1f]"
                  )}
                >
                  <span className="block">{r.label}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    <span
                      className={cn(
                        "tabular-nums text-[10px]",
                        r.atsScore === 100 ? "text-emerald-700" : "text-amber-800"
                      )}
                    >
                      ATS {r.atsScore}
                    </span>
                    <span className="text-[10px] text-[#c7c7cc]">·</span>
                    <span
                      className={cn(
                        "tabular-nums text-[10px]",
                        r.psychScore === 100 ? "text-emerald-700" : "text-amber-800"
                      )}
                    >
                      Psych {r.psychScore}
                    </span>
                    {r.best ? (
                      <span className="text-[10px] font-semibold text-[#0071e3]">BEST</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          {view === "compare" && active && compare && active.id !== compare.id ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
                  Left · {active.label}
                </p>
                <ResultPanel result={active} compact />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
                  Right · {compare.label}
                </p>
                <ResultPanel result={compare} compact />
              </div>
              <div className="lg:col-span-2 rounded-xl border border-black/[0.06] bg-[#fafafa] p-3 text-[12.5px] text-[#6e6e73]">
                <span className="font-semibold text-[#1d1d1f]">Delta · </span>
                ATS {active.atsScore - compare.atsScore >= 0 ? "+" : ""}
                {active.atsScore - compare.atsScore}
                {" · "}
                Psych {active.psychScore - compare.psychScore >= 0 ? "+" : ""}
                {active.psychScore - compare.psychScore}
                {" · "}
                Chars {active.text.length - compare.text.length >= 0 ? "+" : ""}
                {active.text.length - compare.text.length}
                {" · "}
                Left mode {active.mode || "—"} / Right mode {compare.mode || "—"}
              </div>
            </div>
          ) : active ? (
            <div role="tabpanel">
              <ResultPanel result={active} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
