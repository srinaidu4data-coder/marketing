/**
 * Generation / download timing — no PII, no resume/JD bodies.
 * Correlation: chainId:ccId:attempt (or request id).
 */

export type PerfStage =
  | "accepted"
  | "job_started"
  | "prompt_built"
  | "llm_first_byte"
  | "llm_complete"
  | "json_validated"
  | "scores_complete"
  | "docx_start"
  | "docx_complete"
  | "pdf_start"
  | "pdf_complete"
  | "upload_complete"
  | "ready"
  | "download_request"
  | "cache_hit"
  | "cache_miss"
  | "response_first_byte"
  | "rebuild_docx"
  | "rebuild_pdf";

export type PerfTrace = {
  id: string;
  t0: number;
  marks: { stage: PerfStage; ms: number; detail?: string }[];
};

export function createPerfTrace(id: string): PerfTrace {
  return { id, t0: performance.now(), marks: [] };
}

export function mark(
  trace: PerfTrace | null | undefined,
  stage: PerfStage,
  detail?: string
): void {
  if (!trace) return;
  const ms = Math.round(performance.now() - trace.t0);
  trace.marks.push({ stage, ms, detail: detail?.slice(0, 120) });
}

/** Safe log line for operators (no secrets). */
export function flushPerfLog(
  trace: PerfTrace | null | undefined,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  if (!trace || process.env.PERF_LOG === "0") return;
  try {
    const payload = {
      corr: trace.id,
      totalMs: Math.round(performance.now() - trace.t0),
      stages: Object.fromEntries(trace.marks.map((m) => [m.stage, m.ms])),
      ...extra,
    };
    console.info("[perf]", JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function contentKeyParts(opts: {
  textHash: string;
  layoutId: string;
  format: string;
  renderer: string;
}): string {
  return `${opts.format}:${opts.layoutId}:${opts.renderer}:${opts.textHash.slice(0, 32)}`;
}

/** Fast non-crypto hash for content keys (not for security). */
export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
