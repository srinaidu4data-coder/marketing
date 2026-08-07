"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { getLayout } from "@/lib/resume/templates";
import {
  defaultSteps,
  GenerationProgressPanel,
  type UiStep,
} from "@/components/generation-progress";
import type { ProgressEvent } from "@/lib/resume/generation-progress";

type PoolCandidate = {
  id: string;
  name: string;
  email: string;
  layoutId: string;
  exportFormat: string;
  /** Preflight from server */
  ready?: boolean;
  readyReason?: string;
  engagementCount?: number;
};

export function NewChainForm({
  pool,
  cancelHref,
}: {
  pool: PoolCandidate[];
  cancelHref: string;
}) {
  const [rawJobText, setRawJobText] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [employeeNote, setEmployeeNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(pool.filter((c) => c.ready !== false).map((c) => c.id))
  );
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Live generation status
  const [steps, setSteps] = useState<UiStep[]>(() => defaultSteps());
  const [candidateName, setCandidateName] = useState<string | undefined>();
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [pool, filter]);

  const selectedCount = selected.size;

  function selectAll() {
    setSelected(
      new Set(pool.filter((c) => c.ready !== false).map((c) => c.id))
    );
  }
  function selectNone() {
    setSelected(new Set());
  }
  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function applyProgressEvent(ev: ProgressEvent | Record<string, unknown>) {
    const type = (ev as ProgressEvent).type;
    if (type === "chain_start") {
      const e = ev as Extract<ProgressEvent, { type: "chain_start" }>;
      setCandidateTotal(e.candidateCount);
      setStatusMsg(`Starting AI for ${e.candidateCount} candidate(s)…`);
      setSteps(defaultSteps());
      return;
    }
    if (type === "candidate_start") {
      const e = ev as Extract<ProgressEvent, { type: "candidate_start" }>;
      setCandidateName(e.candidateName);
      setCandidateIndex(e.index);
      setCandidateTotal(e.total);
      setSteps(defaultSteps());
      setStatusMsg(`Building resume for ${e.candidateName}…`);
      return;
    }
    if (type === "step") {
      const e = ev as Extract<ProgressEvent, { type: "step" }>;
      setSteps((prev) => {
        const next = prev.map((s) => {
          if (s.id !== e.stepId) {
            // When a step goes active, previous actives that aren't done stay
            if (e.status === "active" && s.status === "active") {
              return { ...s, status: "done" as const };
            }
            return s;
          }
          return {
            ...s,
            label: e.label || s.label,
            status: e.status,
          };
        });
        // Ensure known step exists (custom ids)
        if (!next.some((s) => s.id === e.stepId)) {
          next.push({
            id: e.stepId,
            label: e.label,
            status: e.status,
          });
        }
        return next;
      });
      if (e.status === "active") {
        setStatusMsg(e.detail || e.label);
      }
      return;
    }
    if (type === "heartbeat") {
      const e = ev as Extract<ProgressEvent, { type: "heartbeat" }>;
      setStatusMsg(e.message);
      return;
    }
    if (type === "candidate_done") {
      const e = ev as Extract<ProgressEvent, { type: "candidate_done" }>;
      if (e.ok) {
        setSteps((prev) =>
          prev.map((s) =>
            s.status === "pending" || s.status === "active"
              ? { ...s, status: "done" as const }
              : s
          )
        );
        setStatusMsg(`${e.candidateName} complete`);
      } else {
        setStatusMsg(`${e.candidateName} failed: ${e.message || "error"}`);
      }
      return;
    }
    if (type === "chain_done") {
      const e = ev as Extract<ProgressEvent, { type: "chain_done" }>;
      setStatusMsg(
        e.status === "FAILED" ? "Generation finished with errors" : "All done"
      );
      return;
    }
    if (type === "complete") {
      const e = ev as Extract<ProgressEvent, { type: "complete" }>;
      setStatusMsg(
        e.status === "FAILED" ? "Generation finished with errors" : "All done"
      );
      return;
    }
    if (type === "error") {
      const e = ev as Extract<ProgressEvent, { type: "error" }>;
      setError(e.message);
      setStatusMsg("Error");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!rawJobText.trim() || !vendorName.trim() || !vendorEmail.trim()) {
      setError("Job requirement, vendor name, and vendor email are required.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one candidate with a ready master resume.");
      return;
    }
    const notReadySel = pool.filter(
      (c) => selected.has(c.id) && c.ready === false
    );
    if (notReadySel.length) {
      setError(
        `Remove not-ready candidates first: ${notReadySel.map((c) => c.name).join(", ")}. Upload master on Candidates.`
      );
      return;
    }

    setPending(true);
    setSteps(defaultSteps());
    setStatusMsg("Connecting to AI…");
    setCandidateName(undefined);

    const candidateIds = Array.from(selected);
    try {
      const res = await fetch("/api/chains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawJobText,
          vendorName,
          vendorEmail,
          employeeNote: employeeNote || undefined,
          candidateIds,
          stream: true,
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        if (data.error === "VENDOR_SKILL_CONFLICT") {
          const payload = btoa(
            unescape(encodeURIComponent(JSON.stringify(data.conflicts)))
          )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
          window.location.href = `/chains/new?blocked=1&conflicts=${payload}`;
          return;
        }
      }

      if (!res.ok || !res.body) {
        let msg = `Failed (${res.status})`;
        try {
          const data = await res.json();
          msg = data.message || data.error || msg;
        } catch {
          /* ignore */
        }
        setError(msg);
        setPending(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalId: string | undefined;
      let finalStatus: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const ev = JSON.parse(trimmed) as ProgressEvent;
            applyProgressEvent(ev);
            if (ev.type === "chain_start") {
              finalId = ev.chainId;
            }
            if (ev.type === "chain_done") {
              finalId = ev.chainId || finalId;
              finalStatus = ev.status;
            }
            if (ev.type === "complete") {
              finalId = ev.id || finalId;
              finalStatus = ev.status || finalStatus;
            }
          } catch {
            /* skip bad line */
          }
        }
      }

      if (finalId) {
        const admin = cancelHref.startsWith("/admin");
        const q =
          finalStatus === "FAILED"
            ? "?failed=1"
            : finalStatus === "PARTIAL"
              ? "?partial=1"
              : "?ready=1";
        window.location.href = admin
          ? `/admin/chains/${finalId}${q}`
          : `/chains/${finalId}${q}`;
        return;
      }
      setError("Generation finished without a chain id. Please retry.");
    } catch {
      setError("Network error — please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!pending ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-900/80">
          Tip: start with <strong>1–2 candidates</strong> so AI finishes quickly.
          Same vendor + different skill for one person is blocked.
        </div>
      ) : null}

      {/* Live granular status while generating */}
      {pending ? (
        <GenerationProgressPanel
          candidateName={candidateName}
          candidateIndex={candidateIndex}
          candidateTotal={candidateTotal}
          steps={steps}
          overallMessage={statusMsg}
        />
      ) : null}

      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        <div className="space-y-1.5">
          <Label htmlFor="rawJobText">Job requirement</Label>
          <Textarea
            id="rawJobText"
            required
            rows={8}
            value={rawJobText}
            onChange={(e) => setRawJobText(e.target.value)}
            placeholder="Paste the full job description…"
            className="min-h-[160px]"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vendorName">Vendor</Label>
            <Input
              id="vendorName"
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Vendor name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendorEmail">Vendor email</Label>
            <Input
              id="vendorEmail"
              type="email"
              required
              value={vendorEmail}
              onChange={(e) => setVendorEmail(e.target.value)}
              placeholder="vendor@company.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="employeeNote">Note (optional)</Label>
          <Textarea
            id="employeeNote"
            rows={2}
            value={employeeNote}
            onChange={(e) => setEmployeeNote(e.target.value)}
            placeholder="Included in the email to the vendor"
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>
              Candidates
              <span className="ml-1.5 font-normal text-zinc-400">
                {selectedCount}/{pool.length}
              </span>
            </Label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
              >
                All
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
              >
                None
              </button>
            </div>
          </div>

          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search candidates…"
            aria-label="Filter candidates"
          />

          <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2">
            {filtered.map((c) => {
              const layout = getLayout(c.layoutId);
              const on = selected.has(c.id);
              const ready = c.ready !== false;
              return (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors ${
                    !ready
                      ? "cursor-not-allowed opacity-60"
                      : on
                        ? "bg-indigo-50/80 ring-1 ring-indigo-100"
                        : "hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on && ready}
                    disabled={!ready}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                    aria-label={`Select ${c.name}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900">
                      {c.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {c.email}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-400">
                      {layout.name} · {c.exportFormat}
                    </span>
                    {ready ? (
                      <span className="mt-0.5 block text-[11px] font-medium text-emerald-700">
                        Master ready
                        {c.engagementCount
                          ? ` · ${c.engagementCount} engagement(s)`
                          : ""}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[11px] font-medium text-amber-800">
                        Not ready: {c.readyReason || "upload master first"}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-zinc-400">
                No matches
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="submit"
          variant="soft"
          size="lg"
          disabled={pending || selectedCount === 0}
          title={
            selectedCount === 0
              ? "Select at least one ready candidate"
              : undefined
          }
        >
          {pending
            ? "Generating…"
            : `Generate ${selectedCount} resume${selectedCount === 1 ? "" : "s"}`}
        </Button>
        {/* Always clickable — never disable cancel during generation */}
        <Link
          href={cancelHref}
          className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-medium text-[#6e6e73] transition-colors hover:bg-black/[0.04] hover:text-[#1d1d1f]"
        >
          Cancel
        </Link>
        {selectedCount === 0 && !pending ? (
          <p className="w-full text-[13px] text-amber-800">
            {pool.length === 0
              ? "No candidates in your pool — ask admin to allocate someone."
              : "Select at least one ready candidate to generate."}
          </p>
        ) : null}
      </div>
    </form>
  );
}
