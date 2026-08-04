/**
 * Environment / Stack / Modules lines must be tools & platforms only.
 *
 * Soft duties ("facilitating workshops"), SME guidance language, and truncated
 * job titles ("SAP BASIS CONSULTANT WITH ECC 7.4 AND") must never ship as stack.
 */

/** Soft / behavioral language that pollutes Environment lines */
const SOFT_OR_DUTY =
  /\b(facilitat\w*|workshop|workshops|guidance|sme[- ]?level|stakeholder|cross[- ]functional|team[- ]?player|communication|collaboration|collaborat\w*|problem[- ]?solving|hands[- ]on|end[- ]to[- ]end delivery|best practices|knowledge transfer|mentoring|coaching|training sessions?|requirements gathering|user stories|agile ceremonies|daily standups?|sprint planning)\b/i;

/** Role / job-title shapes (not products) */
const ROLE_TITLE =
  /\b(consultant|consultants|developer|developers|architect|architects|engineer|engineers|manager|managers|analyst|analysts|specialist|specialists|director|lead|leads|administrator|admins?)\b/i;

/** Incomplete cut-off tokens from JD/title chunking */
const TRUNCATED_TAIL =
  /\b(and|or|with|of|for|to|the|a|an|in|on|at|as|by|&)$/i;

