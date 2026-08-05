/**
 * Remove internal Role Forge engine footers + pollution labels from
 * vendor-facing resume text (preview, TXT, DOCX rebuilds).
 * Vendors must never see "AI / model / ATS dual" provenance or
 * "JD focus phrases:" / "JD keywords:" engine dumps.
 */

import {
  ENGINE_POLLUTION_BULLET_RE,
  isEnginePollutionLine,
  stripEnginePollutionLabel,
} from "./engine-pollution";

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
    /(ATS|Psych|Mode|gpt-|Projects|claude)/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Strip engine footers + pollution labels from plain resume text. */
export function stripEngineFooter(text: string): string {
  if (!text) return text;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (isEngineFooterLine(line)) continue;
    if (ENGINE_POLLUTION_BULLET_RE.test(line.trim())) continue;
    if (isEnginePollutionLine(line)) {
      const recovered = stripEnginePollutionLabel(line);
      if (recovered) kept.push(recovered);
      continue;
    }
    // Mid-line pollution (label embedded in skills prose)
    if (/\bJD\s+focus|\bJD\s+keywords?|\bDelivery\s+focus|\bShip[- ]?floor\s+skills?/i.test(line)) {
      const recovered = stripEnginePollutionLabel(line);
      if (recovered) kept.push(recovered);
      continue;
    }
    kept.push(line);
  }
  // Drop trailing blank lines left after footer removal
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return kept.join("\n") + (kept.length ? "\n" : "");
}
