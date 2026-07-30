"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replaceMasterResume } from "@/app/actions/candidates";
import { Button, Input, Label } from "@/components/ui";

export function ReplaceResumeForm({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
            setSuccess(
              res.extracted
                ? `Replaced successfully. Extracted ${res.chars ?? 0} characters from ${res.fileName}.`
                : `File saved (${res.fileName}), but text extraction was limited — tailoring may use progressive defaults. ${res.warning || ""}`
            );
            if (input) input.value = "";
            setFileName("");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Network or server error on replace.");
          }
        });
      }}
    >
      <Label htmlFor="replace-resume">Replace Master Resume</Label>
      <p className="text-xs text-slate-500">
        Preferred: <strong>.docx</strong> or <strong>.txt</strong> so Role Forge can read employers,
        skills, and experience. PDF is best-effort.
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

      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Replacing…" : "Replace"}
      </Button>
    </form>
  );
}