/** Tools / platforms / modules we generally want on Environment */
const TOOL_SIGNAL =
  /\b(SAP|S\/4|S4HANA|HANA|ECC|R\/3|BASIS|ABAP|Fiori|UI5|BTP|CPI|PI\/PO|PO\/PI|OData|RFC|IDoc|SolMan|Solution Manager|BW|BODS|SDI|SDA|MDG|Ariba|Concur|SuccessFactors|SAC|Analytics Cloud|ATTP|EPCIS|GS1|GTIN|SSCC|DSCSA|FICO|FI\/CO|MM|SD|PP|QM|PM|WM|EWM|TM|GTS|CFIN|New GL|Vertex|Oracle|SQL|Server|Postgres|MySQL|DB2|MaxDB|Sybase|ASE|Windows|Linux|Unix|AIX|Azure|AWS|GCP|Docker|Kubernetes|Jenkins|Git|Jira|ServiceNow|Service\s*Now|Service\s*Desk|Boomi|MuleSoft|Kafka|REST|SOAP|XML|JSON|Python|Java|JavaScript|TypeScript|Node\.?js|React|\.NET|C#|Power\s*BI|Tableau|Qlik|Snowflake|Databricks|Informatica|DataStage|Talend|IDoc|LSMW|BAPI|BADI|CDS|AMDP|HANA Studio|Eclipse|Charm|CTS|STMS|SSO|SAML|LDAP|Active Directory|VMware|Hyper-V|NetWeaver|Web Dispatcher|Gateway|ICM|SM59|ST22|SM21|DBACOCKPIT|HANA Cockpit)\b/i;

const SKILL_GARBAGE =
  /\b(ability to|should have|must have|years of experience|location|looking for|we are seeking|responsible for)\b/i;

function cleanToken(raw: string): string {
  return String(raw || "")
    .replace(/^[•▸→–\-\*◆›]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a token looks like a product/tool/module suitable for Environment.
 */
export function isEnvironmentToolToken(token: string): boolean {
  const t = cleanToken(token);
  if (!t || t.length < 2 || t.length > 42) return false;
  if (SKILL_GARBAGE.test(t)) return false;
  if (SOFT_OR_DUTY.test(t)) return false;
  if (TRUNCATED_TAIL.test(t)) return false;

  const words = t.split(/\s+/).filter(Boolean);
  // Role titles with 2+ words (e.g. "SAP BASIS CONSULTANT …")
  if (ROLE_TITLE.test(t) && words.length >= 2) return false;
  // Bare role word alone
  if (ROLE_TITLE.test(t) && words.length === 1) return false;

  // Verb-ing soft phrases without tool signal
  if (
    /^(facilitating|enabling|leading|driving|supporting|managing|delivering|providing|conducting|ensuring)\b/i.test(
      t
    ) &&
    !TOOL_SIGNAL.test(t)
  ) {
    return false;
  }

  // Too many lowercase words = duty sentence fragment
  if (words.length >= 4 && !TOOL_SIGNAL.test(t) && /[a-z]{4,}/.test(t)) {
    return false;
  }

  // Prefer explicit tool signal
  if (TOOL_SIGNAL.test(t)) return true;

  // Short acronym / product-ish tokens (SAC, ECC, BASIS, ORACLE, ABAP)
  if (/^[A-Z][A-Z0-9./+#-]{1,14}$/.test(t) && t.length <= 16) return true;
  if (/^[A-Za-z][A-Za-z0-9./+#-]{1,18}$/.test(t) && words.length === 1 && t.length <= 20) {
    // Single token without soft language — allow common stack chips
    if (/^(and|or|the|with|for|from|this|that|will|must|have|our|your)$/i.test(t)) {
      return false;
    }
    return true;
  }

  // Multi-word product with digits/version (ECC 7.4, S/4HANA 2021)
  if (words.length <= 4 && /\d/.test(t) && TOOL_SIGNAL.test(t)) return true;
  if (words.length <= 3 && /^(SAP|Oracle|AWS|Azure|Microsoft)\b/i.test(t) && !ROLE_TITLE.test(t)) {
    return true;
  }

  return false;
}

/**
 * Filter a list of skill/env candidates to tools-only Environment tokens.
 */
export function filterEnvironmentTokens(
  tokens: string[],
  opts?: { max?: number }
): string[] {
  const max = opts?.max ?? 10;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of tokens) {
    // Split accidental multi-token strings
    const pieces = cleanToken(raw)
      .split(/\s*[·|,;/]\s*/)
      .map(cleanToken)
      .filter(Boolean);
    for (const p of pieces) {
      if (!isEnvironmentToolToken(p)) continue;
      const key = p.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(p);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * Build a clean Environment/Stack line from candidate tokens.
 * Returns null if nothing tool-like remains (caller may omit the line).
 */
export function formatEnvironmentLine(
  label: string,
  tokens: string[],
  opts?: { max?: number; sep?: string }
): string | null {
  const sep = opts?.sep ?? " · ";
  const parts = filterEnvironmentTokens(tokens, { max: opts?.max ?? 10 });
  if (!parts.length) return null;
  const safeLabel = (label || "Environment").replace(/:\s*$/, "");
  return `${safeLabel}: ${parts.join(sep)}`;
}

/** Detect Environment / Stack / Modules meta lines in experience blocks */
export function isEnvironmentMetaLine(line: string): boolean {
  return /^(environment(\s*\/\s*tools(\s+in\s+period)?)?|stack|modules|program stack|chapter stack|engagement stack|tools(\s+in\s+period)?)\s*:/i.test(
    (line || "").trim()
  );
}

/**
 * Scrub an existing Environment/Stack line body to tools only.
 * Keeps the original label when possible.
 */
export function scrubEnvironmentLineText(
  line: string,
  opts?: { fallback?: string; max?: number }
): string {
  const t = (line || "").trim();
  if (!isEnvironmentMetaLine(t) && !/^environment\s*:/i.test(t)) return t;
  const labelMatch = t.match(/^([^:]+):\s*/);
  const label = labelMatch?.[1]?.trim() || "Environment";
  const body = t.replace(/^[^:]+:\s*/, "");
  const parts = body.split(/\s*[·|,;/]\s*/).map(cleanToken).filter(Boolean);
  const cleaned = formatEnvironmentLine(label, parts, {
    max: opts?.max ?? 8,
    sep: " · ",
  });
  if (cleaned) return cleaned;
  if (opts?.fallback) return `${label}: ${opts.fallback}`;
  // Prefer omitting junk entirely — return empty string for caller to drop
  return "";
}
