/**
 * Fit report / coverage checklist (J1) + calibrated confidence (H6)
 * + layout structure applied check.
 * Pure functions — safe to run on UI from pack text + JD + layoutId.
 */

import { extractJdKeywords, extractJobTitle } from "./jd-parse";
import { extractJdNgrams } from "./research-enhance-pack";
import { stripEngineFooter } from "./strip-engine-footer";
import { getStructureDef, STRUCTURE_CATALOG } from "./layout-structures";
import { getLayoutConfig } from "./layout-config";

export type FitRequirement = {
  id: string;
  label: string;
  kind: "title" | "keyword" | "phrase" | "structure" | "layout";
  present: boolean;
  proof?: string;
};

export type LayoutAppliedCheck = {
  layoutId: string;
  layoutName: string;
  applied: boolean;
  firstExpected: string;
  firstFound: string | null;
  expectedHeadings: string[];
  foundHeadings: string[];
  matchedCount: number;
  expectedCount: number;
  missingHeadings: string[];
  note: string;
};

export type FitReport = {
  jobTitle: string;
  coveragePct: number;
  confidence: number;
  confidenceLabel: "low" | "medium" | "high" | "excellent";
  requirements: FitRequirement[];
  missing: string[];
  presentCount: number;
  totalCount: number;
  scanLoad: {
    summaryLines: number;
    summaryChars: number;
    ok: boolean;
    note: string;
  };
  /** Whether pack section structure matches assigned layout */
  layoutApplied: LayoutAppliedCheck | null;
  researchNotes: string[];
};

function findProof(text: string, needle: string): string | undefined {
  if (!needle.trim()) return undefined;
  const re = new RegExp(
    `.{0,40}${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.{0,40}`,
    "i"
  );
  const m = text.match(re);
  return m ? m[0].replace(/\s+/g, " ").trim() : undefined;
}

function has(text: string, needle: string): boolean {
  if (!needle.trim()) return false;
  try {
    return new RegExp(
      needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    ).test(text);
  } catch {
    return text.toLowerCase().includes(needle.toLowerCase());
  }
}

