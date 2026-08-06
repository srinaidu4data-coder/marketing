"use client";

/**
 * Live "what's it waiting on" panel while a chain is GENERATING / SENDING.
 * - Polls /api/chains/:id/progress every 1s
 * - Kicks /api/chains/:id/regenerate once when status is GENERATING (queued)
 *   so packs rebuild in the background while the user watches steps
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChainProgressSnapshot } from "@/lib/resume/generation-progress";
import { ENGAGEMENT_TIPS } from "@/lib/resume/generation-progress";

type ProgressResponse = {
  status: string;
  packsReady: number;
  candidateCount: number;
  progress: ChainProgressSnapshot;
  tips?: string[];
};

export function ChainGeneratingLive({
  chainId,
  initialStatus,
  /** When true, POST regenerate after mount (Regenerate packs flow) */
  autoStart = true,
}: {
  chainId: string;
  initialStatus: string;
  autoStart?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [tipTick, setTipTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [kickError, setKickError] = useState<string | null>(null);
  const [kickState, setKickState] = useState<"idle" | "starting" | "running" | "done">(
    "idle"
  );
  const kickedRef = useRef(false);
  const finishedRefreshRef = useRef(false);

  // Kick long-running regenerate once (live panel holds the job open via fetch)
  useEffect(() => {
    if (!autoStart || kickedRef.current) return;
    if (initialStatus !== "GENERATING" && initialStatus !== "SENDING") return;
    if (initialStatus === "SENDING") return; // send path has its own pipeline
    kickedRef.current = true;
    setKickState("starting");

    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/chains/${chainId}/regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceAll: true }),
          signal: ac.signal,
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          skipped?: boolean;
        };
        if (!res.ok && !json.skipped) {
          setKickError(json.error || `Regenerate failed (${res.status})`);
          setKickState("idle");
          kickedRef.current = false;
          return;
        }
        setKickState("done");
        if (!finishedRefreshRef.current) {
          finishedRefreshRef.current = true;
          router.refresh();
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setKickError(e instanceof Error ? e.message : "Could not start regeneration");
        setKickState("idle");
        kickedRef.current = false;
      }
    })();

    return () => {
      // Do not abort — let the job finish even if user navigates briefly
    };
  }, [autoStart, chainId, initialStatus, router]);

  // Poll progress every 1s for live coverage
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/chains/${chainId}/progress`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) timer = setTimeout(poll, 1500);
          return;
        }
        const json = (await res.json()) as ProgressResponse;
        if (cancelled) return;
        setData(json);
        if (json.status === "GENERATING" || json.status === "SENDING") {
          setKickState((s) => (s === "starting" || s === "idle" ? "running" : s));
        }
        if (
          json.status !== "GENERATING" &&
          json.status !== "SENDING" &&
          (json.progress?.finished || true)
        ) {
          if (!finishedRefreshRef.current) {
            finishedRefreshRef.current = true;
            router.refresh();
          }
          return;
        }
      } catch {
        /* keep polling */
      }
      if (!cancelled) timer = setTimeout(poll, 1000);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chainId, router]);

  useEffect(() => {
    const t = setInterval(() => setTipTick((n) => n + 1), 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const progress = data?.progress;
  const tips = data?.tips?.length ? data.tips : ENGAGEMENT_TIPS;
  const rotatingTip =
    progress?.tip || tips[tipTick % tips.length] || tips[0]!;
  const serverTip = progress?.tip;
  const showTip = tipTick % 2 === 0 ? rotatingTip : serverTip || rotatingTip;

  // Stabilize steps reference for hooks (avoid new [] every render)
  const steps = progress?.steps;
  const stepList = useMemo(() => steps ?? [], [steps]);
  const pct = progress?.pct ?? (kickState === "starting" ? 4 : 5);
  const headline =
    progress?.headline ||
    (initialStatus === "SENDING"
      ? "Sending to vendor…"
      : kickState === "starting"
        ? "Starting regeneration…"
        : "Generating resumes…");
  const detail =
    progress?.detail ||
    (kickError
      ? kickError
      : "Live steps update as the engine writes title, stack, env, and bullets.");

  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  const timeLabel = `${mm}:${ss.toString().padStart(2, "0")}`;

  const activeStep = useMemo(
    () => stepList.find((s) => s.status === "active"),
    [stepList]
  );

  const statusLabel = data?.status || initialStatus;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-sky-50 shadow-soft"
      role="status"
      aria-live="polite"
      aria-busy
    >
      <div className="border-b border-violet-100/80 bg-white/60 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
              Live generation
              <span className="ml-1 rounded-full bg-violet-600/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-violet-800">
                {statusLabel}
              </span>
            </p>
            <h3 className="mt-1 text-[16px] font-semibold tracking-tight text-[#1d1d1f]">
              {headline}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[#6e6e73]">
              {detail}
            </p>
            {progress?.candidateName ? (
              <p className="mt-1 text-[12px] font-medium text-violet-900/80">
                Candidate: {progress.candidateName}
                {progress.candidateTotal
                  ? ` · ${(progress.candidateIndex ?? 0) + 1}/${progress.candidateTotal}`
                  : ""}
              </p>
            ) : null}
            {kickError ? (
              <p className="mt-2 text-[12.5px] font-medium text-red-700">
                {kickError} — try Recover, then Regenerate again.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-violet-600 px-3 py-1 text-[12px] font-semibold tabular-nums text-white">
              {pct}%
            </span>
            <span className="text-[11px] tabular-nums text-[#86868b]">
              {timeLabel} elapsed
            </span>
            {typeof data?.packsReady === "number" ? (
              <span className="text-[11px] text-[#86868b]">
                {data.packsReady}/{data.candidateCount || "?"} packs ready
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-sky-500 transition-all duration-700"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      </div>

      <div className="border-b border-violet-100/70 bg-violet-600/[0.04] px-5 py-3 sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700/80">
          Right now
        </p>
        <p className="mt-0.5 flex items-start gap-2 text-[13.5px] font-medium text-[#1d1d1f]">
          <Loader2
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-600"
            strokeWidth={2.25}
          />
          <span>
            {activeStep?.label ||
              showTip ||
              "Waiting on the AI to finish this pass…"}
          </span>
        </p>
        <p className="mt-1.5 pl-6 text-[12.5px] leading-snug text-[#6e6e73]">
          {showTip}
        </p>
      </div>

      {stepList.length > 0 ? (
        <ul className="max-h-72 space-y-0.5 overflow-y-auto px-3 py-3 sm:px-4">
          {stepList.map((step) => (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[12.5px]",
                step.status === "active" && "bg-violet-500/[0.08]",
                step.status === "error" && "bg-red-500/[0.06]"
              )}
            >
              {step.status === "done" ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
              ) : step.status === "active" ? (
                <Loader2
                  className="h-5 w-5 animate-spin text-violet-600"
                  strokeWidth={2}
                />
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
                  step.status === "pending" && "text-[#a1a1a6]",
                  step.status === "error" && "font-medium text-red-700"
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-4 text-[12.5px] text-[#86868b] sm:px-6">
          Connecting to live progress… checklist appears as soon as the engine
          starts writing.
        </div>
      )}

      <div className="border-t border-violet-100/80 bg-white/50 px-5 py-2.5 text-[11px] text-[#86868b] sm:px-6">
        Updates every second. Leave this tab open until status is Ready — then
        review packs and Send.
      </div>
    </div>
  );
}
