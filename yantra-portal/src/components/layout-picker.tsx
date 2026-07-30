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
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ${className}`}>
      <a
        href={previewHref(layoutId, "html")}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
        onClick={(e) => e.stopPropagation()}
      >
        Preview
      </a>
      <span className="text-slate-300">|</span>
      <a
        href={previewHref(layoutId, "docx")}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
        onClick={(e) => e.stopPropagation()}
      >
        DOCX
      </a>
      <span className="text-slate-300">|</span>
      <a
        href={previewHref(layoutId, "pdf")}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
        onClick={(e) => e.stopPropagation()}
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
    <div className="space-y-2">
      <Label htmlFor={name}>Resume layout template</Label>
      <p className="text-xs text-slate-500">
        Assigned at candidate profile so each person generates a distinct look &amp; feel. Use{" "}
        <strong>Preview / DOCX / PDF</strong> links to sample each layout before assigning.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {RESUME_LAYOUTS.map((l) => (
          <label
            key={l.id}
            className="flex cursor-pointer gap-2 rounded-lg border p-3 text-sm hover:bg-slate-50 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50"
          >
            <input
              type="radio"
              name={name}
              value={l.id}
              defaultChecked={defaultValue === l.id}
              className="mt-1"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{l.name}</span>
              <span className="block text-xs text-slate-500">{l.tagline}</span>
              <span className="mt-1 block text-[11px] font-semibold text-slate-700">
                Structure:{" "}
                {l.id === "ats_classic"
                  ? "Canonical checklist (Summary→Skills→Experience→Edu)"
                  : l.id === "executive_serif"
                    ? "Minto pyramid (Answer→Wins→Engagements→Cred)"
                    : l.id === "technical_dense"
                      ? "Stack-first spec (Matrix→Systems→Deep-dives)"
                      : l.id === "timeline_progressive"
                        ? "Growth narrative (Arc→Chapters→Milestones)"
                        : l.id === "modern_minimal"
                          ? "Proof-first dense (Pitch→Keywords→Work)"
                          : "SCQA case deck (Situation→Outcomes→Cases)"}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-600">
                Aura:{" "}
                {l.id === "ats_classic"
                  ? "Corporate · Portal-safe"
                  : l.id === "executive_serif"
                    ? "Executive · Refined serif"
                    : l.id === "technical_dense"
                      ? "Dark tech · Engineer"
                      : l.id === "timeline_progressive"
                        ? "Green growth · Timeline"
                        : l.id === "modern_minimal"
                          ? "Huge type · Airy minimal"
                          : "Bold copper band · Impact"}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-400">Best for: {l.bestFor}</span>
              <span className="mt-2 block" onClick={(e) => e.preventDefault()}>
                <LayoutExportLinks layoutId={l.id} />
              </span>
            </span>
          </label>
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
    <div className="space-y-2">
      <Label htmlFor={name}>Export format</Label>
      <p className="text-xs text-slate-500">
        What files are produced when a chain generates resumes for this candidate.
      </p>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
      >
        <option value="DOCX">DOCX only (default — most vendors)</option>
        <option value="DOCX_PDF">DOCX + PDF (both)</option>
      </select>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Sample exports:</span>
        <a
          href={previewHref(layoutIdForPreview, "docx")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
        >
          DOCX
        </a>
        <a
          href={previewHref(layoutIdForPreview, "pdf")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
        >
          PDF
        </a>
        <a
          href={previewHref(layoutIdForPreview, "html")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
        >
          HTML preview
        </a>
        <span className="text-slate-400">(uses selected layout when saved on profile)</span>
      </div>
    </div>
  );
}
