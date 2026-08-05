/**
 * Line-level provenance for Prompt Test Mode.
 * Approximate attribution by comparing each resume line to:
 * master, progressive-rules pack, OpenAI pack, Claude pack, policy templates.
 *
 * Priority (first match wins for primary color):
 *   master → policy → openai → claude → progressive-rules → ai-tailor → mixed → unknown
 */

export type LineSourceId =
  | "master"
  | "policy"
  | "openai"
  | "claude"
  | "progressive-rules"
  | "ai-tailor"
  | "mixed"
  | "structure"
  | "unknown";

export type ProvenanceLine = {
  text: string;
  source: LineSourceId;
  /** Secondary sources that also matched (for badges) */
  also?: LineSourceId[];
  note?: string;
};

export type ProvenanceReport = {
  lines: ProvenanceLine[];
  counts: Record<LineSourceId, number>;
};

export const SOURCE_META: Record<
  LineSourceId,
  { label: string; short: string; className: string; bar: string }
> = {
  master: {
    label: "Master resume",
    short: "Master",
    className: "bg-emerald-50 border-l-4 border-emerald-500 text-emerald-950",
    bar: "bg-emerald-500",
  },
  policy: {
    label: "Policy JSON (emergency / methodology templates)",
    short: "Policy",
    className: "bg-violet-50 border-l-4 border-violet-500 text-violet-950",
    bar: "bg-violet-500",
  },
  openai: {
    label: "OpenAI (ai-tailor)",
    short: "OpenAI",
    className: "bg-sky-50 border-l-4 border-sky-500 text-sky-950",
    bar: "bg-sky-500",
  },
  claude: {
    label: "Claude / Anthropic (ai-tailor)",
    short: "Claude",
    className: "bg-orange-50 border-l-4 border-orange-500 text-orange-950",
    bar: "bg-orange-500",
  },
  "progressive-rules": {
    label: "Progressive rules engine",
    short: "Rules",
    className: "bg-amber-50 border-l-4 border-amber-500 text-amber-950",
    bar: "bg-amber-500",
  },
  "ai-tailor": {
    label: "AI tailor (admin LLM / mixed AI path)",
    short: "AI",
    className: "bg-indigo-50 border-l-4 border-indigo-500 text-indigo-950",
    bar: "bg-indigo-500",
  },
  mixed: {
    label: "Multiple engines (AI + rules overlap)",
    short: "Mixed",
    className: "bg-fuchsia-50 border-l-4 border-fuchsia-500 text-fuchsia-950",
    bar: "bg-fuchsia-500",
  },
  structure: {
    label: "Structure / heading / contact scaffolding",
    short: "Struct",
    className: "bg-slate-50 border-l-4 border-slate-400 text-slate-800",
    bar: "bg-slate-400",
  },
  unknown: {
    label: "Unknown / synthesized",
    short: "?",
    className: "bg-gray-50 border-l-4 border-gray-300 text-gray-800",
    bar: "bg-gray-300",
  },
};

function normKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/^[•▸→–\-\*◆›]\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function significantTokens(s: string): string[] {
  return normKey(s)
    .split(" ")
    .filter((t) => t.length >= 4);
}

/** Fuzzy: ≥60% of substantial tokens from needle appear in haystack */
function looseMatch(needle: string, haystackNorm: string): boolean {
  const key = normKey(needle);
  if (key.length < 12) return false;
  if (haystackNorm.includes(key.slice(0, Math.min(60, key.length)))) return true;
  const toks = significantTokens(needle);
  if (toks.length < 3) return haystackNorm.includes(key);
  let hits = 0;
  for (const t of toks) {
    if (haystackNorm.includes(t)) hits++;
  }
  return hits / toks.length >= 0.6;
}

function lineInCorpus(line: string, corpusNorm: string): boolean {
  return looseMatch(line, corpusNorm);
}

function isStructureLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.length <= 48) return true;
  if (/^employer\s*\/\s*client:/i.test(t)) return true;
  if (/^(core|platforms?|methods?|technical skills)\s*:/i.test(t)) return true;
  if (/@/.test(t) && t.length < 80) return true;
  if (/^\d{4}\s*[-–—]\s*(\d{4}|present)/i.test(t)) return true;
  return false;
}

/**
 * Detect policy emergency/methodology templates after placeholder wipe.
 * Templates use {role} {client} {skills} {s0} etc.
 */
export function looksLikePolicyTemplate(
  line: string,
  templates: string[]
): boolean {
  const ln = normKey(line);
  if (ln.length < 20 || !templates.length) return false;
  for (const raw of templates) {
    // Replace placeholders with loose wildcards → extract fixed multi-word anchors
    const fixed = raw
      .replace(/\{[^}]+\}/g, " ")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const anchors = fixed.split(" ").filter((w) => w.length >= 5);
    if (anchors.length < 3) continue;
    let hits = 0;
    for (const a of anchors) {
      if (ln.includes(a)) hits++;
    }
    if (hits / anchors.length >= 0.7) return true;
  }
  return false;
}

