"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Label, Textarea } from "@/components/ui";
import {
  runPromptTestMatrix,
  type PromptTestResultOk,
} from "@/app/actions/templates";
import { PROMPT_TEST_SEQUENCES } from "@/lib/prompt-test-matrix";
import { cn } from "@/lib/utils";

type TabDef = (typeof PROMPT_TEST_SEQUENCES)[number];

type TabState = {
  def: TabDef;
  status: "idle" | "running" | "ok" | "error";
  result?: PromptTestResultOk;
  error?: string;
};

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

function emptyTabs(): TabState[] {
  return PROMPT_TEST_SEQUENCES.map((def) => ({
    def,
    status: "idle" as const,
  }));
}

export function PromptTestForm({ versionId }: { versionId: string }) {
  const [jd, setJd] = useState(
    "10+ years of functional SAP consulting experience with at least 1-2 end-to-end full life-cycle implementations of SAP ATTP as functional consultant.\nProven experience in leading functional workstreams in large-scale SAP transformation programs.\nDeep understanding of pharmaceutical supply chains, packaging, and aggregation processes.\nStrong knowledge of business process design and system implementation.\nHands-on expertise in GS1 standards (GTIN, GLN, SSCC), EPCIS messaging, and SAP integration architectures (EDI/ALE)."
  );
  const [master, setMaster] = useState(
    "Jane Smith — SAP FICO Consultant with 10 years GL, AP, AR, Asset Accounting experience."
  );
  const [error, setError] = useState("");
  const [tabs, setTabs] = useState<TabState[]>(emptyTabs);
  const [activeId, setActiveId] = useState(PROMPT_TEST_SEQUENCES[0]!.id);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState("");

  const active = useMemo(
    () => tabs.find((t) => t.def.id === activeId) || tabs[0]!,
    [tabs, activeId]
  );

  const summary = useMemo(() => {
    return tabs
      .filter((t) => t.status === "ok" && t.result)
      .map((t) => ({
        id: t.def.id,
        short: t.def.shortLabel,
        ats: t.result!.atsScore,
        psych: t.result!.psychScore,
        engine: t.result!.engineUsed,
        best: t.result!.best,
      }));
  }, [tabs]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setProgress("Starting 4 engine sequences…");
    setTabs(
      PROMPT_TEST_SEQUENCES.map((def) => ({
        def,
        status: "running" as const,
      }))
    );
    setActiveId(PROMPT_TEST_SEQUENCES[0]!.id);

    startTransition(async () => {
      try {
        // Sequential server matrix (one sequence at a time inside action)
        setProgress("Running matrix: AI→Rules, Rules→AI, Rules only, AI only…");
        const matrix = await runPromptTestMatrix(versionId, jd, master);
        if (!matrix.results.length && !matrix.ok) {
          setError(matrix.error || "All sequence tests failed");
          setTabs(emptyTabs());
          setProgress("");
          return;
        }

        const next: TabState[] = PROMPT_TEST_SEQUENCES.map((def) => {
          const r = matrix.results.find(
            (x) => ("tabId" in x && x.tabId === def.id) || false
          );
          if (!r) {
            return {
              def,
              status: "error" as const,
              error: "No result for this sequence",
            };
          }
          if (!r.ok) {
            return {
              def,
              status: "error" as const,
              error: r.error,
            };
          }
          return {
            def,
            status: "ok" as const,
            result: r,
          };
        });
        setTabs(next);
        setProgress("");
        if (!matrix.ok) {
          setError(matrix.error || "Some sequences failed — open tabs for details");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unexpected error running tests"
        );
        setTabs(emptyTabs());
        setProgress("");
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
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Running 4 sequences…" : "Run Test"}
          </Button>
          <p className="text-[12.5px] text-[#6e6e73]">
            Runs all four engine sequences and fills the tabs below for comparison.
          </p>
        </div>
      </form>

      {progress ? (
        <p className="text-sm text-sky-800">{progress}</p>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Always show the four sequence tabs */}
      <div className="space-y-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#86868b]">
            Engine sequence results
          </p>
          <p className="text-[12.5px] text-[#6e6e73]">
            Tab 1: <code className="text-[11px]">ai-tailor, progressive-rules</code>
            {" · "}
            Tab 2: <code className="text-[11px]">progressive-rules, ai-tailor</code>
            {" · "}
            Tab 3: <code className="text-[11px]">progressive-rules</code>
            {" · "}
            Tab 4: <code className="text-[11px]">ai-tailor</code>
          </p>
        </div>

        {summary.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
            <table className="w-full min-w-[520px] text-left text-[12.5px]">
              <thead className="border-b border-black/[0.06] bg-black/[0.02] text-[#6e6e73]">
                <tr>
                  <th className="px-3 py-2 font-medium">Sequence</th>
                  <th className="px-3 py-2 font-medium">Engine used</th>
                  <th className="px-3 py-2 font-medium">ATS</th>
                  <th className="px-3 py-2 font-medium">Psych</th>
                  <th className="px-3 py-2 font-medium">Badge</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr
                    key={s.id}
                    className={cn(
                      "border-b border-black/[0.04] last:border-0",
                      s.id === activeId && "bg-sky-50/50"
                    )}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-medium text-[#0071e3] hover:underline"
                        onClick={() => setActiveId(s.id)}
                      >
                        {s.short}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{s.engine}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{s.ats}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{s.psych}</td>
                    <td className="px-3 py-2">
                      {s.best ? (
                        <span className="text-[11px] font-semibold text-[#0071e3]">
                          BEST
                        </span>
                      ) : s.ats >= 95 ? (
                        <span className="text-[11px] font-semibold text-sky-800">
                          SHIP
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#86868b]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div
          role="tablist"
          aria-label="Engine sequence comparison"
          className="flex flex-wrap gap-1 border-b border-black/[0.06] pb-px"
        >
          {tabs.map((t) => {
            const selected = t.def.id === active.def.id;
            return (
              <button
                key={t.def.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(t.def.id)}
                className={cn(
                  "relative -mb-px max-w-[11rem] rounded-t-lg px-3 py-2 text-left text-[12px] font-medium transition sm:max-w-none",
                  selected
                    ? "border border-b-white border-black/[0.08] bg-white text-[#1d1d1f]"
                    : "border border-transparent text-[#6e6e73] hover:bg-black/[0.03] hover:text-[#1d1d1f]"
                )}
              >
                <span className="block font-semibold">{t.def.shortLabel}</span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-[#86868b]">
                  {t.def.label}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {t.status === "running" ? (
                    <span className="text-[10px] text-sky-700">Running…</span>
                  ) : null}
                  {t.status === "idle" ? (
                    <span className="text-[10px] text-[#c7c7cc]">Not run</span>
                  ) : null}
                  {t.status === "error" ? (
                    <span className="text-[10px] text-red-600">Error</span>
                  ) : null}
                  {t.status === "ok" && t.result ? (
                    <>
                      <span className="tabular-nums text-[10px] text-emerald-800">
                        ATS {t.result.atsScore}
                      </span>
                      <span className="text-[10px] text-[#c7c7cc]">·</span>
                      <span className="tabular-nums text-[10px] text-violet-800">
                        Psych {t.result.psychScore}
                      </span>
                    </>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div role="tabpanel" className="rounded-xl border border-black/[0.06] bg-white p-4">
          <div className="mb-3 space-y-1">
            <h3 className="text-[15px] font-semibold text-[#1d1d1f]">
              {active.def.shortLabel}
            </h3>
            <p className="font-mono text-[12px] text-[#6e6e73]">{active.def.label}</p>
          </div>

          {active.status === "idle" ? (
            <p className="text-sm text-[#86868b]">
              Click <strong>Run Test</strong> to generate this sequence.
            </p>
          ) : null}

          {active.status === "running" ? (
            <p className="text-sm text-sky-800">Generating pack for this sequence…</p>
          ) : null}

          {active.status === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {active.error || "Sequence failed"}
            </div>
          ) : null}

          {active.status === "ok" && active.result ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {scorePill(active.result.atsScore, "ATS")}
                {scorePill(active.result.psychScore, "Psych")}
                {active.result.best ? (
                  <span className="rounded-full bg-[#0071e3]/15 px-2 py-0.5 text-[11px] font-semibold text-[#0071e3]">
                    BEST
                  </span>
                ) : active.result.atsScore >= 95 ? (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                    SHIP
                  </span>
                ) : null}
                <span className="text-[12px] text-[#6e6e73]">
                  Engine used:{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px]">
                    {active.result.engineUsed}
                  </code>
                </span>
                {active.result.mode ? (
                  <span className="text-[12px] text-[#6e6e73]">
                    Mode: {active.result.mode}
                  </span>
                ) : null}
                <span className="text-[12px] text-[#6e6e73]">
                  Title: {active.result.jobTitle}
                </span>
                <span className="text-[12px] text-[#6e6e73]">
                  Layout: {active.result.layoutId}
                </span>
              </div>
              {active.result.enginesTried?.length ? (
                <p className="text-[11px] text-[#86868b]">
                  Tried:{" "}
                  {active.result.enginesTried
                    .map(
                      (e) =>
                        `${e.engine}${e.ok ? "✓" : "✗"}${e.error ? ` (${e.error.slice(0, 40)})` : ""}`
                    )
                    .join(" → ")}
                </p>
              ) : null}
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg border border-black/[0.06] bg-[#fafafa] p-3 text-xs leading-relaxed text-[#1d1d1f]">
                {active.result.text}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
