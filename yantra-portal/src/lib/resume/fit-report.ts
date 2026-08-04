/**
 * Fit report / coverage checklist (J1) + calibrated confidence (H6).
 * Pure functions — safe to run on localhost UI from pack text + JD.
 */

import { extractJdKeywords, extractJobTitle } from "./jd-parse";
import { extractJdNgrams } from "./research-enhance-pack";
import { stripEngineFooter } from "./strip-engine-footer";

export type FitRequirement = {
  id: string;
  label: string;
  kind: "title" | "keyword" | "phrase" | "structure";
  present: boolean;
  proof?: string;
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

export function buildFitReport(opts: {
  resumeText: string;
  jd: string;
  jobTitle?: string | null;
}): FitReport {
  const text = stripEngineFooter(opts.resumeText || "");
  const jd = opts.jd || "";
  const jobTitle =
    (opts.jobTitle || "").trim() || extractJobTitle(jd) || "Target role";

  const keywords = extractJdKeywords(jd, 28);
  const ngrams = extractJdNgrams(jd, 16);

  const requirements: FitRequirement[] = [];

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
  const hasSummary = /professional summary|executive brief|summary/i.test(text);
  const hasSkills = /technical skills|skills|competenc/i.test(text);
  const hasEmployer = /employer\s*\/\s*client:/i.test(text);
  requirements.push({
    id: "struct-summary",
    label: "Professional Summary present",
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
  // Summary density preference
  const summaryBlock = extractSummaryBlock(text);
  const summaryLines = summaryBlock.filter((l) => l.trim().length > 20).length;
  const summaryChars = summaryBlock.join(" ").length;
  if (summaryLines < 6) confidence = Math.min(confidence, confidence - 5);
  if (summaryLines >= 10) confidence = Math.min(100, confidence + 3);
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
    researchNotes: [
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