export function buildProvenanceReport(opts: {
  resumeText: string;
  masterText: string;
  /** Full pack text from progressive-rules-only tab */
  rulesPackText?: string;
  /** Full pack from OpenAI-forced tab */
  openaiPackText?: string;
  /** Full pack from Claude-forced tab */
  claudePackText?: string;
  /** Full pack from ai-only (admin LLM) */
  aiOnlyPackText?: string;
  /** Policy emergency + methodology template strings */
  policyTemplates?: string[];
  /** Which tab is being viewed — biases unknown AI lines */
  viewingTabId?: string;
  viewingLlmProvider?: string | null;
  viewingEngineUsed?: string | null;
}): ProvenanceReport {
  const masterN = normKey(opts.masterText || "");
  const rulesN = normKey(opts.rulesPackText || "");
  const openaiN = normKey(opts.openaiPackText || "");
  const claudeN = normKey(opts.claudePackText || "");
  const aiOnlyN = normKey(opts.aiOnlyPackText || "");
  const templates = opts.policyTemplates || [];

  const counts: Record<LineSourceId, number> = {
    master: 0,
    policy: 0,
    openai: 0,
    claude: 0,
    "progressive-rules": 0,
    "ai-tailor": 0,
    mixed: 0,
    structure: 0,
    unknown: 0,
  };

  const rawLines = (opts.resumeText || "").replace(/\r\n/g, "\n").split("\n");
  const lines: ProvenanceLine[] = rawLines.map((text) => {
    const t = text.trim();
    if (!t) {
      return { text, source: "structure" as const };
    }
    if (isStructureLine(t)) {
      counts.structure++;
      return { text, source: "structure", note: "Heading / scaffold" };
    }

    const also: LineSourceId[] = [];
    const inMaster = masterN.length > 20 && looseMatch(t, masterN);
    const inRules = rulesN.length > 20 && lineInCorpus(t, rulesN);
    const inOpenai = openaiN.length > 20 && lineInCorpus(t, openaiN);
    const inClaude = claudeN.length > 20 && lineInCorpus(t, claudeN);
    const inAiOnly = aiOnlyN.length > 20 && lineInCorpus(t, aiOnlyN);
    const inPolicy = looksLikePolicyTemplate(t, templates);

    if (inMaster) also.push("master");
    if (inPolicy) also.push("policy");
    if (inOpenai) also.push("openai");
    if (inClaude) also.push("claude");
    if (inRules) also.push("progressive-rules");
    if (inAiOnly && !inOpenai && !inClaude) also.push("ai-tailor");

    // Primary attribution
    let source: LineSourceId = "unknown";
    let note: string | undefined;

    if (inMaster) {
      source = "master";
      note = "Matches master resume wording";
    } else if (inPolicy) {
      source = "policy";
      note = "Matches policy emergency/methodology template shape";
    } else if (inOpenai && inClaude) {
      source = "mixed";
      note = "Present in both OpenAI and Claude packs";
      also.push("openai", "claude");
    } else if (inOpenai && inRules) {
      source = "mixed";
      note = "Present in OpenAI and progressive-rules packs";
    } else if (inClaude && inRules) {
      source = "mixed";
      note = "Present in Claude and progressive-rules packs";
    } else if (inOpenai) {
      source = "openai";
      note = "Distinctive to OpenAI pack / OpenAI-style generation";
    } else if (inClaude) {
      source = "claude";
      note = "Distinctive to Claude pack / Claude-style generation";
    } else if (inRules && !inAiOnly && !inOpenai && !inClaude) {
      source = "progressive-rules";
      note = "Appears in progressive-rules pack, not pure AI packs";
    } else if (inAiOnly || inRules) {
      // Viewing context: if this pack was forced to a provider, prefer that label
      const viewP = (opts.viewingLlmProvider || "").toLowerCase();
      const viewTab = opts.viewingTabId || "";
      if (viewP === "openai" || viewTab === "openai-only") {
        source = "openai";
        note = "Generated under OpenAI-forced ai-tailor (not in master)";
      } else if (viewP === "anthropic" || viewTab === "claude-only") {
        source = "claude";
        note = "Generated under Claude-forced ai-tailor (not in master)";
      } else if (
        opts.viewingEngineUsed === "progressive-rules" ||
        viewTab === "rules-only"
      ) {
        source = "progressive-rules";
        note = "Generated under progressive-rules path";
      } else if (inAiOnly && inRules) {
        source = "mixed";
        note = "Shared by AI and rules outputs";
      } else if (inAiOnly) {
        source = "ai-tailor";
        note = "AI tailor path (admin LLM)";
      } else {
        source = "progressive-rules";
        note = "Rules-path content";
      }
    } else {
      // Fallback by viewing context
      const viewP = (opts.viewingLlmProvider || "").toLowerCase();
      const viewTab = opts.viewingTabId || "";
      if (viewP === "openai" || viewTab === "openai-only") {
        source = "openai";
        note = "Likely OpenAI synthesis (no master match)";
      } else if (viewP === "anthropic" || viewTab === "claude-only") {
        source = "claude";
        note = "Likely Claude synthesis (no master match)";
      } else if (viewTab === "rules-only") {
        source = "progressive-rules";
        note = "Rules synthesis (no master match)";
      } else {
        source = "unknown";
        note = "Could not attribute confidently";
      }
    }

    counts[source]++;
    const uniqAlso = Array.from(new Set(also.filter((a) => a !== source)));
    return {
      text,
      source,
      also: uniqAlso.length ? uniqAlso : undefined,
      note,
    };
  });

  return { lines, counts };
}

/** Collect emergency + methodology templates from a policy-like object */
export function templatesFromPolicy(policy: {
  emergencyBullets?: { recent?: string[]; mid?: string[]; early?: string[] };
  methodologyDefaults?: string[];
  educationDefaults?: string[];
}): string[] {
  const out: string[] = [];
  const eb = policy.emergencyBullets || {};
  for (const k of ["recent", "mid", "early"] as const) {
    for (const t of eb[k] || []) out.push(t);
  }
  for (const t of policy.methodologyDefaults || []) out.push(t);
  for (const t of policy.educationDefaults || []) out.push(t);
  return out;
}
