"use client";

import { useMemo, useState, useTransition } from "react";

type Candidate = { id: string; name: string; email: string };
type Employee = { id: string; name: string; email: string };
type Allocation = { candidateId: string; employeeId: string };

function key(candidateId: string, employeeId: string) {
  return `${candidateId}:${employeeId}`;
}

export function AllocationGrid({
  candidates,
  employees,
  allocations,
}: {
  candidates: Candidate[];
  employees: Employee[];
  allocations: Allocation[];
}) {
  const [allocated, setAllocated] = useState(() => {
    const s = new Set<string>();
    for (const a of allocations) s.add(key(a.candidateId, a.employeeId));
    return s;
  });
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState("");
  const [, startTransition] = useTransition();

  const allocationCount = allocated.size;
  const allocatedCandidates = useMemo(() => {
    const s = new Set<string>();
    Array.from(allocated).forEach((k) => s.add(k.split(":")[0]));
    return s.size;
  }, [allocated]);
  const unallocated = candidates.length - allocatedCandidates;

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [candidates, filter]);

  async function toggle(candidateId: string, employeeId: string, next: boolean) {
    const k = key(candidateId, employeeId);
    const prev = new Set(allocated);
    const optimistic = new Set(allocated);
    if (next) optimistic.add(k);
    else optimistic.delete(k);
    setAllocated(optimistic);
    setPending((p) => new Set(p).add(k));
    setErrors((m) => {
      const n = new Map(m);
      n.delete(candidateId);
      return n;
    });

    try {
      const res = await fetch("/api/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, employeeId, allocated: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || `Error ${res.status}`;
        setAllocated(prev);
        setErrors((m) => new Map(m).set(candidateId, msg));
      }
    } catch {
      setAllocated(prev);
      setErrors((m) => new Map(m).set(candidateId, "Network error — please retry"));
    } finally {
      startTransition(() => {
        setPending((p) => {
          const n = new Set(p);
          n.delete(k);
          return n;
        });
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
        <span>
          <strong className="text-slate-900">{candidates.length}</strong> candidates
        </span>
        <span>
          <strong className="text-slate-900">{employees.length}</strong> employees
        </span>
        <span>
          <strong className="text-slate-900">{allocationCount}</strong> allocations
        </span>
        <span>
          <strong className="text-slate-900">{allocatedCandidates}</strong> allocated
        </span>
        <span>
          <strong className="text-slate-900">{unallocated}</strong> unallocated
        </span>
      </div>

      <input
        type="search"
        placeholder="Filter candidates by name or email…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full max-w-sm rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
        aria-label="Filter candidates"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No candidates match “{filter}”.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left font-medium">
                  Candidate
                </th>
                {employees.map((e) => (
                  <th key={e.id} className="min-w-[120px] px-4 py-3 text-center font-medium">
                    <span className="block max-w-[120px] truncate">{e.name}</span>
                    <span className="block max-w-[120px] truncate text-xs text-slate-500">
                      {e.email}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => {
                const err = errors.get(c.id);
                return (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 min-w-[180px] bg-white px-4 py-3">
                      <span className="block font-medium">{c.name}</span>
                      <span className="block text-xs text-slate-500">{c.email}</span>
                      {err ? (
                        <span className="mt-1 block text-xs text-red-600">{err}</span>
                      ) : null}
                    </td>
                    {employees.map((e) => {
                      const k = key(c.id, e.id);
                      const checked = allocated.has(k);
                      const loading = pending.has(k);
                      return (
                        <td key={e.id} className="px-4 py-3 text-center">
                          {/*
                            Keep the checkbox mounted while saving — replacing it
                            with a spinner made rapid clicks feel dead (element
                            disappeared mid-interaction).
                          */}
                          <span className="relative inline-flex h-5 w-5 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={loading}
                              onChange={(ev) => toggle(c.id, e.id, ev.target.checked)}
                              className={`h-4 w-4 accent-slate-900 ${
                                loading
                                  ? "cursor-wait opacity-50"
                                  : "cursor-pointer"
                              }`}
                              aria-busy={loading}
                              aria-label={`${checked ? "Unassign" : "Assign"} ${c.name} ${
                                checked ? "from" : "to"
                              } ${e.name}`}
                            />
                            {loading ? (
                              <span
                                className="pointer-events-none absolute inset-0 m-auto h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
                                aria-hidden
                              />
                            ) : null}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
