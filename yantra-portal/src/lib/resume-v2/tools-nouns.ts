/**
 * Tech Stack + Environment: NOUN tools only (no JD requirement phrases).
 * Scrubs pollution: "candidate must…", C2C/CTC, English words like "engineering",
 * and enforces zero overlap between stack and env.
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
  "Employee Central",
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
  // Data / analytics (common JD nouns)
  "SQL",
  "T-SQL",
  "PL/SQL",
  "Python",
  "Spark",
  "PySpark",
  "Databricks",
  "Synapse",
  "Azure Synapse",
  "ADF",
  "Data Factory",
  "SSIS",
  "SSRS",
  "SSAS",
  "ETL",
  "ELT",
  "DSS",
  "EDW",
  "DWH",
  "Redshift",
  "BigQuery",
  "dbt",
  "Airflow",
  "Hive",
  "Hadoop",
  "Scala",
  "Java",
  "R",
  "Pandas",
  "NumPy",
  "Terraform",
  "Docker",
  "Kubernetes",
  "Git",
  "GitHub",
  "GitLab",
  "Confluence",
  "Power Automate",
  "Logic Apps",
  "Event Hub",
  "Cosmos DB",
  "PostgreSQL",
  "MySQL",
  "Oracle",
  "MongoDB",
  "Redis",
  "HCM",
  "PA",
  "OM",
  "PY",
  "ESS",
  "MSS",
  "LMS",
  "Recruiting",
  "Onboarding",
  "Payroll",
] as const;

/** Never ship these as Tech Stack / Environment (commercial, prose, junk). */
export const TOOL_NOUN_DENY = new Set(
  [
    "c2c",
    "ctc",
    "w2",
    "1099",
    "fte",
    "full-time",
    "fulltime",
    "part-time",
    "contract",
    "contractor",
    "corp-to-corp",
    "corptocorp",
    "hourly",
    "rate",
    "billing",
    "note",
    "notes",
    "etc",
    "tbd",
    "na",
    "n/a",
    "none",
    "null",
    "ct",
    "engineering",
    "engineer",
    "consultant",
    "consulting",
    "manager",
    "management",
    "developer",
    "development",
    "analyst",
    "analysis",
    "architect",
    "architecture",
    "lead",
    "senior",
    "junior",
    "associate",
    "skills",
    "skill",
    "tools",
    "tool",
    "technology",
    "technologies",
    "tech",
    "stack",
    "environment",
    "experience",
    "expertise",
    "hands-on",
    "handson",
    "strong",
    "required",
    "preferred",
    "must",
    "candidate",
    "client",
    "customer",
    "project",
    "projects",
    "role",
    "title",
    "work",
    "team",
    "support",
    "implementation",
    "delivery",
    "solution",
    "solutions",
    "business",
    "process",
    "processes",
    "requirement",
    "requirements",
    "documentation",
    "communication",
  ].map((s) => s.toLowerCase())
);

const PHRASE_POISON =
  /\b(must|should|candidate|hands[- ]?on|expertise|experience|strong|preferred|required|proficient|knowledge|ability|responsible|between|implementation or|support of|years?|15\+|\d+\+|looking for|good understanding)\b/i;

const MAX_TOOL_LEN = 28;
const MAX_WORDS = 3;

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function isDenied(raw: string): boolean {
  const k = normalizeKey(raw);
  if (TOOL_NOUN_DENY.has(k)) return true;
  if (TOOL_NOUN_DENY.has(k.replace(/\s+/g, ""))) return true;
  return false;
}

/** Pure English words that slipped through acronym regex (e.g. engineering). */
function isProseWord(t: string): boolean {
  if (!/^[A-Za-z][A-Za-z-]{3,}$/.test(t)) return false;
  if (/[0-9/]/.test(t)) return false;
  // Allow short known tech words from allow-list only
  const k = normalizeKey(t);
  for (const allow of TOOL_NOUN_ALLOW) {
    if (normalizeKey(allow) === k) return false;
  }
  // Multi-syllable english-looking: reject
  if (t.length >= 6 && !/sql|azure|kafka|spark|python|java|scala|docker|hadoop|hive|dbt|git|oracle|mongo|redis|snow|tableau|power|data|cloud|fiori|abap|hana|mule|boomi|informatica|databricks|synapse|airflow|pandas|numpy/i.test(t)) {
    return true;
  }
  return false;
}

