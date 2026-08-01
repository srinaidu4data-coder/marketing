"use client";

import { RESUME_LAYOUTS } from "@/lib/resume/templates";
import { Label } from "@/components/ui";

function previewHref(layoutId: string, fmt: "html" | "docx" | "pdf") {
  return `/api/layouts/preview?layoutId=${encodeURIComponent(layoutId)}&fmt=${fmt}`;
}

/** Hyperlinks to sample layout exports (open in new tab) */
export function LayoutExportLinks({
  layoutId,
  className = "",
}: {
  layoutId: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] ${className}`}
    >
      <a
        href={previewHref(layoutId, "html")}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[#0071e3] hover:text-[#0077ed]"
      >
        Preview
      </a>
      <span className="text-[#d2d2d7]" aria-hidden>
        ·
      </span>
      <a
        href={previewHref(layoutId, "docx")}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[#0071e3] hover:text-[#0077ed]"
      >
        DOCX
      </a>
      <span className="text-[#d2d2d7]" aria-hidden>
        ·
      </span>
      <a
        href={previewHref(layoutId, "pdf")}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[#0071e3] hover:text-[#0077ed]"
      >
        PDF
      </a>
    </span>
  );
}

export function LayoutPicker({
  name = "layoutId",
  defaultValue = "ats_classic",
}: {
  name?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-2.5">
      <Label htmlFor={name}>Resume layout</Label>
      <p className="text-[12.5px] leading-relaxed text-[#86868b]">
        Distinct look per person. Sample with Preview · DOCX · PDF before assigning.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {RESUME_LAYOUTS.map((l) => (
          <div
            key={l.id}
            className="rounded-2xl border border-black/[0.06] bg-white shadow-soft transition-all duration-200 ease-apple has-[:checked]:border-[#0071e3]/35 has-[:checked]:bg-[#0071e3]/[0.04] has-[:checked]:ring-1 has-[:checked]:ring-[#0071e3]/20 hover:border-black/[0.1] hover:shadow-lift"
          >
            {/* Radio selection only — sample links live outside the label so clicks navigate */}
            <label className="flex cursor-pointer gap-2.5 p-3 pb-2 text-sm">
              <input
                type="radio"
                name={name}
                value={l.id}
                defaultChecked={defaultValue === l.id}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0071e3]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold tracking-tight text-[#1d1d1f]">
                  {l.name}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-[#6e6e73]">
                  {l.tagline}
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-[#86868b]">
                  {l.id === "ats_classic"
                    ? "Summary → Skills → Experience"
                    : l.id === "executive_serif"
                      ? "Answer → Wins → Engagements"
                      : l.id === "technical_dense"
                        ? "Matrix → Systems → Deep-dives"
                        : l.id === "timeline_progressive"
                          ? "Arc → Chapters → Milestones"
                          : l.id === "modern_minimal"
                            ? "Pitch → Keywords → Work"
                            : "Summary → Skills → Impact"}
                </span>
              </span>
            </label>
            {/* Align with label text (radio column width + gap), not magic padding */}
            <div className="flex gap-2.5 border-t border-black/[0.04] px-3 py-2">
              <span className="h-4 w-4 shrink-0" aria-hidden />
              <LayoutExportLinks layoutId={l.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExportFormatPicker({
  name = "exportFormat",
  defaultValue = "DOCX",
  layoutIdForPreview = "ats_classic",
}: {
  name?: string;
  defaultValue?: string;
  /** Layout used when previewing export formats (default sample layout) */
  layoutIdForPreview?: string;
}) {
  return (
    <div className="space-y-2.5">
      <Label htmlFor={name}>Export format</Label>
      <p className="text-[12.5px] leading-relaxed text-[#86868b]">
        Files produced when a chain generates packs for this person.
      </p>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="flex h-11 w-full rounded-xl border border-black/[0.08] bg-white px-3.5 text-[15px] text-[#1d1d1f] shadow-soft transition-all duration-200 ease-apple hover:border-black/[0.14] focus-visible:border-[#0071e3] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0071e3]/25"
      >
        <option value="DOCX">DOCX only — most vendors</option>
        <option value="DOCX_PDF">DOCX + PDF</option>
      </select>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.05] bg-[#fafafa] px-3.5 py-2.5 text-[12.5px] text-[#6e6e73]">
        <span className="font-medium text-[#1d1d1f]">Samples</span>
        <a
          href={previewHref(layoutIdForPreview, "docx")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#0071e3] hover:text-[#0077ed]"
        >
          DOCX
        </a>
        <a
          href={previewHref(layoutIdForPreview, "pdf")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#0071e3] hover:text-[#0077ed]"
        >
          PDF
        </a>
        <a
          href={previewHref(layoutIdForPreview, "html")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#0071e3] hover:text-[#0077ed]"
        >
          HTML
        </a>
        <span className="text-[#a1a1a6]">· samples use layout on profile</span>
      </div>
    </div>
  );
}
