/**
 * Honesty / ship-no-ship controls.
 *
 * - Low JD∩master overlap → transferable framing only (no industry cosplay)
 * - Scrub invented industry/domain tenure claims from summary
 * - Hard assert all master clients present in pack
 */

import type { MasterProfile } from "./master-profile";
import { parseStoredMasterProfile } from "./master-profile";
import { skillsHonestFromSources } from "./jd-parse";

/** Token overlap ratio JD∩master skill banks (0–1). */
export function groundedOverlapRatio(jd: string, master: string): number {
  const h = skillsHonestFromSources(jd || "", master || "", 50);
  const denom = Math.max(1, h.grounded.length + h.jdOnly.length);
  return h.grounded.length / denom;
}

/** True when JD and master barely share skills — high risk of domain cosplay. */
export function isLowOverlap(jd: string, master: string, threshold = 0.22): boolean {
  return groundedOverlapRatio(jd, master) < threshold;
}

/** Industry / domain claims that must appear in master text to survive. */
const INDUSTRY_CLAIM_PATTERNS: { re: RegExp; masterNeed: RegExp; label: string }[] = [
  {
    re: /\b(?:pharmaceutical|pharma|biotech|life\s+sciences?)\s+industry\b/i,
    masterNeed: /\b(pharma|pharmaceutical|biotech|life\s+sciences?|clinical\s+trial)\b/i,
    label: "pharma industry tenure",
  },
  {
    re: /\bin the (?:pharmaceutical|pharma|biotech|clinical)\b/i,
    masterNeed: /\b(pharma|pharmaceutical|biotech|clinical\s+trial|life\s+sciences?)\b/i,
    label: "pharma sector claim",
  },
  {
    // Invented clinical career: "years of clinical data management / clinical trials" — NOT "positioned as CDM with years of progressive experience"
    re: /\b(?:years?|experience)\b(?:\s+\w+){0,6}\s+(?:of|in)\s+clinical\s+(?:data|trials?|research)\b|\bclinical\s+(?:data\s+management|trials?)\b(?:\s+\w+){0,4}\s+(?:years?|experience)\b/i,
    masterNeed: /\b(clinical\s+data|clinical\s+trial|cdisc|edc|sdtm)\b/i,
    label: "clinical career span",
  },
  {
    re: /\b(?:banking|fintech)\s+industry\b/i,
    masterNeed: /\b(bank|banking|fintech|financial\s+services)\b/i,
    label: "banking industry",
  },
  {
    re: /\b(?:retail|e-?commerce)\s+industry\b/i,
    masterNeed: /\b(retail|e-?commerce|merchandis)\b/i,
    label: "retail industry",
  },
];

/** SAP go-live jargon that must not appear on non-SAP clinical packs. */
const SAP_RITUAL_RE =
  /\b(cutover|hypercare|RICEFW|blueprinting|ASAP|Activate methodology|FI-CO|S\/4HANA Finance|Material Ledger)\b/i;

export function masterSupportsIndustryClaim(
  master: string,
  claimLabel: string
): boolean {
  const m = master || "";
  const row = INDUSTRY_CLAIM_PATTERNS.find((p) => p.label === claimLabel);
  if (!row) return true;
  return row.masterNeed.test(m);
}

/**
 * Scrub summary lines that invent industry careers not on the master.
 * Never replaces the block with a third-person “positioned as…” disclaimer —
 * AI / dense jargon lines are preserved (product rule: 10-line summary).
 */
