"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replaceMasterResume } from "@/app/actions/candidates";
import { Button, Input, Label } from "@/components/ui";
import type { MasterValidationReport } from "@/lib/resume/master-pack-validate";

export function ReplaceResumeForm({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validation, setValidation] = useState<MasterValidationReport | null>(
    null
  );
  const [fileName, setFileName] = useState<string>("");
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3 border-t pt-3"
      encType="multipart/form-data"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setValidation(null);
        const input = inputRef.current;
        const file = input?.files?.[0];
        if (!file) {
          setError("Choose a resume file first (.docx, .txt, or .pdf).");
          return;
        }
        if (file.size === 0) {
          setError("The selected file is empty.");
          return;
        }
        if (file.size > 15 * 1024 * 1024) {
          setError("File is too large (max 15 MB).");
          return;
        }

        const fd = new FormData();
        fd.set("resume", file);

        start(async () => {
          try {
            const res = await replaceMasterResume(candidateId, fd);
            if (!res?.ok) {
              setError(res?.error || "Replace failed — try again.");
              return;
            }
            const v = res.validation;
            setValidation(v || null);
            if (res.extracted) {
              setSuccess(
                v
                  ? `Replaced · ${res.chars ?? 0} chars · profile score ${v.score}% · ${v.engagementCount} engagement(s) · ${v.summary.pass} pass / ${v.summary.warn} warn / ${v.summary.fail} fail`
                  : `Replaced successfully. Extracted ${res.chars ?? 0} characters · ${res.engagementCount ?? 0} engagement(s).`
              );
            } else {
              setSuccess(
                `File saved (${res.fileName}), but text extraction was limited. ${res.warning || ""}`
              );
            }
            if (input) input.value = "";
            setFileName("");
            router.refresh();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Network or server error on replace."
            );
          }
        });
      }}
    >
      <Label htmlFor="replace-resume">Replace Master Resume</Label>
      <p className="text-xs text-slate-500">
        Preferred: <strong>.docx</strong> or <strong>.txt</strong> so Role Forge can read
        employers, skills, dates, titles, and bullets into a full ground-truth checklist.
        PDF is best-effort.
      </p>
      <Input
        id="replace-resume"
        ref={inputRef}
        name="resume"
        type="file"
        required
        accept=".txt,.doc,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setFileName(f ? `${f.name} (${Math.round(f.size / 1024)} KB)` : "");
          setError(null);
          setSuccess(null);
          setValidation(null);
        }}
      />
      {fileName ? (
        <p className="text-xs font-medium text-slate-700">Selected: {fileName}</p>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {validation ? (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[12px]">
          <div className="font-semibold text-[#1d1d1f]">
            Validation checklist (upload-time ground truth)
          </div>
          <ul className="space-y-1">
            {validation.checks
              .filter((c) => c.severity !== "pass" || c.group !== "engagement")
              .slice(0, 40)
              .map((c) => (
                <li
                  key={c.id}
                  className={
                    c.severity === "fail"
                      ? "text-red-700"
                      : c.severity === "warn"
                        ? "text-amber-800"
                        : "text-emerald-800"
                  }
                >
                  {c.severity === "pass" ? "✓" : c.severity === "warn" ? "⚠" : "✗"}{" "}
                  <strong>{c.label}</strong>: {c.detail}
                </li>
              ))}
          </ul>
          {validation.engagements.length > 0 ? (
            <div className="border-t border-black/[0.05] pt-2 text-[#6e6e73]">
              {validation.engagements.map((e) => (
                <div key={e.index} className="py-0.5">
                  <span className="font-medium text-[#1d1d1f]">
                    {e.index + 1}. {e.client.split(",")[0]}
                  </span>{" "}
                  {e.startYear}–{e.endYear}
                  {e.location ? ` · ${e.location}` : ""} · {e.title} ·{" "}
                  {e.bulletCount} bullets
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-[11px] text-[#86868b]">
            Full matrix is on this page under Ground-truth validation after refresh.
          </p>
        </div>
      ) : null}

      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Replacing…" : "Replace"}
      </Button>
    </form>
  );
}
