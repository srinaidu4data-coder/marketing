/**
 * Research-enhanced pack post-processor (localhost product lab).
 *
 * Encodes psychology / IR / I-O ideas into concrete transforms:
 * - Primacy: reorder bullets by JD match (B4)
 * - Peak–end: ensure last bullet is impact-coded (B2)
 * - Schema / n-grams: weave exact JD phrases (E6/G6)
 * - Anti-prototype: demote off-domain stack (C4)
 * - Verb alignment to JD (E2)
 * - Hedge ban (E4)
 * - Impersonal voice (E5)
 * - Summary density 10 jargon lines (existing + reinforce)
 * - Environment line as keyword sink (K2)
 * - Temporal / parse hygiene notes
 *
 * Does NOT invent employers, metrics, or free % claims.
 */

import type { StructuredResume, ResumeSection } from "./templates";
import { renderPlainFromStructured } from "./build-from-layout";
import { extractJdKeywords, extractJobTitle } from "./jd-parse";
import { isBullet, stripBullet, isEmployerClientLine, isEnvToolsLine } from "./line-class";
import { isEngineFooterLine } from "./strip-engine-footer";
import {
  filterEnvironmentTokens,
  formatEnvironmentLine,
} from "./environment-stack";

const HEDGE_RE =
  /\b(helped with|assisted with|involved in|participated in|various|etc\.?|and so on|tried to|attempted to)\b/gi;

const IMPACT_END_RE =
  /\b(impact|reduced|improved|delivered|stabiliz|hypercare|knowledge transfer|\bKT\b|go-?live|production|throughput|reconcil|validated|cutover|UAT|defect)\b/i;

const OFF_DOMAIN_HEAVY: { re: RegExp; unless: RegExp; label: string }[] = [
  {
    re: /\b(FI-CO|FICO|Asset Accounting|New GL|Material Ledger|CO-PA|Cost Center Accounting)\b/i,
    unless: /\b(fico|fi-co|asset accounting|finance|controlling|s\/4.*finance)\b/i,
    label: "FICO",
  },
  {
    re: /\b(SuccessFactors|Employee Central|Recruiting Management)\b/i,
    unless: /\b(successfactors|hcm|employee central)\b/i,
    label: "SF/HCM",
  },
  {
    re: /\b(WM|EWM|Extended Warehouse)\b/i,
    unless: /\b(ewm|warehouse|wm\b|inventory)\b/i,
    label: "EWM",
  },
];

const JD_VERB_BANK = [
  "configure",
  "implement",
  "integrate",
  "validate",
  "reconcile",
  "design",
  "lead",
  "deliver",
  "optimize",
  "automate",
  "migrate",
  "support",
  "analyze",
  "document",
  "test",
  "deploy",
  "monitor",
  "troubleshoot",
];

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+/.\-#\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function jdTokenSet(jd: string): Set<string> {
  return new Set(tokenize(jd));
}

function bulletJdScore(bullet: string, jdTokens: Set<string>): number {
  const toks = tokenize(stripBullet(bullet));
  let score = 0;
  const jdList = Array.from(jdTokens);
  for (const t of toks) {
    if (jdTokens.has(t)) score += 1;
    if (t.length >= 4 && jdList.some((j) => j.includes(t) || t.includes(j)))
      score += 0.25;
  }
  // Bonus for exact multi-wordish density
  if (IMPACT_END_RE.test(bullet)) score += 0.5;
  return score;
}

/**
 * Dedupe JD phrases for checklist / weave:
 * keep longer, more specific phrases; drop exact dups, contiguous
 * word-substring fragments (e.g. "Location New" ⊂ "Location New Brunswick NJ"),
 * and high-overlap sliding windows from the same JD line.
 */
