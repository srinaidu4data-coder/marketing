"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Label, Textarea } from "@/components/ui";
import {
  runPromptLabSection,
  runPromptLabFullCompare,
  type PromptLabSectionResult,
} from "@/app/actions/prompt-lab";
import {
  PROMPT_LAB_SECTIONS,
  type PromptSectionId,
} from "@/lib/resume-v2/prompt-sections";
import { cn } from "@/lib/utils";

const SAMPLE_MASTER = `Jane Smith
jane.smith@email.com | +1 (555) 010-9988 | Austin, TX | linkedin.com/in/janesmith

PROFESSIONAL SUMMARY
SAP consultant with delivery experience across finance and supply chain programs.

TECHNICAL SKILLS
SAP ECC, S/4HANA, FICO, integration, stakeholder management

EXPERIENCE

Senior Consultant
Employer / Client: Acme Global Manufacturing
Austin, TX | 2021 – Present
• Led finance workstream workshops and blueprint sessions
• Configured core GL processes and month-end close support
• Coordinated UAT and cutover with business owners

Consultant
Employer / Client: Northstar Retail Group
Dallas, TX | 2018 – 2021
• Supported AP/AR process design and testing
• Documented functional specs for interfaces
• Trained end users on new process flows

Associate Consultant
Employer / Client: Beacon Health Systems
Remote | 2016 – 2018
• Assisted senior consultants on configuration tasks
• Prepared test scripts and defect logs
• Supported hypercare tickets after go-live

EDUCATION
B.S. Information Systems — State University — 2015
`;

const SAMPLE_JD = `We need a hands-on SAP ATTP functional consultant with 8+ years experience.
Must have end-to-end implementation experience in pharmaceutical serialization,
GS1 standards (GTIN, GLN, SSCC), EPCIS messaging, packaging aggregation,
and integration with ERP (IDoc/EDI/ALE). Lead workshops, blueprint, configuration,
UAT, cutover, and hypercare. Strong stakeholder communication required.`;

