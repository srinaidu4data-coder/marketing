/**
 * Never show engine/precheck/LLM technical failures to end users.
 */

const HIDDEN =
  /prompt-only|resume-v2|legacy fallback|empty or too short|ACTIVE prompt|LLM keys|precheck|ship-ready|Anthropic HTTP|OpenAI HTTP|schema:|diag:|Job description empty|Master resume too short|not ship-ready|regenerate-until|engines failed|RESUME_ENGINE|Employer\/Client|bullets \(need|No Employer|No pack generated|thin_bullets|missing pack/i;

/** Returns null if the message must not be shown in UI. */
export function toUserSafeError(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  if (HIDDEN.test(t)) return null;
  // Truncate long technical dumps
  if (t.length > 160 && /[{}error|stack|at ]/i.test(t)) return null;
  return t.slice(0, 200);
}

export function filterUserSafeErrors(messages: string[]): string[] {
  const out: string[] = [];
  for (const m of messages) {
    const safe = toUserSafeError(m);
    if (safe && !out.includes(safe)) out.push(safe);
  }
  return out.slice(0, 6);
}
