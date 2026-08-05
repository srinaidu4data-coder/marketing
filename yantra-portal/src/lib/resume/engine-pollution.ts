/**
 * Human-visible engine labels that must NEVER appear in vendor packs.
 * Injected historically by AI tailor, ATS boost, research-enhance, or the model itself.
 */

/** Full-line labels (start of line) */
export const ENGINE_POLLUTION_LINE_RE =
  /^\s*(JD\s+focus(\s+phrases?)?|JD\s+keywords?|Delivery\s+focus|Ship[- ]?floor\s+skills?|Core\s*\/\s*JD[- ]aligned\s+skills?|Target\s+role|Methods\s+focus|ATS\s+boost|Engine\s+notes?)\s*:/i;

/** Inline / mid-line pollution fragments to strip from skill tokens */
export const ENGINE_POLLUTION_TOKEN_RE =
  /^(JD\s+focus(\s+phrases?)?|JD\s+keywords?|Delivery\s+focus|Ship[- ]?floor|Target\s+role)$/i;

/** Booster bullets that read as engine spam */
export const ENGINE_POLLUTION_BULLET_RE =
  /^[•\-–—*]\s*applied\s+.+\s+within\s+engagement\s+delivery/i;

export function isEnginePollutionLine(line: string): boolean {
  const t = (line || "").trim();
  if (!t) return false;
  if (ENGINE_POLLUTION_LINE_RE.test(t)) return true;
  if (ENGINE_POLLUTION_BULLET_RE.test(t)) return true;
  // Whole line is just the label with empty/garbage body
  if (/^JD\s+focus/i.test(t) && t.length < 80) return true;
  return false;
}

/**
 * Strip engine label prefixes; return null if nothing usable remains.
 * "JD focus phrases: SAP · FSCD" → try to recover "SAP · FSCD"
 * "JD focus phrases: during group consolidation" → null (soft duty garbage)
 */
export function stripEnginePollutionLabel(line: string): string | null {
  const t = (line || "").trim();
  if (!t) return null;
  if (ENGINE_POLLUTION_BULLET_RE.test(t)) return null;

  if (ENGINE_POLLUTION_LINE_RE.test(t)) {
    const body = t.replace(/^[^:]+:\s*/, "").trim();
    if (!body) return null;
    // Soft duty / sentence bodies are not skills
    if (
      /^(during|while|when|for|with|and|the|a|an)\b/i.test(body) ||
      (body.split(/\s+/).length >= 4 && !/[·|,]/.test(body) && !/\b(SAP|FSCD|ATTP|EPCIS|HANA|ABAP|API|RAR|IFRS|Agile)\b/i.test(body))
    ) {
      return null;
    }
    // Prefer Core: for recovered skill banks
    if (/[·|,]/.test(body) || /\b(SAP|FSCD|ATTP|EPCIS|HANA|S\/4|ABAP|API)\b/i.test(body)) {
      return body.includes(":") ? body : `Core: ${body}`;
    }
    return null;
  }

  // Inline "… JD focus phrases: …" mid-string corruption
  if (/\bJD\s+focus(\s+phrases?)?\s*:/i.test(t) || /\bJD\s+keywords?\s*:/i.test(t)) {
    const cleaned = t
      .replace(/\bJD\s+focus(\s+phrases?)?\s*:\s*/gi, "")
      .replace(/\bJD\s+keywords?\s*:\s*/gi, "")
      .replace(/\bDelivery\s+focus\s*:\s*/gi, "")
      .replace(/\bShip[- ]?floor\s+skills?\s*:\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned.length > 2 ? cleaned : null;
  }

  return t;
}

/** Drop pollution tokens from a ·-separated skills bank */
export function filterEnginePollutionTokens(tokens: string[]): string[] {
  return tokens.filter((t) => {
    const s = t.trim();
    if (!s) return false;
    if (ENGINE_POLLUTION_TOKEN_RE.test(s)) return false;
    if (/^jd\s+focus/i.test(s)) return false;
    if (/^delivery\s+focus/i.test(s)) return false;
    return true;
  });
}
