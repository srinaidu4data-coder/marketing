"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  FileText,
  LayoutTemplate,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createCandidate, deleteCandidate } from "@/app/actions/candidates";
import { Button, EmptyState, Input, Label } from "@/components/ui";
import {
  ExportFormatPicker,
  LayoutPicker,
} from "@/components/layout-picker";
import { cn, formatDate } from "@/lib/utils";

export type CandidateRosterItem = {
  id: string;
  name: string;
  email: string;
  layoutId: string;
  layoutName: string;
  exportFormat: string;
  createdAt: string;
  engagementCount: number;
  profileScore: number;
  failCount: number;
  warnCount: number;
  ready: boolean;
  readyReason?: string;
  hasMaster: boolean;
};

type FilterKey = "all" | "ready" | "needs_master" | "review";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarTone(name: string) {
  const tones = [
    "from-[#5ac8fa]/20 to-[#0071e3]/15 text-[#0071e3]",
    "from-[#af52de]/15 to-[#5856d6]/12 text-[#5856d6]",
    "from-[#34c759]/15 to-[#30d158]/10 text-[#248a3d]",
    "from-[#ff9f0a]/18 to-[#ff375f]/10 text-[#c93400]",
    "from-[#64d2ff]/18 to-[#5e5ce6]/12 text-[#3634a3]",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h + name.charCodeAt(i) * (i + 1)) % tones.length;
  return tones[h];
}

function ReadyPill({ item }: { item: CandidateRosterItem }) {
  if (item.ready) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/[0.1] px-2.5 py-0.5 text-[11px] font-semibold tracking-tight text-emerald-800 ring-1 ring-inset ring-emerald-500/15">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Ready
      </span>
    );
  }
  if (!item.hasMaster) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.1] px-2.5 py-0.5 text-[11px] font-semibold tracking-tight text-amber-900 ring-1 ring-inset ring-amber-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        Needs master
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/[0.1] px-2.5 py-0.5 text-[11px] font-semibold tracking-tight text-orange-900 ring-1 ring-inset ring-orange-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden />
      Needs review
    </span>
  );
}

function StatChip({
  label,
  value,
  active,
  onClick,
  tone = "neutral",
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-xl border px-2.5 py-2 text-left transition-all duration-200 ease-apple sm:px-3 sm:py-2.5",
        active
          ? "border-[#0071e3]/30 bg-[#0071e3]/[0.06] shadow-soft"
          : "border-black/[0.06] bg-white shadow-soft hover:border-black/[0.1]"
      )}
    >
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-[#86868b] sm:text-[11px]">
        {label}
      </span>
      <span
        className={cn(
          "mt-0.5 text-[1.25rem] font-semibold tracking-[-0.03em] tabular-nums sm:text-[1.4rem]",
          tone === "good" && "text-emerald-700",
          tone === "warn" && "text-amber-800",
          tone === "neutral" && "text-[#1d1d1f]"
        )}
      >
        {value}
      </span>
    </button>
  );
}

