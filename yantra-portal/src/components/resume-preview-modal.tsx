"use client";

/**
 * Full-screen-friendly resume preview — fixed centered modal so the full
 * document (including the top) is always scrollable.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { Eye, X } from "lucide-react";
import { stripEngineFooter } from "@/lib/resume/strip-engine-footer";

function countBullets(text: string): number {
  return (text.match(/^[•\-\u2022*]\s+/gm) || []).length;
}

export function ResumePreviewModal({
  candidateName,
  role,
  text,
  atsScore,
  psychScore,
}: {
  candidateName: string;
  role: string;
  text: string;
  atsScore: number;
  psychScore: number;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const cleanText = stripEngineFooter(text || "");

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 text-[12.5px] font-semibold text-[#0071e3] shadow-soft transition hover:bg-[#f5f5f7]"
      >
        <Eye className="h-3.5 w-3.5" strokeWidth={2.25} />
        Preview
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          {/* Backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label="Close preview"
            onClick={close}
          />

          {/* Panel — constrained to viewport; body scrolls independently */}
          <div className="relative z-10 flex h-[min(88vh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-float">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.06] bg-[#fafafa] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p
                  id={titleId}
                  className="truncate text-[14px] font-semibold text-[#1d1d1f]"
                >
                  {candidateName}
                </p>
                <p className="truncate text-[12px] text-[#86868b]">{role}</p>
                <p className="mt-0.5 text-[11px] tabular-nums text-[#86868b]">
                  ATS {atsScore} · Psych {psychScore} ·{" "}
                  {cleanText.length.toLocaleString()} chars ·{" "}
                  {countBullets(cleanText)} bullets
                </p>
                {/Tech Stack:|Environment:|PROFESSIONAL SUMMARY/i.test(
                  cleanText
                ) ? (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                    Structure: summary · skills · projects (v2-style)
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#6e6e73] shadow-soft hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </header>

            {/* Scroll region starts at top of resume content */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <pre className="whitespace-pre-wrap p-4 text-[12.5px] leading-relaxed text-[#1d1d1f] sm:p-5">
                {cleanText}
              </pre>
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-black/[0.06] bg-[#fafafa] px-4 py-2.5 text-[11px] text-[#86868b] sm:px-5">
              <span>Scroll to read full resume · Esc to close</span>
              <button
                type="button"
                onClick={close}
                className="rounded-full px-3 py-1 font-semibold text-[#0071e3] hover:bg-[#0071e3]/[0.08]"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