export function dedupeJdPhrases(phrases: string[], limit = 24): string[] {
  const cleaned = phrases
    .map((p) => (p || "").replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 4 && !isWeakJdPhrase(p));

  // Prefer longer / more token-rich first; slight boost for technical tokens
  const ranked = [...cleaned].sort((a, b) => {
    const score = (s: string) =>
      s.split(/\s+/).length * 10 +
      s.length +
      (/[A-Z]{2,}|\d|SAP|ATTP|EPCIS|GS1|DSCSA|S\/4|HANA|API|ABAP/i.test(s)
        ? 15
        : 0);
    return score(b) - score(a);
  });

  const kept: string[] = [];
  const keptKeys: string[] = [];

  for (const phrase of ranked) {
    const key = phrase.toLowerCase();
    if (keptKeys.includes(key)) continue;

    // Contiguous word-span containment or high sliding-window overlap
    const redundant = keptKeys.some(
      (k) => phraseIsSubspanOf(key, k) || phrasesHighlyOverlap(key, k)
    );
    if (redundant) continue;

    // If a shorter kept item is a subspan / high-overlap of this one, replace it
    for (let i = keptKeys.length - 1; i >= 0; i--) {
      if (
        phraseIsSubspanOf(keptKeys[i]!, key) ||
        phrasesHighlyOverlap(keptKeys[i]!, key)
      ) {
        keptKeys.splice(i, 1);
        kept.splice(i, 1);
      }
    }

    kept.push(phrase);
    keptKeys.push(key);
    if (kept.length >= limit) break;
  }

  return kept;
}

