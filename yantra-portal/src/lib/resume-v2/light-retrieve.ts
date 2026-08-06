/**
 * C1 — Project-complete skeleton + per-slot lexical evidence + bank rank.
 * Never drops employers (global top-k forbidden). Fail-open to full master.
 */

import {
  parseStoredMasterProfile,
  type MasterProfile,
  type MasterEngagement,
} from "@/lib/resume/master-profile";

export type EvidenceSnippet = {
  slot: number;
  employer: string;
  score: number;
  text: string;
};

export type LightRetrieveResult = {
  /** Inject into user message — skeleton + per-slot evidence */
  evidenceBlock: string;
  /** Ranked bank lines (best first) for pad / prompt */
  rankedBank: string[];
  retrieveUsed: boolean;
  retrieveMode: "lexical_per_slot" | "full_master";
  slotCount: number;
};

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/** Simple BM25-ish score for short corpora */
export function lexicalScore(queryTokens: string[], doc: string): number {
  if (!queryTokens.length || !doc) return 0;
  const d = doc.toLowerCase();
  const dt = new Set(tokenize(d));
  let score = 0;
  const qf = new Map<string, number>();
  for (const t of queryTokens) qf.set(t, (qf.get(t) || 0) + 1);
  for (const [t, qn] of Array.from(qf.entries())) {
    if (!dt.has(t) && !d.includes(t)) continue;
    // acronym boost
    const boost = t.length <= 5 && /^[a-z0-9]+$/.test(t) ? 2.2 : 1;
    const tf = (d.split(t).length - 1) || (dt.has(t) ? 1 : 0);
    score += boost * qn * (1 + Math.log(1 + tf));
  }
  return score;
}

export function rankBankLexical(jd: string, bank: string[], topK = 40): string[] {
  const qt = tokenize(jd);
  if (!qt.length) return bank.slice(0, topK);
  return [...bank]
    .map((b, i) => ({ b, i, s: lexicalScore(qt, b) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, topK)
    .map((x) => x.b);
}

function formatEngagementSkeleton(e: MasterEngagement, index: number): string {
  const end = e.endYear === "Present" ? "Present" : String(e.endYear);
  const lines = [
    `[SLOT ${index}] employerOrClient: ${e.client}`,
    `  duration: ${e.startYear} – ${end}`,
    `  location: ${e.location || ""}`,
    // Historical title is lock-context only — never paste when JD domain differs
    `  historical_master_title_DO_NOT_COPY_IF_WRONG_DOMAIN: ${e.title || ""}`,
    `  project: ${e.project || ""}`,
    `  REQUIRED: invent projects[${index}].role from the JD domain (not the historical title above).`,
  ];
  return lines.join("\n");
}

function topBulletsForSlot(
  e: MasterEngagement,
  queryTokens: string[],
  perSlot = 3
): string[] {
  const bullets = e.bullets || [];
  if (!bullets.length) return [];
  return [...bullets]
    .map((b, i) => ({
      b,
      i,
      s: lexicalScore(queryTokens, `${e.title} ${e.project || ""} ${b}`),
    }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, perSlot)
    .map((x) => x.b.replace(/^[•\-–*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Build project-complete context block.
 * Always lists every engagement; adds per-slot top bullets by JD lexical score.
 */
export function buildLightContext(opts: {
  masterText: string;
  jd: string;
  masterProfileJson?: string | null;
  bank?: string[];
  perSlotEvidence?: number;
}): LightRetrieveResult {
  const master = (opts.masterText || "").trim();
  const jd = (opts.jd || "").trim();
  const qt = tokenize(jd);
  const profile = parseStoredMasterProfile(opts.masterProfileJson);
  const bank = opts.bank || [];
  const rankedBank = bank.length ? rankBankLexical(jd, bank, 50) : [];
  const perSlot = opts.perSlotEvidence ?? 3;

  if (profile?.engagements?.length) {
    return buildFromProfile(profile, master, jd, qt, rankedBank, perSlot);
  }

  // Fallback: full master + optional bank rank (no slots)
  return {
    evidenceBlock: [
      "=== PROJECT SKELETON + EVIDENCE ===",
      "No structured MasterProfile — using FULL MASTER (fail-open).",
      "You MUST still emit one projects[] entry per real employer in the master with exact employerOrClient, duration, location.",
      "",
      "=== FULL MASTER ===",
      master.slice(0, 28000),
    ].join("\n"),
    rankedBank,
    retrieveUsed: false,
    retrieveMode: "full_master",
    slotCount: 0,
  };
}

function buildFromProfile(
  profile: MasterProfile,
  master: string,
  jd: string,
  qt: string[],
  rankedBank: string[],
  perSlot: number
): LightRetrieveResult {
  const parts: string[] = [
    "=== PROJECT-COMPLETE SKELETON (ALL employers — never drop a slot) ===",
    "For EACH slot: same employerOrClient, duration, location (LOCKS).",
    "Rewrite role, techStack, environment, and ALL bullets in **JD domain language** for EVERY slot.",
    "Do NOT paste historical_master_title when it is a different module/domain than the JD (e.g. FICO title on a BRIM JD).",
    "Evidence bullets are facts only — do not invent employers/metrics.",
    "",
  ];

  let anyEvidence = false;
  profile.engagements.forEach((e, index) => {
    parts.push(formatEngagementSkeleton(e, index));
    const top = topBulletsForSlot(e, qt, perSlot);
    if (top.length) {
      anyEvidence = true;
      parts.push("  evidence (JD-ranked master bullets — facts only):");
      for (const b of top) parts.push(`    • ${b}`);
    } else if ((e.bullets || []).length) {
      // Still show first bullets so slot is not empty of proof
      parts.push("  evidence (master bullets):");
      for (const b of (e.bullets || []).slice(0, perSlot)) {
        parts.push(`    • ${b.replace(/^[•\-–*]\s*/, "").trim()}`);
      }
      anyEvidence = true;
    }
    parts.push("");
  });

  if (rankedBank.length) {
    parts.push(
      "=== RANKED SKILL-NEUTRAL BANK (pad only if a role is still thin; pick distinct lines) ==="
    );
    for (const b of rankedBank.slice(0, 24)) {
      parts.push(`• ${b}`);
    }
    parts.push("");
  }

  // Keep a compact raw master tail for education/skills not in profile
  parts.push(
    "=== MASTER RAW (skills/education/contact support; do not invent employers beyond skeleton) ===",
    master.slice(0, 12000)
  );

  return {
    evidenceBlock: parts.join("\n"),
    rankedBank,
    retrieveUsed: anyEvidence || profile.engagements.length > 0,
    retrieveMode: "lexical_per_slot",
    slotCount: profile.engagements.length,
  };
}