/** True if token looks like a product/tool noun, not a requirement sentence fragment. */
export function isToolNoun(raw: string): boolean {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t || t.length < 2 || t.length > MAX_TOOL_LEN) return false;
  if (isDenied(t)) return false;
  if (PHRASE_POISON.test(t)) return false;
  if (isProseWord(t)) return false;
  if (/[,;:]/.test(t) && t.length > 20) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) return false;
  if (/^(and|or|the|for|with|in|of|to|a|an)\b/i.test(t)) return false;

  const key = normalizeKey(t);
  for (const allow of TOOL_NOUN_ALLOW) {
    if (normalizeKey(allow) === key) return true;
  }
  // Short product codes: must look technical (digit, slash, or 2–5 letter acronym)
  // Reject 2-letter junk like "CT" unless in allow list (already checked)
  if (/^[A-Z][A-Z0-9+./-]{2,10}$/i.test(t) && t.length >= 3 && t.length <= 12) {
    // Require at least one digit OR known-ish pattern OR all-caps 3–6 letters common for tools
    if (/\d/.test(t) || /[./+]/.test(t)) return true;
    if (t.length >= 3 && t.length <= 6 && t === t.toUpperCase()) {
      // Still deny if blacklisted
      if (!isDenied(t)) return true;
    }
  }
  if (
    /^SAP\s+[A-Z0-9/&+]{2,20}$/i.test(t) ||
    /^S\/?4\s*HANA$/i.test(t) ||
    /^S4HANA$/i.test(t)
  ) {
    return true;
  }
  if (
    /^(Service\s*Now|OpenText(\s+VIM)?|Success\s*Factors|Employee\s*Central|Data\s*Sphere|HP\s*ALM|Power\s*BI|Public\s*Cloud|Private\s*Cloud|Azure\s*Synapse|Data\s*Factory)$/i.test(
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
  let chunks = raw
    .split(/[,;|/]+/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (chunks.length === 1 && chunks[0]!.length > 40) {
    chunks = chunks[0]!
      .split(/\s+[·•]\s+|\s+-\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length > MAX_TOOL_LEN || PHRASE_POISON.test(c) || c.split(/\s+/).length > MAX_WORDS) {
      for (const allow of TOOL_NOUN_ALLOW) {
        const re = new RegExp(
          `\\b${allow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i"
        );
        if (re.test(c)) {
          const k = normalizeKey(allow);
          if (isDenied(allow) || seen.has(k)) continue;
          seen.add(k);
          out.push(allow);
        }
      }
      for (const m of c.match(/\b[A-Z][A-Z0-9]{2,10}\b/g) || []) {
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

const ENV_PREFER =
  /jira|servicenow|service now|s\/?4|hana|cloud|azure|aws|gcp|alm|devops|solman|solution manager|btp|cpi|fiori|public cloud|private cloud|rise|confluence|git|github|gitlab|docker|kubernetes|synapse|databricks|adf|data factory/i;

/**
 * Environment line: platforms / collab / cloud — not the same list as techStack.
 */
export function scrubEnvironment(raw: string, jd?: string, limit = 10): string {
  const fromField = scrubToToolNouns(raw, limit);
  const fromJd = scrubToToolNouns(jd || "", 12);
  const jdParts = fromJd ? fromJd.split(", ").filter(Boolean) : [];
  const fieldParts = fromField ? fromField.split(", ").filter(Boolean) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  // Prefer platform-ish tools first
  const ordered = [
    ...[...jdParts, ...fieldParts].filter((t) => ENV_PREFER.test(t)),
    ...[...jdParts, ...fieldParts],
  ];
  for (const t of ordered) {
    const k = normalizeKey(t);
    if (seen.has(k) || isDenied(t)) continue;
    if (ENV_PREFER.test(t) || isToolNoun(t)) {
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

/**
 * Force stack and env to be different lists with zero shared tokens.
 * If either is thin after scrub, pad from JD nouns.
 */
export function normalizeStackEnvPair(
  techStack: string,
  environment: string,
  jd?: string,
  opts?: { minStack?: number; minEnv?: number }
): { techStack: string; environment: string } {
  const minStack = opts?.minStack ?? 3;
  const minEnv = opts?.minEnv ?? 3;

  let stackParts = scrubToToolNouns(techStack, 14)
    .split(", ")
    .filter(Boolean);
  let envParts = scrubEnvironment(environment, jd, 12)
    .split(", ")
    .filter(Boolean);

  // Zero overlap: env loses tokens already in stack
  const stackKeys = new Set(stackParts.map(normalizeKey));
  envParts = envParts.filter((t) => !stackKeys.has(normalizeKey(t)));

  // Pad from JD — stack gets product/lang nouns first; env gets platforms first
  const jdParts = scrubToToolNouns(jd || "", 16)
    .split(", ")
    .filter(Boolean);
  const jdStackFirst = [
    ...jdParts.filter((t) => !ENV_PREFER.test(t)),
    ...jdParts.filter((t) => ENV_PREFER.test(t)),
  ];
  const jdEnvFirst = [
    ...jdParts.filter((t) => ENV_PREFER.test(t)),
    ...jdParts.filter((t) => !ENV_PREFER.test(t)),
  ];
  for (const t of jdStackFirst) {
    const k = normalizeKey(t);
    if (stackParts.length < minStack && !stackKeys.has(k)) {
      stackParts.push(t);
      stackKeys.add(k);
    }
  }
  for (const t of jdEnvFirst) {
    const k = normalizeKey(t);
    if (envParts.length >= minEnv) break;
    if (stackKeys.has(k)) continue;
    if (ENV_PREFER.test(t) || isToolNoun(t)) {
      envParts.push(t);
    }
  }

  // If env empty, give platform defaults from stack leftovers / JD cloud words
  if (envParts.length === 0) {
    for (const t of jdParts) {
      if (ENV_PREFER.test(t) && !stackKeys.has(normalizeKey(t))) {
        envParts.push(t);
      }
      if (envParts.length >= minEnv) break;
    }
  }

  // Last resort defaults (never C2C)
  if (stackParts.length === 0) {
    stackParts = scrubToToolNouns(jd || "SQL Azure", 6)
      .split(", ")
      .filter(Boolean)
      .slice(0, minStack);
  }
  if (envParts.length === 0) {
    envParts = ["Azure", "Jira", "Git"].filter(
      (t) => !stackKeys.has(normalizeKey(t))
    );
  }

  // Re-apply zero overlap after pads
  const sKeys = new Set(stackParts.map(normalizeKey));
  envParts = envParts.filter((t) => !sKeys.has(normalizeKey(t)));
  if (envParts.length === 0) {
    envParts = ["Public Cloud", "Jira"].filter((t) => !sKeys.has(normalizeKey(t)));
  }

  return {
    techStack: stackParts.slice(0, 14).join(", "),
    environment: envParts.slice(0, 10).join(", "),
  };
}
