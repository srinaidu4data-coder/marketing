"use client";

import { useState, useTransition } from "react";
import { Button, Label, Textarea } from "@/components/ui";
import {
  resetBulletBankToDefault,
  saveBulletBank,
} from "@/app/actions/bullet-bank";

export function BulletBankForm({
  initialRaw,
  initialCount,
  defaultCount,
}: {
  initialRaw: string;
  initialCount: number;
  defaultCount: number;
}) {
  const [raw, setRaw] = useState(initialRaw);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const lineCount = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[•\-–*\d.)\s]+/, "").trim())
    .filter((l) => l.length >= 12).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-sm text-violet-950">
        <p className="font-semibold">Mission-critical padding bank</p>
        <p className="mt-1 text-[13px] leading-relaxed text-violet-900/90">
          When a project or summary is thin, the engine picks distinct lines from
          this bank instead of garbage like{" "}
          <em>
            “Delivered measurable outcomes for Company aligned to engagement goals
            (9/10)”
          </em>
          . Lines should be <strong>skill-neutral</strong> (delivery, UAT, cutover,
          workshops, controls) so they work across BRIM, FICO, EWM, etc. The LLM
          also receives a sample of this bank in the user message.
        </p>
        <p className="mt-2 text-[12px] text-violet-800">
          Loaded: <strong>{initialCount}</strong> bullets · Defaults:{" "}
          <strong>{defaultCount}</strong> · Editor estimate:{" "}
          <strong>{lineCount}</strong>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bulletBank">Bullet bank (JSON array or one per line)</Label>
        <Textarea
          id="bulletBank"
          name="bulletBank"
          rows={22}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="font-mono text-[11px] leading-relaxed"
          spellCheck={false}
        />
      </div>

      {err ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            setErr("");
            setMsg("");
            start(async () => {
              const fd = new FormData();
              fd.set("bulletBank", raw);
              const r = await saveBulletBank(fd);
              if (!r.ok) setErr(r.error);
              else setMsg(`Saved ${r.count} skill-neutral bullets.`);
            });
          }}
        >
          {pending ? "Saving…" : "Save bullet bank"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setErr("");
            setMsg("");
            start(async () => {
              const r = await resetBulletBankToDefault();
              if (!r.ok) setErr(r.error);
              else {
                setMsg(`Reset to ${r.count} default bullets. Reload page to see them.`);
                window.location.reload();
              }
            });
          }}
        >
          Reset to 100 defaults
        </Button>
      </div>
    </div>
  );
}