export function scrubSummaryHonesty(opts: {
  lines: string[];
  master: string;
  jobTitle: string;
  yearsHint: number;
  candidateName: string;
  lowOverlap: boolean;
  /** Keep this many lines (default 10). */
  targetLines?: number;
  /** When true, do not collapse density for low-overlap packs. */
  preserveDensity?: boolean;
}): string[] {
  const master = opts.master || "";
  const target = Math.max(1, opts.targetLines ?? 10);

  let lines = opts.lines
    .map((l) => String(l).replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 20)
    // Ban third-person bio / first-person residual
    .filter(
      (l) =>
        !/\bis positioned as\b/i.test(l) &&
        !/without claiming a specialty career/i.test(l) &&
        !/\bI am\b/i.test(l) &&
        !/\bI'm\b/i.test(l)
    );

  // Drop industry cosplay sentences
  lines = lines.filter((line) => {
    for (const p of INDUSTRY_CLAIM_PATTERNS) {
      if (p.re.test(line) && !p.masterNeed.test(master)) return false;
    }
    return true;
  });

  // Soft-replace residual unsupported industry spans (keep line, rewrite claim)
  lines = lines
    .map((line) => {
      let out = line;
      for (const p of INDUSTRY_CLAIM_PATTERNS) {
        if (p.re.test(out) && !p.masterNeed.test(master)) {
          out = out
            .replace(p.re, "across enterprise delivery programs")
            .replace(/\s{2,}/g, " ")
            .trim();
        }
      }
      if (
        opts.lowOverlap &&
        /\b(pharmaceutical|clinical data management|clinical studies|drug development)\b/i.test(
          out
        ) &&
        !/\b(clinical|pharma|cdisc|edc)\b/i.test(master)
      ) {
        out = out
          .replace(
            /\bin the Pharmaceutical industry[^.]*\.?/gi,
            "across data-intensive enterprise programs."
          )
          .replace(
            /specializing in data management activities for clinical studies[^.]*\.?/gi,
            "with emphasis on data quality, validation discipline, documentation, and controlled testing cycles."
          )
          .replace(/\s{2,}/g, " ")
          .trim();
      }
      return out;
    })
    .filter((l) => l.length > 36);

  // Low-overlap: drop only blatant specialty ownership claims, keep density
  if (opts.lowOverlap && !opts.preserveDensity) {
    lines = lines.filter(
      (l) =>
        !/\b(DMP|CRF design|clinical study ownership|years as a clinical)\b/i.test(
          l
        )
    );
  }

  if (!lines.length) {
    const y =
      opts.yearsHint > 0
        ? `approximately ${opts.yearsHint}+ years`
        : "multi-year progressive";
    return [
      `${opts.jobTitle} profile with ${y} of enterprise delivery, configuration, integration, and production support exposure.`,
    ].slice(0, target);
  }

  return lines.slice(0, target);
}

/** Scrub SAP ritual language from bullets when JD domain is non-SAP (e.g. clinical-dm). */
export function scrubSapRitualFromBullets(
  bullets: string[],
  domain: string
): string[] {
  const d = (domain || "").toLowerCase();
  const sapDomains = new Set([
    "fico",
    "rar",
    "ewm",
    "mm",
    "sd",
    "basis",
    "abap",
    "generic",
  ]);
  // clinical and other non-impl domains: strip cutover/hypercare etc.
  if (sapDomains.has(d) && d !== "generic") return bullets;
  if (d === "clinical-dm" || d === "generic") {
    return bullets.filter((b) => !SAP_RITUAL_RE.test(b));
  }
  return bullets;
}

