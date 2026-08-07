"use client";

import { useState, useTransition } from "react";
import { Button, Label, Textarea } from "@/components/ui";
import {
  resetToolBankToDefault,
  saveToolBank,
} from "@/app/actions/tool-bank";

export function ToolBankForm({
  initialSectioned,
  stats,
  defaultStats,
}: {
  initialSectioned: string;
  stats: {
    total: number;
    byKind: Record<string, number>;
    recipes: number;
  };
  defaultStats: {
    total: number;
    byKind: Record<string, number>;
    recipes: number;
  };
}) {
  const [raw, setRaw] = useState(initialSectioned);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-950">
        <p className="font-semibold">Stack / Environment engine bank</p>
        <p className="mt-1 text-[13px] leading-relaxed text-emerald-900/90">
          Four <strong>disjoint</strong> catalogs power Tech Stack, Environment,
          and Technical Skills after every LLM pass:
        </p>
        <ul className="mt-2 list-inside list-disc text-[13px] text-emerald-900/90">
          <li>
            <strong>tools</strong> → Tech Stack (products you delivered)
          </li>
          <li>
            <strong>platforms</strong> → Environment (cloud, collab, landscapes)
          </li>
          <li>
            <strong>processes</strong> → delivery methods (Agile, UAT, cutover…)
          </li>
          <li>
            <strong>compliance / regulations</strong> → control frameworks &amp;
            legal regimes (SOX, GDPR, DSCSA…)
          </li>
        </ul>
        <p className="mt-2 text-[13px] text-emerald-900/90">
          The engine assigns <em>different</em> era-true sets per project (Jaccard
          anti-clone). AI may invent anything; bank classifies, pads, and strips
          overlap. No term may appear in two sections.
        </p>
        <p className="mt-2 text-[12px] text-emerald-800">
          Loaded: <strong>{stats.total}</strong> terms (
          {Object.entries(stats.byKind)
            .map(([k, v]) => `${k}:${v}`)
            .join(" · ")}
          ) · Recipes: <strong>{stats.recipes}</strong> · Defaults:{" "}
          <strong>{defaultStats.total}</strong> terms / {defaultStats.recipes}{" "}
          recipes
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="toolBank">Bank (sectioned text or full JSON)</Label>
        <Textarea
          id="toolBank"
          name="toolBank"
          rows={28}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </div>

      {err ? (
        <p className="text-sm text-red-700" role="alert">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="text-sm text-emerald-800" role="status">
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
              fd.set("toolBank", raw);
              const r = await saveToolBank(fd);
              if (!r.ok) {
                setErr(r.error);
                return;
              }
              setMsg(
                `Saved ${r.stats.total} terms · ${Object.entries(r.stats.byKind)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(", ")}`
              );
            });
          }}
        >
          {pending ? "Saving…" : "Save tool bank"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setErr("");
            setMsg("");
            start(async () => {
              const r = await resetToolBankToDefault();
              if (!r.ok) {
                setErr(r.error);
                return;
              }
              setMsg(`Reset to defaults (${r.stats.total} terms)`);
              // Reload page data via full navigation
              window.location.reload();
            });
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