export function PromptLabForm({ biblePreview }: { biblePreview: string }) {
  const [master, setMaster] = useState(SAMPLE_MASTER);
  const [jd, setJd] = useState(SAMPLE_JD);
  const [draft, setDraft] = useState("");
  const [promptOverride, setPromptOverride] = useState("");
  const [provider, setProvider] = useState<"auto" | "openai" | "anthropic">(
    "auto"
  );
  const [active, setActive] = useState<PromptSectionId>("summary");
  const [results, setResults] = useState<
    Partial<Record<PromptSectionId, PromptLabSectionResult>>
  >({});
  const [compare, setCompare] = useState<string>("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [showBible, setShowBible] = useState(false);
  const [composer, setComposer] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PROMPT_LAB_SECTIONS.map((s) => [s.id, true]))
  );

  const section = useMemo(
    () => PROMPT_LAB_SECTIONS.find((s) => s.id === active)!,
    [active]
  );

  const activeResult = results[active];

  function runSection(id: PromptSectionId) {
    setError("");
    setActive(id);
    startTransition(async () => {
      const r = await runPromptLabSection({
        sectionId: id,
        master,
        jd,
        draft: draft || undefined,
        promptOverride: promptOverride || undefined,
        llmProvider: provider === "auto" ? null : provider,
      });
      setResults((prev) => ({ ...prev, [id]: r }));
      if (!r.ok && r.error) setError(r.error);
    });
  }

  function runAllSections() {
    setError("");
    startTransition(async () => {
      const ids = PROMPT_LAB_SECTIONS.map((s) => s.id).filter(
        (id) => id !== "full_bible"
      );
      for (const id of ids) {
        const r = await runPromptLabSection({
          sectionId: id,
          master,
          jd,
          draft: draft || undefined,
          promptOverride: promptOverride || undefined,
          llmProvider: provider === "auto" ? null : provider,
        });
        setResults((prev) => ({ ...prev, [id]: r }));
        setActive(id);
      }
    });
  }

  function runFull() {
    runSection("full_bible");
  }

  function runCompare() {
    setError("");
    setCompare("Running OpenAI vs Claude…");
    startTransition(async () => {
      const r = await runPromptLabFullCompare({
        master,
        jd,
        promptOverride: promptOverride || undefined,
      });
      if (!r.ok) {
        setError(r.error || "Compare failed");
        setCompare("");
        return;
      }
      setCompare(
        JSON.stringify(
          {
            winner: r.winner,
            openaiAts: r.openai?.ats?.score,
            claudeAts: r.claude?.ats?.score,
            openaiPsych: r.openai?.psych?.score,
            claudePsych: r.claude?.psych?.score,
          },
          null,
          2
        )
      );
    });
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-900 p-6 text-white shadow-xl">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-8 left-1/3 h-32 w-32 rounded-full bg-fuchsia-400/20 blur-2xl" />
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-200">
          Role Forge · Prompt Lab
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Stress-test every chamber of the Bible
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-indigo-100/90">
          Isolate prechecks, header, 12-bullet summary, skills, projects, honesty,
          ATS/psych self-checks, style forge — or fire the full prompt-only generator.
          Prompt is the only writing source. Scores stay as validators.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={runFull}
            disabled={pending}
            className="bg-white text-indigo-950 hover:bg-indigo-50"
          >
            {pending ? "Running…" : "🚀 Full Bible Generate"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={runAllSections}
            disabled={pending}
            className="border-white/40 bg-white/10 text-white hover:bg-white/20"
          >
            🧪 Run all micro-labs
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={runCompare}
            disabled={pending}
            className="border-white/40 bg-white/10 text-white hover:bg-white/20"
          >
            ⚔️ OpenAI vs Claude
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowBible((v) => !v)}
            className="border-white/40 bg-white/10 text-white hover:bg-white/20"
          >
            {showBible ? "Hide Bible" : "📖 Peek Bible sample"}
          </Button>
        </div>
      </div>

      {showBible ? (
        <pre className="max-h-80 overflow-auto rounded-xl border bg-slate-950 p-4 text-[11px] leading-relaxed text-slate-100">
          {biblePreview.slice(0, 20000)}
          {biblePreview.length > 20000 ? "\n…(truncated)" : ""}
        </pre>
      ) : null}

      {/* Inputs */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
          <Label>Master resume (paste text from DOCX/PDF extract)</Label>
          <Textarea
            rows={12}
            value={master}
            onChange={(e) => setMaster(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
          <Label>Job description</Label>
          <Textarea
            rows={12}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          <Label>Optional draft (for honesty / ATS / psych / style labs)</Label>
          <Textarea
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste a prior pack or weak bullets…"
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
          <Label>LLM provider</Label>
          <select
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={provider}
            onChange={(e) =>
              setProvider(e.target.value as "auto" | "openai" | "anthropic")
            }
          >
            <option value="auto">Admin default</option>
            <option value="openai">Force OpenAI</option>
            <option value="anthropic">Force Claude</option>
          </select>
          <Label className="mt-3 block">Prompt override (optional)</Label>
          <Textarea
            rows={3}
            value={promptOverride}
            onChange={(e) => setPromptOverride(e.target.value)}
            placeholder="Leave blank to use ACTIVE / Bible"
            className="font-mono text-[11px]"
          />
        </div>
      </div>

      {/* Section grid */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Lab chambers
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PROMPT_LAB_SECTIONS.map((s) => {
            const r = results[s.id];
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => runSection(s.id)}
                disabled={pending}
                className={cn(
                  "rounded-xl border p-3 text-left transition hover:shadow-md",
                  s.color,
                  isActive && "ring-2 ring-indigo-500 ring-offset-2",
                  r?.ok && "shadow-sm",
                  r && !r.ok && "opacity-90"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-lg">{s.emoji}</span>
                  {r ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        r.ok
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white"
                      )}
                    >
                      {r.ok ? "OK" : "FAIL"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">idle</span>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {s.title}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                  {s.blurb}
                </p>
                {r ? (
                  <p className="mt-2 text-[10px] tabular-nums text-slate-500">
                    {r.latencyMs}ms
                    {r.model ? ` · ${r.model}` : ""}
                    {typeof r.json === "object" &&
                    r.json &&
                    "ats" in (r.json as object)
                      ? ` · ATS ${(r.json as { ats?: { score?: number } }).ats?.score}`
                      : ""}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Composer toggles */}
      <div className="rounded-xl border bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-800">
          Bible composer (which chambers you care about)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Visual checklist for prompt authors — production still uses the full ACTIVE
          prompt. Toggle to focus your review while editing the Bible.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROMPT_LAB_SECTIONS.map((s) => (
            <label
              key={s.id}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                composer[s.id]
                  ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 bg-white text-slate-400"
              )}
            >
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={!!composer[s.id]}
                onChange={(e) =>
                  setComposer((c) => ({ ...c, [s.id]: e.target.checked }))
                }
              />
              {s.emoji} {s.title}
            </label>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {compare ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold">Provider duel</h3>
          <pre className="mt-2 overflow-auto text-xs">{compare}</pre>
        </div>
      ) : null}

      {/* Result panel */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Chamber output
            </p>
            <h3 className="text-lg font-semibold">
              {section.emoji} {section.title}
            </h3>
            <p className="text-xs text-slate-500">{section.expectHint}</p>
          </div>
          <Button
            type="button"
            onClick={() => runSection(active)}
            disabled={pending}
          >
            {pending ? "Running…" : "Re-run chamber"}
          </Button>
        </div>
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="border-b p-4 lg:border-b-0 lg:border-r">
            <p className="mb-2 text-[11px] font-semibold uppercase text-slate-400">
              Micro-prompt (system)
            </p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
              {section.id === "full_bible"
                ? "(Full ACTIVE / Bible prompt — see Peek Bible)"
                : section.microPrompt}
            </pre>
          </div>
          <div className="p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase text-slate-400">
              Result
            </p>
            {!activeResult ? (
              <p className="text-sm text-slate-500">
                Click a chamber card to run this lab.
              </p>
            ) : (
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-100">
                {activeResult.raw ||
                  (activeResult.json
                    ? JSON.stringify(activeResult.json, null, 2)
                    : activeResult.error || "—")}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