function normClient(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/^employer\s*\/\s*client:\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hard gate: every master employer must appear in the tailored pack text.
 */
export function assertAllMasterClientsPresent(opts: {
  masterProfileJson?: string | null;
  masterText?: string;
  tailoredText: string;
  clients?: string[];
}): void {
  let clients = opts.clients || [];
  if (!clients.length) {
    const p = parseStoredMasterProfile(opts.masterProfileJson);
    clients = p?.engagements.map((e) => e.client) || [];
  }
  if (!clients.length) return;

  const textLc = (opts.tailoredText || "").toLowerCase();
  const missing: string[] = [];
  for (const client of clients) {
    const core = client.split(",")[0].trim();
    const tokens = normClient(core).split(" ").filter((t) => t.length > 3);
    const primary =
      tokens.find((t) => t.length >= 5) || tokens[0] || normClient(core);
    if (primary.length < 3 || !textLc.includes(primary)) {
      missing.push(core);
    }
  }
  if (missing.length) {
    throw new Error(
      `Resume generation blocked: every master employer must appear in the pack. Missing: ${missing.join("; ")}. Full resume was not generated.`
    );
  }
}



export function packHasIndustryCosplay(
  text: string,
  masterText: string
): string[] {
  const hits: string[] = [];
  for (const p of INDUSTRY_CLAIM_PATTERNS) {
    if (p.re.test(text) && !p.masterNeed.test(masterText || "")) {
      hits.push(p.label);
    }
  }
  return hits;
}

/**
 * Free metrics: % / $ / “reduced by N” claims that are not supported by master text.
 * Costly-signal rule (Spence): numbers without master provenance are cheap lies.
 */
export function packHasFreeMetrics(
  tailoredText: string,
  masterText: string
): string[] {
  const text = tailoredText || "";
  const master = (masterText || "").toLowerCase();
  const flags: string[] = [];
  const seen = new Set<string>();

  const push = (s: string) => {
    const k = s.slice(0, 80);
    if (seen.has(k)) return;
    seen.add(k);
    flags.push(s);
  };

  // Percentages: "30%", "30 percent", "by 25%"
  const pctRe =
    /\b(\d{1,3})\s*%|\b(\d{1,3})\s*percent\b|\bby\s+(\d{1,3})\s*%/gi;
  let m: RegExpExecArray | null;
  while ((m = pctRe.exec(text))) {
    const n = m[1] || m[2] || m[3];
    if (!n) continue;
    // Master must contain the same number near % or the exact token
    if (
      !master.includes(`${n}%`) &&
      !master.includes(`${n} percent`) &&
      !new RegExp(`\\b${n}\\b`).test(master)
    ) {
      push(`${n}% claim not on master`);
    }
  }

  // Currency / rates that look like achievement metrics (not salary JD noise)
  const moneyRe =
    /(?:saved|reduced costs?|cut costs?|increased revenue|roi of)\s*\$?\s*[\d,]+/gi;
  while ((m = moneyRe.exec(text))) {
    const frag = m[0].toLowerCase();
    const digits = frag.replace(/[^\d]/g, "");
    if (digits && !master.includes(digits)) {
      push(`money metric not on master: ${m[0].slice(0, 40)}`);
    }
  }

  // “X× faster / reduced by N times”
  const multRe = /\b(\d+(?:\.\d+)?)\s*[x×]\s*(?:faster|improvement|increase)/gi;
  while ((m = multRe.exec(text))) {
    if (!master.includes(m[1])) push(`${m[1]}× claim not on master`);
  }

  return flags.slice(0, 12);
}

/**
 * Master residue: SAP/finance config bullets under clinical-looking packs
 * (or inverse) when mode is transfer/strict.
 */
export function packHasMasterResidueLeak(
  tailoredText: string,
  jd: string,
  mode: "same_domain" | "transfer" | "strict" | string
): string[] {
  // same_domain: full JD rewrite expected — residue check off
  // strict removed product-wide; treat as transfer if seen
  if (mode === "same_domain") return [];
  const text = tailoredText || "";
  const jdLc = (jd || "").toLowerCase();
  const clinicalJd =
    /\b(clinical|cdm|cdisc|edc|sdtm|pharma|trial)\b/i.test(jdLc);
  const sapJd = /\bsap\b|s\/4|fico|ewm\b/i.test(jdLc);
  const flags: string[] = [];

  if (clinicalJd && !sapJd) {
    const sapBullets =
      text.match(
        /^[•\-–—*].{0,200}\b(chart of accounts|material ledger|mm-fi|sd-fi|fico|lockbox|vertex tax|cfin|ltmc|s\/4hana|ariba|opentext vim)\b/gim
      ) || [];
    if (sapBullets.length) {
      flags.push(
        `SAP/finance bullets on clinical pack (${sapBullets.length})`
      );
    }
    // Environment lines pure clinical on every job while bullets are SAP — caught above
  }

  if (sapJd && !clinicalJd) {
    const clin =
      text.match(
        /^[•\-–—*].{0,200}\b(CRF Completion|Data Management Plan|CDISC|SDTM|eCRF|Medidata)\b/gim
      ) || [];
    if (clin.length >= 3) {
      flags.push(`Clinical specialty bullets on SAP pack (${clin.length})`);
    }
  }

  return flags;
}

/** Count distinct “N years” tenure claims in text. */
export function countYearsClaims(text: string): number {
  const re =
    /\b(?:approximately|about|over|more than)?\s*\d{1,2}\+?\s*years?\b|\b\d{1,2}\+\s*years?\b/gi;
  const hits = text.match(re) || [];
  return hits.length;
}

export function masterIndustriesFromProfile(
  profile: MasterProfile | null
): string {
  if (!profile) return "";
  return profile.engagements
    .map((e) => `${e.industry || ""} ${e.environment || ""} ${e.project || ""}`)
    .join(" ");
}