/** Extract section headings from plain pack text (uppercase / title-case lines). */
export function extractPackHeadings(text: string): string[] {
  const lines = stripEngineFooter(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 64) continue;
    if (/^[-–—=]{3,}$/.test(line)) continue;
    if (/^employer\s*\/\s*client:/i.test(line)) continue;
    if (/^[•▸→–\-\*◆]/.test(line)) continue;
    if (/@/.test(line)) continue;
    // ALL CAPS section heading
    if (
      line === line.toUpperCase() &&
      /[A-Z]/.test(line) &&
      line.length >= 4 &&
      line.length <= 56 &&
      !/^\d/.test(line)
    ) {
      // Skip candidate name line (usually first all-caps)
      if (out.length === 0 && line.split(/\s+/).length <= 4 && !/SUMMARY|SKILL|EXPERIENCE|EDUCATION|COMPETENC|BRIEF|MATRIX|ARC|WORK|PORTFOLIO|MILESTONE|SNAPSHOT|CREDENTIAL|FOUNDATION|KEYWORDS|PITCH|CHAPTER|ACHIEVEMENT|METHOD|SITUATION|CASE|OUTCOME|COMMERCIAL/i.test(line)) {
        // might be name — only skip if no known section words
        const known =
          /SUMMARY|SKILL|EXPERIENCE|EDUCATION|COMPETENC|BRIEF|MATRIX|ARC|WORK|PORTFOLIO|MILESTONE|SNAPSHOT|CREDENTIAL|FOUNDATION|KEYWORDS|PITCH|CHAPTER|ACHIEVEMENT|METHOD|SITUATION|CASE|OUTCOME|PROFILE|SELECTED|SIGNATURE|LEADERSHIP|BOARD|DEEP|DEFINING|PRIOR|FOOTNOTE|CAPABILITY|SYSTEM|DELIVERY|ENGINEERING|CAREER|SKILL EVOLUTION|THE ANSWER|EVIDENCE|DETAIL|BACKGROUND|PRIMARY/i;
        if (!known.test(line)) continue;
      }
      out.push(line);
      continue;
    }
    // Title Case multi-word headings (Executive Brief, Career Arc, …)
    if (
      /^[A-Z][A-Za-z0-9/&|+\- ]{3,55}$/.test(line) &&
      /[a-z]/.test(line) &&
      line.split(/\s+/).length <= 6 &&
      /^(Professional|Core|Selected|Executive|Signature|Leadership|Board|Capability|Systems|Delivery|Deep|Career|Chapter|Skill|Defining|Keywords|Pitch|Prior|Profile|Key|Situation|Case|Outcome|Method|Commercial|The Answer|Supporting|Evidence|Detail|Background|Foundation|Footnotes)/i.test(
        line
      )
    ) {
      out.push(line);
    }
  }
  // de-dupe preserving order
  const seen = new Set<string>();
  return out.filter((h) => {
    const k = h.toUpperCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normHead(h: string): string {
  return h
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check pack text section structure against assigned layout expectations.
 */
export function checkLayoutApplied(
  resumeText: string,
  layoutId?: string | null
): LayoutAppliedCheck | null {
  if (!layoutId) return null;
  const cfg = getLayoutConfig(layoutId);
  const inCatalog = STRUCTURE_CATALOG.some((s) => s.id === cfg.id);
  const expected = inCatalog
    ? getStructureDef(cfg.id).expectedHeadings
    : cfg.sections
        .filter((s) => s.enabled)
        .sort((a, b) => a.order - b.order)
        .map((s) => s.heading);

  const found = extractPackHeadings(resumeText);
  const foundNorm = found.map(normHead);
  const missingHeadings = expected.filter(
    (h) => !foundNorm.includes(normHead(h))
  );
  const matchedCount = expected.length - missingHeadings.length;
  const firstExpected = expected[0] || "";
  const firstFound = found[0] || null;
  const firstOk =
    !firstExpected ||
    (firstFound != null && normHead(firstFound) === normHead(firstExpected));
  // Layout applied if first section matches and ≥60% expected headings present
  const ratio = expected.length ? matchedCount / expected.length : 0;
  const applied = firstOk && ratio >= 0.6;

  return {
    layoutId: cfg.id,
    layoutName: cfg.name,
    applied,
    firstExpected,
    firstFound,
    expectedHeadings: expected,
    foundHeadings: found,
    matchedCount,
    expectedCount: expected.length,
    missingHeadings,
    note: applied
      ? `Layout “${cfg.name}” structure detected (opens with ${firstFound})`
      : firstOk
        ? `Layout partial: missing ${missingHeadings.slice(0, 3).join(", ") || "sections"}`
        : `Layout not applied: expected first “${firstExpected}”, found “${firstFound || "none"}”`,
  };
}

export function buildFitReport(opts: {
  resumeText: string;
  jd: string;
  jobTitle?: string | null;
  layoutId?: string | null;
}): FitReport {
  const text = stripEngineFooter(opts.resumeText || "");
  const jd = opts.jd || "";
  const jobTitle =
    (opts.jobTitle || "").trim() || extractJobTitle(jd) || "Target role";

  const keywords = extractJdKeywords(jd, 28);
  const ngrams = extractJdNgrams(jd, 16);

  const requirements: FitRequirement[] = [];

  // Layout structure applied (assigned layoutId vs pack headings)
  const layoutApplied = checkLayoutApplied(text, opts.layoutId);
  if (layoutApplied) {
    requirements.push({
      id: "layout-applied",
      label: `Layout applied: ${layoutApplied.layoutName}`,
      kind: "layout",
      present: layoutApplied.applied,
      proof: layoutApplied.note,
    });
    requirements.push({
      id: "layout-first-section",
      label: `Opens with “${layoutApplied.firstExpected}”`,
      kind: "layout",
      present:
        !!layoutApplied.firstFound &&
        normHead(layoutApplied.firstFound) ===
          normHead(layoutApplied.firstExpected),
      proof: layoutApplied.firstFound
        ? `Found: ${layoutApplied.firstFound}`
        : "No section heading detected at top of pack",
    });
  }

  // Title schema match
  const titlePresent =
    has(text, jobTitle) ||
    has(text.split("\n").slice(0, 8).join("\n"), jobTitle.slice(0, 24));
  requirements.push({
    id: "title",
    label: `Role title: ${jobTitle}`,
    kind: "title",
    present: titlePresent,
    proof: titlePresent ? findProof(text, jobTitle.slice(0, 40)) : undefined,
  });

  // Structure
  const hasSummary = /professional summary|executive brief|summary|career arc|pitch|profile summary|the answer|situation snapshot/i.test(
    text
  );
  const hasSkills = /technical skills|skills|competenc|capability matrix|keywords|skill evolution|evidence toolkit/i.test(
    text
  );
  const hasEmployer = /employer\s*\/\s*client:/i.test(text);
  requirements.push({
    id: "struct-summary",
    label: "Summary / pitch section present",
    kind: "structure",
    present: hasSummary,
  });
  requirements.push({
    id: "struct-skills",
    label: "Skills section present",
    kind: "structure",
    present: hasSkills,
  });
  requirements.push({
    id: "struct-employer",
    label: "Employer / Client lines present",
    kind: "structure",
    present: hasEmployer,
  });

  // Keywords
  for (const k of keywords.slice(0, 18)) {
    const present = has(text, k);
    requirements.push({
      id: `kw-${k}`,
      label: k,
      kind: "keyword",
      present,
      proof: present ? findProof(text, k) : undefined,
    });
  }

  // Phrases / n-grams
  for (const p of ngrams.slice(0, 10)) {
    const present = has(text, p);
    requirements.push({
      id: `ph-${p.slice(0, 40)}`,
      label: p,
      kind: "phrase",
      present,
      proof: present ? findProof(text, p) : undefined,
    });
  }

  const presentCount = requirements.filter((r) => r.present).length;
  const totalCount = requirements.length || 1;
  const coveragePct = Math.round((presentCount / totalCount) * 100);

  // Calibrated confidence (not always 100)
  let confidence = coveragePct;
  if (!titlePresent) confidence = Math.min(confidence, 72);
  if (!hasEmployer) confidence = Math.min(confidence, 80);
  if (!hasSummary) confidence = Math.min(confidence, 75);
  if (layoutApplied && !layoutApplied.applied) {
    confidence = Math.min(confidence, 78);
  }
  // Summary density preference
  const summaryBlock = extractSummaryBlock(text);
  const summaryLines = summaryBlock.filter((l) => l.trim().length > 20).length;
  const summaryChars = summaryBlock.join(" ").length;
  if (summaryLines < 6) confidence = Math.min(confidence, confidence - 5);
  if (summaryLines >= 10) confidence = Math.min(100, confidence + 3);
  if (layoutApplied?.applied) confidence = Math.min(100, confidence + 2);
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const confidenceLabel: FitReport["confidenceLabel"] =
    confidence >= 92
      ? "excellent"
      : confidence >= 80
        ? "high"
        : confidence >= 65
          ? "medium"
          : "low";

  const scanLoadOk = summaryLines <= 12 && summaryChars <= 2200;
  const missing = requirements.filter((r) => !r.present).map((r) => r.label);

  return {
    jobTitle,
    coveragePct,
    confidence,
    confidenceLabel,
    requirements,
    missing: missing.slice(0, 16),
    presentCount,
    totalCount,
    scanLoad: {
      summaryLines,
      summaryChars,
      ok: scanLoadOk,
      note: scanLoadOk
        ? "Scan load OK for 6–8s recruiter skim"
        : "Summary may be heavy — consider trimming soft lines",
    },
    layoutApplied,
    researchNotes: [
      "Layout: first section + expected headings match assigned layout",
      "Primacy: JD proof first in experience bullets",
      "Peak–end: impact-coded close on roles",
      "Schema: title isomorphism",
      "N-grams: exact JD phrase weave",
      "Anti-prototype: off-domain stack demotion",
      "Impersonal 10-line jargon summary",
    ],
  };
}

function extractSummaryBlock(text: string): string[] {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inSum = false;
  for (const line of lines) {
    if (/^\s*(professional summary|executive brief|summary)\s*$/i.test(line.trim())) {
      inSum = true;
      continue;
    }
    if (inSum && /^[A-Z][A-Z0-9 /&|]{2,40}$/.test(line.trim()) && line.trim().length < 48) {
      break;
    }
    if (inSum) out.push(line);
  }
  return out;
}