/** True if `inner` is the same as `outer` or a contiguous word subspan of it. */
function phraseIsSubspanOf(inner: string, outer: string): boolean {
  if (!inner || !outer) return false;
  if (inner === outer) return true;
  const a = inner.split(/\s+/).filter(Boolean);
  const b = outer.split(/\s+/).filter(Boolean);
  if (a.length === 0 || a.length > b.length) return false;
  for (let i = 0; i <= b.length - a.length; i++) {
    let ok = true;
    for (let j = 0; j < a.length; j++) {
      if (a[j] !== b[i + j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  // Tight char containment for punctuation variants
  if (outer.includes(inner) && inner.length >= 8 && a.length >= 2) return true;
  return false;
}

/**
 * Sliding-window near-dupes: share ≥2 consecutive tokens OR
 * Jaccard ≥ 0.6 on word sets for short phrases.
 */
function phrasesHighlyOverlap(a: string, b: string): boolean {
  if (!a || !b || a === b) return a === b;
  const wa = a.split(/\s+/).filter(Boolean);
  const wb = b.split(/\s+/).filter(Boolean);
  if (wa.length < 2 || wb.length < 2) return false;

  // Shared bigram / trigram
  const grams = (words: string[], n: number) => {
    const s = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      s.add(words.slice(i, i + n).join(" "));
    }
    return s;
  };
  const bigA = grams(wa, 2);
  for (const g of Array.from(grams(wb, 2))) {
    if (bigA.has(g)) return true;
  }

  const setA = new Set(wa);
  const setB = new Set(wb);
  let inter = 0;
  for (const w of Array.from(setA)) if (setB.has(w)) inter++;
  const union = setA.size + setB.size - inter;
  if (union > 0 && inter / union >= 0.6 && Math.min(wa.length, wb.length) >= 3) {
    return true;
  }
  return false;
}

/**
 * Technical signal — deliberately NOT bare [A-Z]{2} (that matches state codes
 * like NJ/NY/CA and let "New Brunswick NJ" into skills).
 */
const TECH_PHRASE_RE =
  /[A-Z]{3,}|\/|\d|SAP|ATTP|AATP|EPCIS|GS1|DSCSA|S\/4|HANA|CDISC|EDC|SDTM|FICO|FSCD|FI-?CO|ABAP|API|JSON|XML|RAR|IFRS|GAAP|ASC\s*606|\bBW\b|\bBTP\b|\bCPI\b|PI\/PO|\bEWM\b|\bMM\b|\bPP\b|\bQM\b|\bPM\b|BASIS|Agile|Scrum|Kanban|Jira|Azure|AWS|Snowflake|Tableau|Power\s*BI|SQL|ETL|OData|IDoc|RFC|BAPI|\bS4\b|S\/4HANA|\bFI\b|\bCO\b|\bSD\b|\bUI\b|\bUX\b/i;

/** JD header / posting meta — never skills, never pack text. */
const JD_META_PREFIX_RE =
  /^(location|position|title|role|job(\s+title)?|site|city|state|office|duration|employment(\s+type)?|experience(\s+level)?|type|salary|rate|pay|comp(ensation)?|clearance|visa|travel|remote|hybrid|onsite|on-site|contract|full[- ]?time|part[- ]?time|requisition|req(\s*#|id)?|posted|department|reports?\s+to)\b/i;

/**
 * Drop JD posting crumbs and broken windows.
 * Root cause of "Location New Brunswick · Position SAP · Duration 12+ Months" spam.
 */
export function isWeakJdPhrase(phrase: string): boolean {
  const p = phrase.trim();
  const low = p.toLowerCase();
  if (!p || p.length < 3) return true;

  // Any JD field-label prefix (all lengths — not just 2 tokens)
  if (JD_META_PREFIX_RE.test(p)) return true;

  // Pure duration / tenure crumbs
  if (/^\d+\+?\s*(months?|years?|yrs?)\b/i.test(p)) return true;
  if (/\bduration\b/i.test(low)) return true;

  // Pure geography (state code + place names — never skills)
  if (
    /\b(new\s+brunswick|new\s+jersey|new\s+york|san\s+francisco|los\s+angeles|remote|onsite|hybrid)\b/i.test(
      p
    )
  ) {
    return true;
  }
  if (
    !TECH_PHRASE_RE.test(p) &&
    (/\b([A-Z]{2})\b/.test(p) || /^(new|north|south|east|west)\s+\w+/i.test(p))
  ) {
    return true;
  }
  // "Brunswick NJ" / bare city + state
  if (/^[A-Za-z][a-z]+(\s+[A-Za-z][a-z]+)?\s+[A-Z]{2}$/.test(p) && !TECH_PHRASE_RE.test(p)) {
    return true;
  }

  // Leading/trailing function words from bad n-gram windows
  if (
    /^(and|or|the|for|with|from|this|that|will|must|have|our|your|know|should|can|may|a|an|to|of|in|on|at)\b/i.test(
      low
    )
  ) {
    return true;
  }
  if (/\b(and|or|the|for|with|from|to|of|a|an|in|on|at|know)$/i.test(low)) {
    return true;
  }
  // Cut-off windows like "serialization and Track"
  if (
    /\band\s+[A-Za-z][a-z]+$/i.test(p) &&
    !/\b(trace|reporting|controlling|treasury|analytics|integration|management|support|operations|development|accounting|compliance)\s*$/i.test(
      p
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Phrases safe to weave into skills / environment — technical only.
 * Job-title leftovers like "Position SAP FSCD" are rejected by isWeakJdPhrase.
 */
export function isSkillWorthyJdPhrase(phrase: string): boolean {
  const p = (phrase || "").trim();
  if (!p || isWeakJdPhrase(p)) return false;
  if (p.split(/\s+/).length > 6) return false;
  // Soft HR fluff
  if (
    /\b(communication skills|team player|self[- ]starter|detail[- ]oriented|fast[- ]paced|work ethic)\b/i.test(
      p
    )
  ) {
    return false;
  }
  return TECH_PHRASE_RE.test(p);
}

/** Extract multi-word phrases (2–4 tokens) from JD for n-gram weave / checklist. */
export function extractJdNgrams(jd: string, limit = 24): string[] {
  const lines = (jd || "")
    .replace(/\r\n/g, "\n")
    .split(/\n|[•;]/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 8 && l.length < 120)
    // Skip pure posting-meta lines entirely (Position: / Location: / Duration:)
    .filter((l) => !JD_META_PREFIX_RE.test(l.replace(/^[\s*•\-]+/, "")));

  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const words = line
      .replace(/[^a-zA-Z0-9+/.\-#\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    for (let n = 4; n >= 2; n--) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words
          .slice(i, i + n)
          .join(" ")
          .replace(/[.,;:]+$/g, "")
          .trim();
        const key = phrase.toLowerCase();
        if (key.length < 6 || key.length > 64) continue;
        if (isWeakJdPhrase(phrase)) continue;
        // Soft duty tails from JD fluff windows
        if (/\b(experience|plus|required|preferred|needed|must|looking)\s*$/i.test(phrase)) {
          continue;
        }
        // Require technical signal for every window (n>=3 used to allow geo/meta)
        if (!TECH_PHRASE_RE.test(phrase)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(phrase);
        if (out.length >= limit * 3) break;
      }
      if (out.length >= limit * 3) break;
    }
    if (out.length >= limit * 3) break;
  }
  // Fallback: keywords as soft phrases (already skill-oriented)
  if (out.length < 8) {
    for (const k of extractJdKeywords(jd, 20)) {
      if (
        !seen.has(k.toLowerCase()) &&
        !isWeakJdPhrase(k) &&
        isSkillWorthyJdPhrase(k)
      ) {
        out.push(k);
        seen.add(k.toLowerCase());
      }
    }
  }
  return dedupeJdPhrases(out, limit);
}

function dehedge(line: string): string {
  return line
    .replace(HEDGE_RE, (m) => {
      const low = m.toLowerCase();
      if (low.startsWith("helped") || low.startsWith("assisted")) return "delivered";
      if (low.startsWith("involved") || low.startsWith("participated")) return "owned";
      if (low === "various" || low.startsWith("etc")) return "";
      if (low.startsWith("tried") || low.startsWith("attempted")) return "executed";
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function alignVerbsToJd(line: string, jd: string): string {
  const jdLow = (jd || "").toLowerCase();
  const preferred = JD_VERB_BANK.filter((v) => jdLow.includes(v));
  if (!preferred.length) return line;
  const body = stripBullet(line);
  const verbMap: Record<string, string> = {
    configure: "Configured",
    implement: "Implemented",
    integrate: "Integrated",
    validate: "Validated",
    reconcile: "Reconciled",
    design: "Designed",
    lead: "Led",
    deliver: "Delivered",
    optimize: "Optimized",
    automate: "Automated",
    migrate: "Migrated",
    support: "Supported",
    analyze: "Analyzed",
    document: "Documented",
    test: "Tested",
    deploy: "Deployed",
    monitor: "Monitored",
    troubleshoot: "Troubleshot",
  };
  const out = body.replace(
    /^(Worked on|Responsible for|Duties included|Handled|Did)\s+/i,
    () => {
      const v = preferred[0];
      return (verbMap[v] || "Delivered") + " ";
    }
  );
  if (out === body) return line;
  if (isBullet(line)) {
    const prefix = line.match(/^[•▸→–\-\*◆]\s*/)?.[0] || "• ";
    return prefix + out;
  }
  return out;
}

function antiPrototypeLine(line: string, jd: string): string | null {
  const jdLow = (jd || "").toLowerCase();
  for (const rule of OFF_DOMAIN_HEAVY) {
    if (rule.re.test(line) && !rule.unless.test(jdLow)) {
      // Drop pure off-domain booster lines; soft-rewrite if mixed
      if (line.trim().length < 90 && rule.re.test(line) && (line.match(/,/g) || []).length >= 2) {
        return null; // drop skill-dump of wrong domain
      }
      return line.replace(rule.re, "").replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim();
    }
  }
  return line;
}

function ensurePeakEnd(bullets: string[]): string[] {
  if (bullets.length < 2) return bullets;
  const last = bullets[bullets.length - 1];
  if (IMPACT_END_RE.test(last)) return bullets;
  // Move best impact-coded bullet to end if present
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < bullets.length; i++) {
    if (IMPACT_END_RE.test(bullets[i])) {
      const s = (bullets[i].match(IMPACT_END_RE) || []).length;
      if (s >= bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
  }
  if (bestIdx >= 0 && bestIdx !== bullets.length - 1) {
    const copy = [...bullets];
    const [item] = copy.splice(bestIdx, 1);
    copy.push(item);
    return copy;
  }
  return bullets;
}

function reorderBulletsByJd(bullets: string[], jdTokens: Set<string>): string[] {
  const scored = bullets.map((b, i) => ({
    b,
    i,
    s: bulletJdScore(b, jdTokens),
  }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  // Keep relative structure: take top JD bullets first but preserve employer lines outside
  return scored.map((x) => x.b);
}

function processExperienceSection(
  lines: string[],
  jd: string,
  jdTokens: Set<string>
): string[] {
  const out: string[] = [];
  let bulletBuf: string[] = [];

  const flush = () => {
    if (!bulletBuf.length) return;
    let bullets = bulletBuf.map((b) => dehedge(alignVerbsToJd(b, jd)));
    bullets = bullets
      .map((b) => antiPrototypeLine(b, jd))
      .filter((b): b is string => Boolean(b && b.length > 8));
    bullets = reorderBulletsByJd(bullets, jdTokens);
    bullets = ensurePeakEnd(bullets);
    out.push(...bullets);
    bulletBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      out.push(line);
      continue;
    }
    if (isEmployerClientLine(line) || isEnvToolsLine(line) || !isBullet(line)) {
      flush();
      const cleaned = antiPrototypeLine(dehedge(line), jd);
      if (cleaned) out.push(cleaned);
      continue;
    }
    bulletBuf.push(line);
  }
  flush();
  return out;
}

/**
 * Skills section: weave missing *technical* JD phrases into an existing Core /
 * skills line as tokens. Never emit a "JD focus phrases:" dump line — that was
 * the root of Location/Position/Duration spam in CORE COMPETENCIES.
 */
function weaveNgramsIntoSkills(
  lines: string[],
  ngrams: string[],
  resumeText: string
): string[] {
  // Scrub any prior garbage inject from older engine versions
  const scrubbed = lines.filter(
    (l) =>
      !/^\s*JD\s+focus\s+phrases?\s*:/i.test(l) &&
      !/^\s*JD\s+keywords?\s*:/i.test(l)
  );

  const missing = dedupeJdPhrases(
    ngrams.filter(
      (p) =>
        isSkillWorthyJdPhrase(p) &&
        !new RegExp(
          p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        ).test(resumeText)
    ),
    8
  );
  if (!missing.length) return scrubbed.length ? scrubbed : lines;

  // Merge into first Core:/skill bank line; else append as clean token line
  let merged = false;
  const out = scrubbed.map((l) => {
    if (merged) return l;
    if (
      /^(core|primary|technical|skills?|platforms?|tools?|competenc)\s*:/i.test(
        l.trim()
      ) ||
      (l.includes("·") && l.length < 400 && !isBullet(l))
    ) {
      merged = true;
      const existing = l.replace(/\s*$/, "");
      const add = missing
        .filter(
          (p) =>
            !new RegExp(
              p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              "i"
            ).test(existing)
        )
        .slice(0, 6);
      if (!add.length) return existing;
      return `${existing} · ${add.join(" · ")}`;
    }
    return l;
  });

  if (!merged) {
    out.push(`Core: ${missing.slice(0, 8).join(" · ")}`);
  }
  return out;
}

function reinforceEnvKeywordSink(
  lines: string[],
  ngrams: string[],
  skills: string[]
): string[] {
  // Tools only — never dump location/position/duration n-grams into Environment
  const stack = filterEnvironmentTokens(
    [
      ...skills.slice(0, 12),
      ...ngrams.filter(isSkillWorthyJdPhrase).slice(0, 6),
    ],
    { max: 10 }
  );
  if (!stack.length) return lines;
  const envLine =
    formatEnvironmentLine("Environment / tools in period", stack, {
      max: 10,
      sep: " · ",
    }) || `Environment / tools in period: ${stack.join(" · ")}`;
  let replaced = false;
  const out = lines.map((l) => {
    if (
      isEnvToolsLine(l) ||
      /^Environment\s*\/\s*tools/i.test(l) ||
      /^Environment\s*:/i.test(l)
    ) {
      replaced = true;
      return envLine;
    }
    return l;
  });
  void replaced;
  return out;
}

function reinforceSummaryDensity(
  lines: string[],
  jobTitle: string,
  ngrams: string[],
  yearsHint: number
): string[] {
  const clean = lines
    .filter((l) => l.trim() && !isEngineFooterLine(l))
    .map((l) =>
      l
        .replace(/\bI am\b/gi, "")
        .replace(/\bI'm\b/gi, "")
        .replace(/\bmy\b/gi, "the")
        .replace(/\bis positioned as\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((l) => l.length > 28 && !/\bis positioned as\b/i.test(l));

  const y =
    yearsHint > 0
      ? `approximately ${yearsHint}+ years`
      : "multi-year progressive";
  const techNgrams = ngrams.filter(isSkillWorthyJdPhrase).slice(0, 5);
  const pads = [
    `${jobTitle} profile with ${y} of enterprise delivery spanning design, configuration, integration, and production support.`,
    `Technical depth across ${techNgrams.join(", ") || jobTitle} with validation and operational rigor.`,
    `End-to-end ownership of requirements, fit-gap, build cycles, UAT defect triage, and go-live readiness.`,
    `Integration focus: interfaces, master data alignment, exception handling, and controlled release practices.`,
    `Cross-functional coordination with business, QA, infrastructure, and vendor partners through cutover windows.`,
    `Documentation and traceability discipline supporting auditability and knowledge transfer.`,
    `Environment-aware sequencing across DEV/QA/PROD with transport hygiene and supportable designs.`,
    `Controls orientation: reconciliation, monitoring, and production stabilization patterns.`,
    `Reusable configuration patterns and accelerators applied where landscape constraints allow.`,
    `Client-submittable ${jobTitle} narrative with JD-aligned terminology across summary and recent engagements.`,
  ];

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const l of [...clean, ...pads]) {
    const key = l.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(l);
    if (merged.length >= 10) break;
  }
  while (merged.length < 10) {
    merged.push(pads[merged.length % pads.length]);
  }
  return merged.slice(0, 10);
}

function yearsHintFromText(text: string): number {
  const m = text.match(
    /\b(?:approximately|about|over|around)?\s*(\d{1,2})\+?\s*years?\b/i
  );
  if (m) return Math.min(40, Math.max(1, Number(m[1])));
  return 0;
}

export type ResearchEnhanceResult = {
  structured: StructuredResume;
  text: string;
  notes: string[];
};

/**
 * Apply research transforms to a structured pack (after AI / deterministic assemble).
 */
export function researchEnhancePack(opts: {
  structured: StructuredResume;
  jd: string;
  masterText?: string;
  jobTitle?: string;
}): ResearchEnhanceResult {
  const jd = opts.jd || "";
  const jobTitle =
    (opts.jobTitle || opts.structured.meta?.jobTitle || opts.structured.headline || "").trim() ||
    extractJobTitle(jd) ||
    "Consultant";
  const jdTokens = jdTokenSet(jd);
  // Skill-worthy only for pack body; full extract is already meta-scrubbed
  const ngrams = extractJdNgrams(jd, 24).filter(isSkillWorthyJdPhrase);
  const notes: string[] = ["research-enhance:v1"];

  const sections: ResumeSection[] = opts.structured.sections.map((sec) => {
    const h = sec.heading || "";

    // Summary
    if (/summary|profile|pitch|executive brief/i.test(h)) {
      const years = yearsHintFromText(sec.lines.join(" "));
      const lines = reinforceSummaryDensity(sec.lines, jobTitle, ngrams, years);
      notes.push(`summary: ${lines.length} lines impersonal+jargon`);
      return { ...sec, lines };
    }

    // Skills — technical phrases only; never "JD focus phrases:" dump
    if (/skill|competenc|stack|matrix|capability|core/i.test(h)) {
      const resumeSoFar = renderPlainFromStructured({
        ...opts.structured,
        sections: opts.structured.sections,
      });
      const lines = weaveNgramsIntoSkills(sec.lines, ngrams, resumeSoFar);
      notes.push(
        `skills: technical n-gram merge (${Math.min(8, ngrams.length)} candidates)`
      );
      return { ...sec, lines };
    }

    // Experience-like
    if (
      /experience|engagement|employment|work history|project|chapter|leadership|timeline/i.test(
        h
      )
    ) {
      let lines = processExperienceSection(sec.lines, jd, jdTokens);
      // Keyword sink on env lines using skills tokens from skills section
      const skillSec = opts.structured.sections.find((s) =>
        /skill|competenc|stack/i.test(s.heading)
      );
      const skillToks = (skillSec?.lines || [])
        .join(" ")
        .split(/[·|,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2 && s.length < 40)
        .slice(0, 12);
      lines = reinforceEnvKeywordSink(lines, ngrams, skillToks);
      notes.push("experience: primacy reorder + peak-end + verb align + hedge ban");
      return { ...sec, lines };
    }

    // Default: dehedge + anti-prototype
    return {
      ...sec,
      lines: sec.lines
        .map((l) => antiPrototypeLine(dehedge(l), jd))
        .filter((l): l is string => l != null && String(l).length > 0)
        .filter((l) => !isEngineFooterLine(l)),
    };
  });

  // Headline schema match
  const structured: StructuredResume = {
    ...opts.structured,
    headline: jobTitle.slice(0, 120),
    sections,
    meta: {
      ...opts.structured.meta,
      jobTitle,
      progressiveNotes: [
        ...(opts.structured.meta.progressiveNotes || []).filter(
          (n) => !/^research-enhance/i.test(n)
        ),
        ...notes,
      ],
    },
  };

  const text = renderPlainFromStructured(structured);
  return { structured, text, notes };
}
