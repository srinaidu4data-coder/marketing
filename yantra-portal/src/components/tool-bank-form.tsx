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
    withYears?: number;
    timeless?: number;
    openEnded?: number;
    ranged?: number;
  };
  defaultStats: {
    total: number;
    byKind: Record<string, number>;
    recipes: number;
    withYears?: number;
    timeless?: number;
  };
}) {
  const [raw, setRaw] = useState(initialSectioned);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-950">
        <p className="font-semibold">Stack / Environment tool bank (with years)</p>
        <p className="mt-1 text-[13px] leading-relaxed text-emerald-900/90">
          Catalogs power Tech Stack, Environment, and Technical Skills. Each term
          can carry a <strong>year window</strong> so 1999 jobs never get FastAPI /
          Kubernetes.
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
            <strong>compliance / regulations</strong> → SOX, GDPR, DSCSA…
          </li>
        </ul>

        <div className="mt-3 rounded-lg border border-emerald-300/80 bg-white/70 p-3 font-mono text-[12px] leading-relaxed text-emerald-950">
          <p className="font-sans text-[12px] font-semibold text-emerald-900">
            Year syntax (one term per line)
          </p>
          <pre className="mt-1 whitespace-pre-wrap">{`SQL | timeless
Excel | timeless
FastAPI | 2018+
Kubernetes | 2015+
ECC | 2004-2027
S/4HANA | 2015+ | aliases: S4HANA, S4
Snowflake @2015+
Agile @timeless`}</pre>
          <p className="mt-2 font-sans text-[12px] text-emerald-800">
            <code className="rounded bg-emerald-100 px-1">timeless</code> = any
            era / any profile (BA, SAP, Oracle, Workday, Java, Data).{" "}
            <code className="rounded bg-emerald-100 px-1">2015+</code> = only if
            project end year ≥ 2015.{" "}
            <code className="rounded bg-emerald-100 px-1">2004-2027</code> = only
            inside that window.
          </p>
        </div>

        <p className="mt-2 text-[12px] text-emerald-800">
          Loaded: <strong>{stats.total}</strong> terms (
          {Object.entries(stats.byKind)
            .map(([k, v]) => `${k}:${v}`)
            .join(" · ")}
          )
          {typeof stats.timeless === "number" ? (
            <>
              {" "}
              · Timeless: <strong>{stats.timeless}</strong>
            </>
          ) : null}
          {typeof stats.withYears === "number" ? (
            <>
              {" "}
              · With years: <strong>{stats.withYears}</strong>
              {typeof stats.openEnded === "number"
                ? ` (${stats.openEnded} open-ended, ${stats.ranged ?? 0} ranged)`
                : ""}
            </>
          ) : null}
          {" "}
          · Recipes: <strong>{stats.recipes}</strong> · Defaults:{" "}
          <strong>{defaultStats.total}</strong>
          {typeof defaultStats.withYears === "number"
            ? ` (${defaultStats.withYears} dated, ${defaultStats.timeless ?? 0} timeless)`
            : ""}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="toolBank">
          Bank (sectioned text with years, or full JSON catalog)
        </Label>
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
                `Saved ${r.stats.total} terms · timeless ${r.stats.timeless ?? 0} · with years ${r.stats.withYears ?? 0} · ${Object.entries(
                  r.stats.byKind
                )
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
              setMsg(
                `Reset to defaults (${r.stats.total} terms, ${r.stats.withYears ?? 0} with years)`
              );
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
