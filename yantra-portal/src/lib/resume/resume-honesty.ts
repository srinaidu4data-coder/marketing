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
 * Low-overlap: also force transferable positioning language.
 */
export function scrubSummaryHonesty(opts: {
  lines: string[];
  master: string;
  jobTitle: string;
  yearsHint: number;
  candidateName: string;
  lowOverlap: boolean;
}): string[] {
  const master = opts.master || "";
  const first = (opts.candidateName || "Candidate").split(/\s+/)[0];
  const yearsPart =
    opts.yearsHint > 0
      ? ` with approximately ${opts.yearsHint}+ years of progressive professional experience`
      : " with progressive professional experience";

  let lines = opts.lines
    .map((l) => String(l).replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 20);

  // Drop industry cosplay sentences
  lines = lines.filter((line) => {
    for (const p of INDUSTRY_CLAIM_PATTERNS) {
      if (p.re.test(line) && !p.masterNeed.test(master)) return false;
    }
    // "years in the X industry" without master support
    if (
      /\byears?\b.+\bindustry\b|\bindustry\b.+\byears?\b/i.test(line) &&
      !/\b(sap|erp|consulting|implementation|enterprise)\b/i.test(master.slice(0, 2000))
    ) {
      // If master is clearly SAP/consulting, only ban non-supported industries (handled above)
    }
    for (const p of INDUSTRY_CLAIM_PATTERNS) {
      if (p.re.test(line) && !p.masterNeed.test(master)) return false;
    }
    return true;
  });

  // Soft-replace residual "in the Pharmaceutical industry" style spans
  lines = lines.map((line) => {
    let out = line;
    for (const p of INDUSTRY_CLAIM_PATTERNS) {
      if (p.re.test(out) && !p.masterNeed.test(master)) {
        out = out
          .replace(p.re, "across enterprise delivery programs")
          .replace(/\s{2,}/g, " ")
          .trim();
      }
    }
    // Strip absolute clinical career ownership if master lacks clinical
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
          "with emphasis on data quality, validation discipline, documentation, and stakeholder coordination transferable to this search."
        )
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    return out;
  }).filter((l) => l.length > 40);

  if (opts.lowOverlap) {
    // Prefer a single honest positioning opener — no leftover DMP/CRF ownership claims
    const honest = `${first} is positioned as a ${opts.jobTitle}${yearsPart}, drawing on transferable strengths in data quality, process ownership, documentation, testing discipline, and stakeholder coordination — without claiming a specialty career that is not supported by the master resume.`;
    // Low-overlap: do not keep JD-specialty ownership lines (DMP/CRF/clinical studies)
    return [honest];
  }

  if (!lines.length) {
    return [
      `${first} is positioned as a ${opts.jobTitle}${yearsPart}, mapped honestly to this role using master-backed delivery history.`,
    ];
  }
  return lines.slice(0, 5);
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

export function masterIndustriesFromProfile(
  profile: MasterProfile | null
): string {
  if (!profile) return "";
  return profile.engagements
    .map((e) => `${e.industry || ""} ${e.environment || ""} ${e.project || ""}`)
    .join(" ");
}
