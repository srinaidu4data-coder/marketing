/**
 * Remove internal Role Forge engine footers from vendor-facing resume text.
 * Vendors must never see "AI / model / ATS dual" provenance lines.
 */

const FOOTER_LINE =
  /^[\s]*[—–\-−-]+\s*Role\s*Forge(\s+AI)?\b.*$/i;

/** True if a single line is an engine/audit footer */
export function isEngineFooterLine(line: string): boolean {
  const t = (line || "").trim();
  if (!t) return false;
  if (FOOTER_LINE.test(t)) return true;
  // Compact variants without leading dashes
  if (
    /^Role\s*Forge(\s+AI)?\s*[·|•]/i.test(t) &&
    /(ATS|Psych|Mode|gpt-|Projects)/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Strip engine footers from plain resume text (preview, TXT, rebuilds). */
export function stripEngineFooter(text: string): string {
  if (!text) return text;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (isEngineFooterLine(line)) continue;
    kept.push(line);
  }
  // Drop trailing blank lines left after footer removal
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return kept.join("\n") + (kept.length ? "\n" : "");
}
