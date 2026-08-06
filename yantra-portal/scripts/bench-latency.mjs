/**
 * Latency bench scaffold — run after wiring fixtures.
 * Usage: node scripts/bench-latency.mjs
 * Does not call live LLM unless BENCH_LIVE=1 and keys present.
 */
import { performance } from "node:perf_hooks";

const runs = Number(process.env.BENCH_RUNS || 10);
const results = [];

function pctl(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

async function coldWarmSimulate() {
  // Local CPU path: plain-text DOCX rebuild is the repeat-download path
  const { renderDocxFromPlainText } = await import(
    "../src/lib/resume/render-docx.ts"
  ).catch(() => ({ renderDocxFromPlainText: null }));

  const sample = `JANE DOE
SAP BASIS CONSULTANT
jane@example.com

PROFESSIONAL SUMMARY
• Delivered enterprise SAP landscape stability.
• Partnered with infrastructure teams on patch cycles.

TECHNICAL SKILLS
SAP BASIS · HANA · Linux · Oracle

PROFESSIONAL EXPERIENCE

SAP BASIS Consultant
Employer / Client: Acme Corp
Dallas, TX | 2020 – Present
Environment: SAP BASIS · HANA · Linux
• Hardened transport landscapes for quarterly releases.
• Orchestrated system copies for project cutovers.
`;

  if (!renderDocxFromPlainText) {
    console.log(
      JSON.stringify({
        note: "DOCX import needs tsx/build; reporting structure only",
        target: "repeat_download_rebuild_ms",
      })
    );
    return;
  }

  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const buf = await renderDocxFromPlainText({
      candidateName: "Jane Doe",
      jobTitle: "SAP BASIS Consultant",
      text: sample,
      layoutId: "ats_classic",
    });
    results.push({
      ms: performance.now() - t0,
      bytes: buf?.length || 0,
    });
  }

  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        metric: "docx_rebuild_from_text",
        runs,
        p50: pctl(ms, 50),
        p95: pctl(ms, 95),
        max: ms[ms.length - 1],
        mean: ms.reduce((a, b) => a + b, 0) / ms.length,
        avgBytes: results.reduce((a, r) => a + r.bytes, 0) / results.length,
      },
      null,
      2
    )
  );
}

coldWarmSimulate().catch((e) => {
  console.error(e);
  process.exit(1);
});
