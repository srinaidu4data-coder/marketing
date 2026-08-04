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

/** Extract multi-word phrases (2–4 tokens) from JD for n-gram weave. */
export function extractJdNgrams(jd: string, limit = 24): string[] {
  const lines = (jd || "")
    .replace(/\r\n/g, "\n")
    .split(/\n|[•;]/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 8 && l.length < 120);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const words = line
      .replace(/[^a-zA-Z0-9+/.\-#\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    for (let n = 4; n >= 2; n--) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(" ");
        const key = phrase.toLowerCase();
        if (key.length < 6 || key.length > 64) continue;
        if (/^(and|the|for|with|from|this|that|will|must|have)\b/i.test(phrase))
          continue;
        if (seen.has(key)) continue;
        // Prefer technical-looking phrases
        if (
          !/[A-Z]{2,}|\/|\d|SAP|ATTP|EPCIS|GS1|DSCSA|S\/4|HANA|CDISC|EDC|SDTM|FI|CO|MM|SD|ABAP|API|JSON|XML/i.test(
            phrase
          ) &&
          n < 3
        ) {
          continue;
        }
        seen.add(key);
        out.push(phrase);
        if (out.length >= limit) return out;
      }
    }
  }
  // Fallback: keywords as soft phrases
  if (out.length < 8) {
    for (const k of extractJdKeywords(jd, 20)) {
      if (!seen.has(k.toLowerCase())) {
        out.push(k);
        seen.add(k.toLowerCase());
      }
    }
  }
  return out.slice(0, limit);
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

function weaveNgramsIntoSkills(
  lines: string[],
  ngrams: string[],
  resumeText: string
): string[] {
  const missing = ngrams
    .filter((p) => !new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(resumeText))
    .slice(0, 10);
  if (!missing.length) return lines;
  const inject = `JD focus phrases: ${missing.join(" · ")}`;
  if (lines.some((l) => /JD focus phrases:/i.test(l))) return lines;
  return [inject, ...lines];
}

function reinforceEnvKeywordSink(
  lines: string[],
  ngrams: string[],
  skills: string[]
): string[] {
  const stack = [...ngrams.slice(0, 6), ...skills.slice(0, 8)]
    .filter(Boolean)
    .slice(0, 12);
  if (!stack.length) return lines;
  const envLine = `Environment / tools in period: ${stack.join(", ")}`;
  let replaced = false;
  const out = lines.map((l) => {
    if (isEnvToolsLine(l) || /^Environment\s*\/\s*tools/i.test(l)) {
      replaced = true;
      return envLine;
    }
    return l;
  });
  // Only inject into recent-ish blocks: if no env line, append after first employer block end is hard;
  // leave as-is if none found
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
  const pads = [
    `${jobTitle} profile with ${y} of enterprise delivery spanning design, configuration, integration, and production support.`,
    `Technical depth across ${ngrams.slice(0, 5).join(", ") || jobTitle} with validation and operational rigor.`,
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
  const ngrams = extractJdNgrams(jd, 24);
  const notes: string[] = ["research-enhance:v1"];

  let sections: ResumeSection[] = opts.structured.sections.map((sec) => {
    const h = sec.heading || "";

    // Summary
    if (/summary|profile|pitch|executive brief/i.test(h)) {
      const years = yearsHintFromText(sec.lines.join(" "));
      const lines = reinforceSummaryDensity(sec.lines, jobTitle, ngrams, years);
      notes.push(`summary: ${lines.length} lines impersonal+jargon`);
      return { ...sec, lines };
    }

    // Skills
    if (/skill|competenc|stack|matrix|capability|core/i.test(h)) {
      const resumeSoFar = renderPlainFromStructured({
        ...opts.structured,
        sections: opts.structured.sections,
      });
      const lines = weaveNgramsIntoSkills(sec.lines, ngrams, resumeSoFar);
      notes.push(`skills: n-gram weave ${Math.min(10, ngrams.length)}`);
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
