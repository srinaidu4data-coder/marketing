/**
 * Tech Stack + Environment: NOUN tools only (no JD requirement phrases).
 * Scrubs pollution like "candidate must have 15+", "Hands-on expertise in DP".
 */

/** Known product/tool nouns (case-insensitive match). */
export const TOOL_NOUN_ALLOW = [
  "SAP",
  "IBP",
  "BRIM",
  "FI-CA",
  "FICA",
  "FICO",
  "RTR",
  "S/4HANA",
  "S4HANA",
  "HANA",
  "ECC",
  "BW",
  "BPC",
  "BW/4HANA",
  "MDG",
  "MDM",
  "EWM",
  "WM",
  "TM",
  "PP",
  "QM",
  "MM",
  "SD",
  "OTC",
  "PTP",
  "P2P",
  "O2C",
  "SOM",
  "RAR",
  "CPI",
  "PI",
  "PO",
  "CPI/PI",
  "BTP",
  "CIDS",
  "C4C",
  "CRM",
  "SAC",
  "Datasphere",
  "DataSphere",
  "Ariba",
  "Concur",
  "SuccessFactors",
  "OpenText",
  "VIM",
  "Coupa",
  "Vertex",
  "Jira",
  "JIRA",
  "ServiceNow",
  "Service Now",
  "HP ALM",
  "ALM",
  "DevOps",
  "Azure",
  "AWS",
  "GCP",
  "SolMan",
  "Solution Manager",
  "GTS",
  "BAPI",
  "IDoc",
  "IDOC",
  "ODATA",
  "OData",
  "REST",
  "SOAP",
  "ABAP",
  "Fiori",
  "UI5",
  "WebDynpro",
  "Tableau",
  "Power BI",
  "Snowflake",
  "Kafka",
  "MuleSoft",
  "Boomi",
  "Informatica",
  "Public Cloud",
  "Private Cloud",
  "RISE",
  "BDC",
  "DP",
  "S&OP",
  "SOP",
  "Excel",
  "MS Office",
] as const;

const PHRASE_POISON =
  /\b(must|should|candidate|hands[- ]?on|expertise|experience|strong|preferred|required|proficient|knowledge|ability|responsible|between|implementation or|support of|years?|15\+|\d+\+|looking for|good understanding)\b/i;

const MAX_TOOL_LEN = 28;
const MAX_WORDS = 3;

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** True if token looks like a product/tool noun, not a requirement sentence fragment. */
export function isToolNoun(raw: string): boolean {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t || t.length < 2 || t.length > MAX_TOOL_LEN) return false;
  if (PHRASE_POISON.test(t)) return false;
  if (/[,;:]/.test(t) && t.length > 20) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) return false;
  // Reject soft prose
  if (/^(and|or|the|for|with|in|of|to|a|an)\b/i.test(t)) return false;

  const key = normalizeKey(t);
  for (const allow of TOOL_NOUN_ALLOW) {
    if (normalizeKey(allow) === key) return true;
    // allow "SAP IBP" style if both parts known
  }
  // Short acronyms / product codes
  if (/^[A-Z][A-Z0-9+./-]{1,11}$/i.test(t) && t.length <= 12) return true;
  // SAP Xxx module names (2–3 tokens, no verbs)
  if (
    /^SAP\s+[A-Z0-9/&+]{2,20}$/i.test(t) ||
    /^S\/?4\s*HANA$/i.test(t) ||
    /^S4HANA$/i.test(t)
  ) {
    return true;
  }
  // Known multi-word tools
  if (
    /^(Service\s*Now|OpenText(\s+VIM)?|Success\s*Factors|Data\s*Sphere|HP\s*ALM|Power\s*BI|Public\s*Cloud|Private\s*Cloud)$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Split a free-text stack/env line into candidate tokens, then keep tool nouns only.
 */
export function scrubToToolNouns(raw: string, limit = 16): string {
  if (!raw?.trim()) return "";
  // Prefer comma/semicolon splits; also break on " and " when long
  let chunks = raw
    .split(/[,;|/]+/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // If one huge chunk, try splitting on " · " or " - "
  if (chunks.length === 1 && chunks[0]!.length > 40) {
    chunks = chunks[0]!
      .split(/\s+[·•]\s+|\s+-\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    // If chunk is long prose, try to pull known tools from it
    if (c.length > MAX_TOOL_LEN || PHRASE_POISON.test(c) || c.split(/\s+/).length > MAX_WORDS) {
      for (const allow of TOOL_NOUN_ALLOW) {
        const re = new RegExp(
          `\\b${allow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i"
        );
        if (re.test(c)) {
          const k = normalizeKey(allow);
          if (!seen.has(k)) {
            seen.add(k);
            out.push(allow);
          }
        }
      }
      // Also extract short ALLCAPS tokens from prose
      for (const m of c.match(/\b[A-Z][A-Z0-9]{1,10}\b/g) || []) {
        if (isToolNoun(m)) {
          const k = normalizeKey(m);
          if (!seen.has(k)) {
            seen.add(k);
            out.push(m);
          }
        }
      }
      continue;
    }
    if (!isToolNoun(c)) continue;
    const k = normalizeKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out.join(", ");
}

/**
 * Environment line: indirect tools / platforms only (Jira, ServiceNow, S/4HANA, cloud).
 * Prefer tools mentioned in JD when provided.
 */
export function scrubEnvironment(raw: string, jd?: string, limit = 10): string {
  const fromField = scrubToToolNouns(raw, limit);
  const fromJd = scrubToToolNouns(jd || "", 12);
  // Prefer intersection-ish: JD tools first, then field
  const jdParts = fromJd ? fromJd.split(", ").filter(Boolean) : [];
  const fieldParts = fromField ? fromField.split(", ").filter(Boolean) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...jdParts, ...fieldParts]) {
    const k = normalizeKey(t);
    if (seen.has(k)) continue;
    // Environment prefers platforms/collab tools + SAP versions
    if (
      /jira|servicenow|service now|s\/?4|hana|cloud|azure|aws|gcp|alm|devops|solman|solution manager|btp|cpi|fiori|public cloud|private cloud|rise/i.test(
        t
      ) ||
      isToolNoun(t)
    ) {
      seen.add(k);
      out.push(t);
    }
    if (out.length >= limit) break;
  }
  return out.join(", ");
}

/** Extract noun tools from JD text only. */
export function toolsFromJd(jd?: string, limit = 12): string {
  return scrubToToolNouns(jd || "", limit);
}
