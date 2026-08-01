"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSystemSettings } from "@/app/actions/settings";
import { Button, Input, Label } from "@/components/ui";
import type { SystemConfig } from "@/lib/system-settings";
import type { ResumeLayoutId } from "@/lib/resume/templates";

type LayoutOption = { id: ResumeLayoutId | string; name: string };

export function SystemSettingsForm({
  config,
  layouts,
}: {
  config: SystemConfig;
  layouts: LayoutOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="grid max-w-2xl gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // checkbox: ensure key present when checked
        const allow = (e.currentTarget.elements.namedItem(
          "allowEmployeeSelfChains"
        ) as HTMLInputElement | null)?.checked;
        fd.set("allowEmployeeSelfChains", allow ? "true" : "false");
        setError(null);
        setSuccess(null);
        start(async () => {
          const res = await saveSystemSettings(fd);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setSuccess("Settings saved.");
          router.refresh();
        });
      }}
    >
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

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">Organization</legend>
        <div className="space-y-1">
          <Label htmlFor="companyName">Company name</Label>
          <Input
            id="companyName"
            name="companyName"
            required
            defaultValue={config.companyName}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="supportEmail">Support / admin email</Label>
          <Input
            id="supportEmail"
            name="supportEmail"
            type="email"
            required
            defaultValue={config.supportEmail}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">Resume defaults</legend>
        <p className="text-xs text-slate-500">
          Applied when creating new candidates (can still override per candidate).
        </p>
        <div className="space-y-1">
          <Label htmlFor="defaultLayoutId">Default layout</Label>
          <select
            id="defaultLayoutId"
            name="defaultLayoutId"
            defaultValue={config.defaultLayoutId}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="defaultExportFormat">Default export format</Label>
          <select
            id="defaultExportFormat"
            name="defaultExportFormat"
            defaultValue={config.defaultExportFormat}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="DOCX">DOCX only</option>
            <option value="DOCX_PDF">DOCX + PDF</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">Operations & cost</legend>
        <div className="space-y-1">
          <Label htmlFor="dailyAiCostCapUsd">Daily AI cost cap (USD)</Label>
          <Input
            id="dailyAiCostCapUsd"
            name="dailyAiCostCapUsd"
            type="number"
            min={0}
            step={0.01}
            required
            defaultValue={config.dailyAiCostCapUsd}
          />
          <p className="text-xs text-slate-500">
            Tracked against ApiUsageLog on Analytics. Soft policy reference for operators.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="allowEmployeeSelfChains"
            defaultChecked={config.allowEmployeeSelfChains}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Allow employees to create chains</span>
            <span className="block text-xs text-slate-500">
              When off, only admins can create marketing chains (policy flag for future enforcement).
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          Resume engine sequence
        </legend>
        <p className="text-xs text-slate-600">
          Order engines try top-to-bottom. If the first fails (e.g. no OpenAI key or API
          error), the next runs.{" "}
          <strong>AI Tailor</strong> = OpenAI pack.{" "}
          <strong>Progressive Rules</strong> = rules backup (same assembly, no model).
        </p>
        <div className="space-y-1">
          <Label htmlFor="resumeEngineSequence">Sequence (comma-separated)</Label>
          <Input
            id="resumeEngineSequence"
            name="resumeEngineSequence"
            defaultValue={config.resumeEngineSequenceRaw}
            placeholder="ai-tailor,progressive-rules"
          />
          <p className="text-xs text-slate-500">
            Allowed ids:{" "}
            <code className="rounded bg-white px-1">ai-tailor</code>,{" "}
            <code className="rounded bg-white px-1">progressive-rules</code>
            . Examples:{" "}
            <code className="rounded bg-white px-1">ai-tailor,progressive-rules</code>{" "}
            (recommended) ·{" "}
            <code className="rounded bg-white px-1">progressive-rules,ai-tailor</code>{" "}
            ·{" "}
            <code className="rounded bg-white px-1">ai-tailor</code> only.
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          Resume engine policy (admin-maintained)
        </legend>
        <p className="text-xs text-slate-600">
          Domain detection rules, off-domain bans, bullet/skill caps, progressive title templates,
          emergency fill lines, and critical phrase patterns.{" "}
          <strong>No domain packs are hardcoded in code</strong> — edit this JSON and Save.
          Invalid regex patterns are rejected on save.
        </p>
        <div className="space-y-1">
          <Label htmlFor="resumeEnginePolicyJson">Policy JSON</Label>
          <textarea
            id="resumeEnginePolicyJson"
            name="resumeEnginePolicyJson"
            rows={18}
            spellCheck={false}
            defaultValue={config.resumeEnginePolicyJson}
            className="w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 font-mono text-[12px] leading-relaxed text-[#1d1d1f] shadow-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0071e3]/25"
          />
          <p className="text-xs text-slate-500">
            Keys include{" "}
            <code className="rounded bg-white px-1">domainRules</code>,{" "}
            <code className="rounded bg-white px-1">offDomainRules</code>,{" "}
            <code className="rounded bg-white px-1">bullets</code>,{" "}
            <code className="rounded bg-white px-1">skillCaps</code>,{" "}
            <code className="rounded bg-white px-1">progressiveTitleTemplates</code>,{" "}
            <code className="rounded bg-white px-1">emergencyBullets</code>,{" "}
            <code className="rounded bg-white px-1">criticalPhrasePatterns</code>,{" "}
            <code className="rounded bg-white px-1">methodologyDefaults</code>.{" "}
            Education is master-only (not{" "}
            <code className="rounded bg-white px-1">educationDefaults</code>).
          </p>
        </div>
      </fieldset>

      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