export function CandidatesRoster({
  items,
  listError,
}: {
  items: CandidateRosterItem[];
  /** From ?error= on failed create */
  listError?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [addOpen, setAddOpen] = useState(items.length === 0 || !!listError);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bannerError = deleteError || listError || null;

  const counts = useMemo(() => {
    const ready = items.filter((i) => i.ready).length;
    const needsMaster = items.filter((i) => !i.hasMaster).length;
    const review = items.filter((i) => i.hasMaster && !i.ready).length;
    return { total: items.length, ready, needsMaster, review };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "ready" && !i.ready) return false;
      if (filter === "needs_master" && i.hasMaster) return false;
      if (filter === "review" && !(i.hasMaster && !i.ready)) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        i.layoutName.toLowerCase().includes(q)
      );
    });
  }, [items, query, filter]);

  function onDelete(id: string) {
    start(async () => {
      setDeleteError(null);
      const res = await deleteCandidate(id);
      setConfirmId(null);
      if (res && "ok" in res && res.ok === false) {
        setDeleteError(res.error || "Hard delete failed.");
        return;
      }
      router.refresh();
    });
  }

  const listGrid =
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 md:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_6.75rem] md:gap-x-4";

  return (
    <div className="space-y-4">
      {bannerError ? (
        <div className="rounded-xl border border-red-200/80 bg-red-50/90 px-3.5 py-2.5 text-[13px] text-red-800">
          {bannerError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex h-11 w-full max-w-md items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 shadow-soft transition-all focus-within:border-[#0071e3]/40 focus-within:ring-[3px] focus-within:ring-[#0071e3]/20">
          <Search className="h-4 w-4 shrink-0 text-[#86868b]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, layout…"
            className="h-full w-full bg-transparent text-[14px] text-[#1d1d1f] outline-none placeholder:text-[#86868b]"
            aria-label="Search candidates"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-full p-1 text-[#86868b] hover:bg-black/[0.04] hover:text-[#1d1d1f]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={() => setAddOpen((v) => !v)}
          className="shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          {addOpen ? "Close" : "Add candidate"}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        <StatChip
          label="All"
          value={counts.total}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatChip
          label="Ready"
          value={counts.ready}
          tone="good"
          active={filter === "ready"}
          onClick={() => setFilter("ready")}
        />
        <StatChip
          label="No master"
          value={counts.needsMaster}
          tone="warn"
          active={filter === "needs_master"}
          onClick={() => setFilter("needs_master")}
        />
        <StatChip
          label="Review"
          value={counts.review}
          tone="warn"
          active={filter === "review"}
          onClick={() => setFilter("review")}
        />
      </div>

      {addOpen ? (
        <section
          id="add-candidate"
          className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-lift"
        >
          <div className="border-b border-black/[0.05] bg-gradient-to-b from-[#fafafa] to-white px-4 py-3 sm:px-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              New roster entry
            </p>
            <h2 className="mt-0.5 text-[16px] font-semibold tracking-tight text-[#1d1d1f]">
              Add a candidate
            </h2>
            <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-[#6e6e73]">
              After create you land on their profile to upload a master (if needed),
              then start a chain.
            </p>
          </div>

          {/*
            Pass server action directly. createCandidate always redirect()s
            (success → profile, failure → list ?error=). Client router was flaky.
          */}
          <form
            action={createCandidate}
            className="grid gap-4 px-4 py-4 sm:px-5 sm:py-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cand-name">Full name</Label>
                <Input
                  id="cand-name"
                  name="name"
                  required
                  placeholder="Sri Naidu"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cand-email">Email</Label>
                <Input
                  id="cand-email"
                  name="email"
                  type="email"
                  required
                  placeholder="name@company.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <LayoutPicker />
            <ExportFormatPicker />

            <div className="space-y-1.5">
              <Label htmlFor="cand-resume">Master resume (optional)</Label>
              <div className="rounded-2xl border border-dashed border-black/[0.1] bg-[#fafafa]/80 px-4 py-4">
                <Input
                  id="cand-resume"
                  name="resume"
                  type="file"
                  accept=".txt,.doc,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className="border-0 bg-transparent shadow-none file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3.5 file:py-1.5 file:text-[12px] file:font-semibold file:text-[#1d1d1f] file:shadow-soft hover:border-0 focus-visible:ring-0"
                />
                <p className="mt-2 text-[12.5px] leading-relaxed text-[#86868b]">
                  Prefer <strong className="font-semibold text-[#6e6e73]">.docx</strong> or{" "}
                  <strong className="font-semibold text-[#6e6e73]">.txt</strong>. You can also
                  upload on the next screen.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" variant="soft">
                Create candidate
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Your roster is empty"
          description="Add the first candidate, upload a master resume, then start a chain."
          action={
            <Button type="button" variant="soft" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add first candidate
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try another name, clear search, or switch the filter chips above."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-soft">
          <div
            className={cn(
              "hidden border-b border-black/[0.05] bg-[#fafafa]/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#86868b] md:px-5",
              listGrid
            )}
          >
            <span>Person</span>
            <span>Master</span>
            <span>Layout</span>
            <span className="text-right">Actions</span>
          </div>

          <ul className="divide-y divide-black/[0.04]">
            {filtered.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "group px-4 py-3 transition-colors duration-150 ease-apple hover:bg-[#fafafa] md:px-5",
                  listGrid
                )}
              >
                <Link
                  href={`/admin/candidates/${item.id}`}
                  className="flex min-w-0 items-center gap-3 outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[#0071e3]/30"
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[12px] font-semibold tracking-tight",
                      avatarTone(item.name)
                    )}
                    aria-hidden
                  >
                    {initials(item.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold tracking-tight text-[#1d1d1f]">
                        {item.name}
                      </span>
                      <span className="md:hidden">
                        <ReadyPill item={item} />
                      </span>
                    </div>
                    <p className="truncate text-[12.5px] text-[#86868b]">
                      {item.email}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#a1a1a6] md:hidden">
                      {item.layoutName} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                </Link>

                <div className="hidden min-w-0 md:block">
                  <ReadyPill item={item} />
                  <p className="mt-1 text-[12px] leading-snug text-[#6e6e73]">
                    {item.hasMaster ? (
                      <>
                        <span className="font-semibold tabular-nums text-[#1d1d1f]">
                          {item.engagementCount}
                        </span>{" "}
                        eng ·{" "}
                        <span className="font-semibold tabular-nums text-[#1d1d1f]">
                          {item.profileScore}%
                        </span>
                        {item.failCount > 0
                          ? ` · ${item.failCount} fail`
                          : item.warnCount > 0
                            ? ` · ${item.warnCount} warn`
                            : ""}
                      </>
                    ) : (
                      <span title={item.readyReason}>Upload .docx / .txt</span>
                    )}
                  </p>
                </div>

                <div className="hidden min-w-0 md:block">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium tracking-tight text-[#1d1d1f]">
                    <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-[#86868b]" />
                    <span className="truncate">{item.layoutName}</span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[#86868b]">
                    <FileText className="h-3 w-3 shrink-0" />
                    {item.exportFormat}
                    <span className="text-[#d2d2d7]">·</span>
                    {formatDate(item.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-0.5">
                  <Link
                    href={`/admin/candidates/${item.id}`}
                    className="inline-flex items-center gap-0.5 rounded-full px-2 py-1.5 text-[12.5px] font-semibold text-[#0071e3] hover:bg-[#0071e3]/[0.08]"
                  >
                    Open
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                  {confirmId === item.id ? (
                    <div className="flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 p-0.5 shadow-soft">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onDelete(item.id)}
                        className="rounded-full bg-[#ff3b30] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#ff453a] disabled:opacity-50"
                        title="Permanently remove from database — cannot restore"
                      >
                        {pending ? "…" : "Delete forever"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="rounded-full px-2 py-1 text-[11px] font-semibold text-[#6e6e73] hover:bg-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(item.id)}
                      className="rounded-full p-1.5 text-[#c7c7cc] hover:bg-red-50 hover:text-[#ff3b30]"
                      aria-label={`Permanently delete ${item.name}`}
                      title="Hard delete — permanently remove from database"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-black/[0.04] bg-[#fafafa]/60 px-4 py-2 text-[12px] text-[#86868b] md:px-5">
            Showing{" "}
            <span className="font-semibold tabular-nums text-[#6e6e73]">
              {filtered.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold tabular-nums text-[#6e6e73]">
              {items.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
