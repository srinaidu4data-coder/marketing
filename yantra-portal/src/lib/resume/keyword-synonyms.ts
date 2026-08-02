/**
 * Soft keyword matching — exact string OR known synonym family.
 * Used by ATS scorer (credit) and master-grounded ATS fix pass (inject only if master has family).
 */

/** Groups of interchangeable terms (any member counts as any other). */
const SYNONYM_GROUPS: string[][] = [
  // SAP core
  ["s/4hana", "s4hana", "s/4", "sap s/4hana", "sap s4hana", "s4 hana"],
  ["sap", "sap ecc", "ecc", "sap erp"],
  ["fiori", "sap fiori", "ui5", "sapui5"],
  ["abap", "abap oo", "oo abap"],
  ["odata", "o-data", "sap gateway"],
  ["brf+", "brfplus", "brf plus"],
  ["bw", "sap bw", "bw/4hana", "bw4hana"],
  ["hana", "sap hana"],
  ["btp", "sap btp", "business technology platform"],
  ["cpi", "sap cpi", "cloud platform integration", "integration suite"],
  ["mdg", "master data governance", "sap mdg"],
  ["rar", "revenue accounting", "ifrs 15", "ifrs15", "asc 606", "asc606"],
  ["attp", "advanced track and trace", "track and trace", "serialization"],
  ["ewm", "extended warehouse management", "warehouse management"],
  ["tm", "transportation management"],
  ["fico", "fi/co", "fi-co", "finance controlling"],
  ["mm", "materials management"],
  ["sd", "sales and distribution", "order to cash", "order-to-cash", "otc"],
  ["pp", "production planning"],
  ["qm", "quality management"],
  ["pm", "plant maintenance"],
  ["hrm", "hcm", "successfactors", "human capital"],
  // Clinical / data
  ["edc", "electronic data capture", "rax", "rave", "medidata"],
  ["cdisc", "cdash", "sdtm", "adam"],
  ["crf", "e-crf", "ecrf", "case report form"],
  ["query management", "data queries", "query resolution"],
  ["clinical data management", "clinical data manager", "cdm"],
  ["pharmacovigilance", "drug safety", "adverse event"],
  ["protocol", "study protocol", "clinical protocol"],
  // General delivery
  ["stakeholder", "stakeholders", "business partner", "process owner"],
  ["uat", "user acceptance testing", "user acceptance"],
  ["sit", "system integration testing", "integration testing"],
  ["agile", "scrum", "sprint"],
  ["cutover", "go-live", "golive", "hypercare"],
  ["migration", "data migration", "data conversion"],
  ["interface", "interfaces", "integration", "integrations"],
  ["documentation", "docs", "sop", "work instruction"],
  ["compliance", "regulatory", "audit", "gxp", "21 cfr part 11"],
  ["sql", "t-sql", "pl/sql", "postgresql", "postgres"],
  ["python", "py"],
  ["etl", "elt", "data pipeline", "data pipelines"],
  ["tableau", "power bi", "powerbi", "analytics dashboard"],
  ["jira", "azure devops", "ado"],
  ["requirements", "requirement gathering", "business requirements", "brd"],
  ["configuration", "config", "configure", "configured"],
  ["implementation", "implement", "implemented", "rollout"],
  ["testing", "test", "tested", "qa testing", "quality assurance"],
  ["leadership", "lead", "led", "team lead"],
  ["design", "designed", "solution design", "blueprint"],
];

const GROUP_BY_TERM = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  const norm = group.map((g) => g.toLowerCase().trim()).filter(Boolean);
  for (const t of norm) {
    const existing = GROUP_BY_TERM.get(t) || [];
    GROUP_BY_TERM.set(t, Array.from(new Set([...existing, ...norm])));
  }
}

export function normalizeKeyword(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

/** All known surface forms for a keyword (includes itself). */
export function synonymFamily(term: string): string[] {
  const n = normalizeKeyword(term);
  if (!n) return [];
  const fromMap = GROUP_BY_TERM.get(n);
  if (fromMap?.length) return fromMap;
  // Also try without punctuation variants
  const loose = n.replace(/[\/\-_+]/g, " ").replace(/\s+/g, " ").trim();
  if (loose !== n && GROUP_BY_TERM.has(loose)) return GROUP_BY_TERM.get(loose)!;
  return [n];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True if any synonym of `keyword` appears in `text` (word-ish match).
 */
export function textHasKeywordOrSynonym(text: string, keyword: string): boolean {
  const hay = text || "";
  if (!hay) return false;
  // Exact first
  try {
    if (new RegExp(escapeRe(keyword), "i").test(hay)) return true;
  } catch {
    if (hay.toLowerCase().includes(normalizeKeyword(keyword))) return true;
  }
  for (const syn of synonymFamily(keyword)) {
    if (syn.length < 2) continue;
    try {
      // Prefer word boundary for short tokens
      const pat =
        syn.length <= 4
          ? new RegExp(`\\b${escapeRe(syn)}\\b`, "i")
          : new RegExp(escapeRe(syn), "i");
      if (pat.test(hay)) return true;
    } catch {
      if (hay.toLowerCase().includes(syn)) return true;
    }
  }
  return false;
}

/**
 * Master-grounded: keyword may be used in a fix pass only if master contains
 * the term or a synonym (or a substantial token of multi-word keywords).
 */
export function isKeywordGroundedInMaster(
  keyword: string,
  masterText: string
): boolean {
  if (!keyword?.trim() || !masterText?.trim()) return false;
  if (textHasKeywordOrSynonym(masterText, keyword)) return true;
  // Multi-word: ground if ≥2 significant tokens appear in master
  const parts = normalizeKeyword(keyword)
    .split(/[\s\/\-_]+/)
    .filter((p) => p.length >= 4);
  if (parts.length >= 2) {
    const hits = parts.filter((p) => textHasKeywordOrSynonym(masterText, p));
    if (hits.length >= Math.ceil(parts.length * 0.5)) return true;
  }
  return false;
}

/**
 * Prefer a surface form that already exists on master for injection readability.
 */
export function preferredInjectForm(keyword: string, masterText: string): string {
  const master = masterText || "";
  for (const syn of synonymFamily(keyword)) {
    try {
      if (new RegExp(escapeRe(syn), "i").test(master)) {
        // Preserve casing from master when possible
        const m = master.match(new RegExp(escapeRe(syn), "i"));
        if (m?.[0]) return m[0];
      }
    } catch {
      /* ignore */
    }
  }
  return keyword.trim();
}

/** Filter missing JD keywords to those safe to inject from master. */
export function masterGroundedMissing(
  missing: string[],
  masterText: string
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of missing || []) {
    if (!isKeywordGroundedInMaster(k, masterText)) continue;
    const form = preferredInjectForm(k, masterText);
    const key = normalizeKeyword(form);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(form);
  }
  return out;
}
