"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { getLayout } from "@/lib/resume/templates";

type PoolCandidate = {
  id: string;
  name: string;
  email: string;
  layoutId: string;
  exportFormat: string;
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
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(pool.map((c) => c.id))
  );
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

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
    setSelected(new Set(pool.map((c) => c.id)));
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!rawJobText.trim() || !vendorName.trim() || !vendorEmail.trim()) {
      setError("Job requirement, vendor name, and vendor email are required.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one candidate.");
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("rawJobText", rawJobText);
      fd.set("vendorName", vendorName);
      fd.set("vendorEmail", vendorEmail);
      fd.set("employeeNote", employeeNote);
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
          }),
        });
        const data = await res.json();
        if (res.status === 409 && data.error === "VENDOR_SKILL_CONFLICT") {
          const payload = btoa(unescape(encodeURIComponent(JSON.stringify(data.conflicts))))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
          window.location.href = `/chains/new?blocked=1&conflicts=${payload}`;
          return;
        }
        // Partial/total generation failure still returns an id — open the chain
        if (data.id && (res.ok || res.status === 422)) {
          const admin = cancelHref.startsWith("/admin");
          const q = data.status === "FAILED" ? "?failed=1" : "";
          window.location.href = admin
            ? `/admin/chains/${data.id}${q}`
            : `/chains/${data.id}${q}`;
          return;
        }
        if (!res.ok) {
          setError(data.message || data.error || `Failed (${res.status})`);
          return;
        }
      } catch {
        setError("Network error — please retry.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <strong>Vendor rule:</strong> Different skill/job title for a candidate already sent to
        this vendor is hard-blocked.
      </div>

      <div className="space-y-2">
        <Label htmlFor="rawJobText">Job requirement</Label>
        <Textarea
          id="rawJobText"
          required
          rows={8}
          value={rawJobText}
          onChange={(e) => setRawJobText(e.target.value)}
          placeholder="Paste the full requirement from the vendor email or job board."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="vendorName">Vendor name</Label>
          <Input
            id="vendorName"
            required
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="e.g. keerthi"
          />
        </div>
        <div className="space-y-2">
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

      <div className="space-y-2">
        <Label htmlFor="employeeNote">Employee note (optional)</Label>
        <Textarea
          id="employeeNote"
          rows={2}
          value={employeeNote}
          onChange={(e) => setEmployeeNote(e.target.value)}
          placeholder="Optional note included in email body"
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>
            Candidates ({selectedCount} of {pool.length} selected)
          </Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={selectNone}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Select none
            </button>
          </div>
        </div>

        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or email"
          aria-label="Filter candidates"
        />

        <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border p-3">
          {filtered.map((c) => {
            const layout = getLayout(c.layoutId);
            const on = selected.has(c.id);
            return (
              <label
                key={c.id}
                className={`flex cursor-pointer items-start gap-3 rounded border p-3 hover:bg-slate-50 ${
                  on ? "border-slate-900 bg-slate-50/80" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                  className="mt-1 h-4 w-4 accent-slate-900"
                  aria-label={`Select ${c.name}`}
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-slate-500">{c.email}</span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Layout: <strong>{layout.name}</strong> · {c.exportFormat}
                  </span>
                </span>
              </label>
            );
          })}
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">No candidates match filter.</p>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex gap-3">
        <Link href={cancelHref}>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={pending || selectedCount === 0}>
          {pending
            ? "Generating…"
            : `Generate ${selectedCount} resume${selectedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </form>
  );
}
