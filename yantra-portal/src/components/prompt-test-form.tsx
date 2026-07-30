"use client";

import { useState, useTransition } from "react";
import { Button, Label, Textarea } from "@/components/ui";
import { runPromptTest } from "@/app/actions/templates";

export function PromptTestForm({ versionId }: { versionId: string }) {
  const [jd, setJd] = useState(
    "10+ years of functional SAP consulting experience with at least 1-2 end-to-end full life-cycle implementations of SAP ATTP as functional consultant.\nProven experience in leading functional workstreams in large-scale SAP transformation programs.\nDeep understanding of pharmaceutical supply chains, packaging, and aggregation processes.\nStrong knowledge of business process design and system implementation.\nHands-on expertise in GS1 standards (GTIN, GLN, SSCC), EPCIS messaging, and SAP integration architectures (EDI/ALE)."
  );
  const [master, setMaster] = useState(
    "Jane Smith — SAP FICO Consultant with 10 years GL, AP, AR, Asset Accounting experience."
  );
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    text: string;
    atsScore: number;
    atsReady: boolean;
    layoutId: string;
    jobTitle: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    startTransition(async () => {
      try {
        const res = await runPromptTest(versionId, jd, master);
        if (!res.ok) {
          setError(res.error || "Test failed");
          return;
        }
        setResult({
          text: res.text,
          atsScore: res.atsScore,
          atsReady: res.atsReady,
          layoutId: res.layoutId,
          jobTitle: res.jobTitle,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error running test");
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="jobRequirement">Sample job requirement</Label>
          <Textarea
            id="jobRequirement"
            name="jobRequirement"
            rows={6}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="masterResume">Sample master resume</Label>
          <Textarea
            id="masterResume"
            name="masterResume"
            rows={4}
            value={master}
            onChange={(e) => setMaster(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Running test…" : "Run Test"}
        </Button>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-emerald-900">Test result</span>
            <span
              className={
                result.atsReady
                  ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                  : "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
              }
            >
              ATS {result.atsScore}/100 {result.atsReady ? "READY" : "REVIEW"}
            </span>
            <span className="text-xs text-slate-500">Title: {result.jobTitle}</span>
            <span className="text-xs text-slate-500">Layout: {result.layoutId}</span>
            <a
              href={`/api/layouts/preview?layoutId=${encodeURIComponent(result.layoutId)}&fmt=html`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-sky-700 underline"
            >
              Open layout preview
            </a>
          </div>
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border bg-white p-3 text-xs leading-relaxed text-slate-800">
            {result.text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
