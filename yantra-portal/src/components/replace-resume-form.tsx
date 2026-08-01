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
      className="space-y-3.5 border-t border-black/[0.05] pt-5"
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
      <div>
        <Label htmlFor="replace-resume">Replace master</Label>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#86868b]">
          Prefer <strong className="font-semibold text-[#6e6e73]">.docx</strong> or{" "}
          <strong className="font-semibold text-[#6e6e73]">.txt</strong> so employers,
          dates, and bullets parse cleanly. PDF is best-effort.
        </p>
      </div>
      <div className="rounded-2xl border border-dashed border-black/[0.1] bg-[#fafafa]/80 px-3 py-3 transition-colors hover:border-black/[0.14]">
        <Input
          id="replace-resume"
          ref={inputRef}
          name="resume"
          type="file"
          required
          accept=".txt,.doc,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="border-0 bg-transparent shadow-none file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3.5 file:py-1.5 file:text-[12px] file:font-semibold file:shadow-soft hover:border-0 focus-visible:ring-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFileName(f ? `${f.name} (${Math.round(f.size / 1024)} KB)` : "");
            setError(null);
            setSuccess(null);
            setValidation(null);
          }}
        />
      </div>
      {fileName ? (
        <p className="text-[12.5px] font-medium text-[#1d1d1f]">Selected · {fileName}</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200/80 bg-red-50/90 px-3.5 py-2.5 text-[13.5px] text-red-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-3.5 py-2.5 text-[13.5px] text-emerald-900">
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

      <Button type="submit" variant="soft" disabled={pending} className="w-fit">
        {pending ? "Replacing…" : "Replace master"}
      </Button>
    </form>
  );
}
