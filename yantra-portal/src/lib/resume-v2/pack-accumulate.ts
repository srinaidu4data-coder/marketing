/**
 * Accumulate craft across Fit-repair loops: never drop prior stack/skills/bullets.
 * Locks (employers, durations) prefer base pack.
 */

import type { ResumePackV2 } from "./pack-schema";
import { MAX_BULLETS_PER_PROJECT } from "@/lib/resume/bullet-density";
import { FILLER_BULLET } from "./ensure-ship-shape";
import { scrubToToolNouns, scrubEnvironment } from "./tools-nouns";
import { JD_REWRITE_MAX_INDEX } from "./bible-prompt";
import { skillsToLines } from "./render-pack";

function splitTools(s: string): string[] {
  return (s || "")
    .split(/[,;|/]+/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 2);
}

function joinTools(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join(", ");
}

function mergeBulletLists(a: string[], b: string[], max = MAX_BULLETS_PER_PROJECT): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...a, ...b]) {
    const t = String(raw || "")
      .replace(/^[•\-–*]\s*/, "")
      .trim();
    if (!t || FILLER_BULLET.test(t)) continue;
    const k = t.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(k)) continue;
    // near-dupe: first 48 chars
    const prefix = k.slice(0, 48);
    if (
      Array.from(seen).some(
        (s) => s.startsWith(prefix) || prefix.startsWith(s.slice(0, 48))
      )
    ) {
      continue;
    }
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function mergeSkills(
  a: ResumePackV2["techSkills"],
  b: ResumePackV2["techSkills"]
): ResumePackV2["techSkills"] {
  const toStr = (s: ResumePackV2["techSkills"]): string =>
    skillsToLines(s).replace(/\n/g, ",");
  const merged = joinTools([
    ...splitTools(toStr(a)),
    ...splitTools(toStr(b)),
  ]);
  return merged;
}

/**
 * Accrue next craft onto base. Employers/dates from base; free fields grow.
 */
export function accumulatePackCraft(
  base: ResumePackV2,
  next: ResumePackV2
): ResumePackV2 {
  const bProjects = base.projects || [];
  const nProjects = next.projects || [];
  const count = Math.max(bProjects.length, nProjects.length);
  const projects = [];

  for (let i = 0; i < count; i++) {
    const bp = bProjects[i];
    const np = nProjects[i];
    if (!bp && np) {
      projects.push(np);
      continue;
    }
    if (bp && !np) {
      projects.push(bp);
      continue;
    }
    if (!bp || !np) continue;

    // Accrue tools as nouns only (scrub phrase pollution from either side)
    const stack = scrubToToolNouns(
      joinTools([
        ...splitTools(bp.techStack || ""),
        ...splitTools(np.techStack || ""),
      ]),
      16
    );
    const env = scrubEnvironment(
      [bp.environment || "", np.environment || ""].filter(Boolean).join(", "),
      undefined,
      12
    );
    // Prefer JD-facing role from next if it differs, else base
    const role =
      (np.role || "").trim().length >= (bp.role || "").trim().length
        ? np.role || bp.role
        : bp.role || np.role;

    projects.push({
      ...bp,
      role: role || bp.role,
      employerOrClient: bp.employerOrClient || np.employerOrClient,
      location: bp.location || np.location,
      duration: bp.duration || np.duration,
      techStack: stack,
      environment: env || bp.environment || np.environment || "Client delivery environment",
      bullets: mergeBulletLists(bp.bullets || [], np.bullets || []),
    });
  }

  const summaryBullets = mergeBulletLists(
    base.professionalSummary?.bullets || [],
    next.professionalSummary?.bullets || [],
    10
  );

  return {
    ...base,
    header: {
      ...base.header,
      // Prefer longer/JD job title from next if present
      jobTitle:
        (next.header?.jobTitle || "").trim().length >
        (base.header?.jobTitle || "").trim().length
          ? next.header.jobTitle
          : base.header.jobTitle || next.header?.jobTitle || "",
      name: base.header.name || next.header?.name || "",
      phone: base.header.phone || next.header?.phone || "",
      email: base.header.email || next.header?.email || "",
      location: base.header.location || next.header?.location || "",
      linkedin: base.header.linkedin || next.header?.linkedin || "",
    },
    professionalSummary: { bullets: summaryBullets },
    techSkills: mergeSkills(base.techSkills, next.techSkills),
    education: base.education?.length ? base.education : next.education || [],
    certifications: Array.from(
      new Set([...(base.certifications || []), ...(next.certifications || [])])
    ).slice(0, 20),
    projects,
    meta: {
      ...(base.meta || {}),
      ...(next.meta || {}),
      notes: [
        ...((base.meta?.notes as string[]) || []),
        "accumulate-merge",
        ...((next.meta?.notes as string[]) || []).slice(0, 4),
      ].slice(0, 24),
    },
  };
}

/**
 * Weave missing Fit phrases into BULLETS only (never Tech Stack / Environment).
 * Tool-like single nouns from gaps may be added to stack via scrub elsewhere.
 */
export function injectMissingPhrasesIntoPack(
  pack: ResumePackV2,
  missingLabels: string[]
): ResumePackV2 {
  const gaps = (missingLabels || [])
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 2 && s.length <= 80)
    .slice(0, 16);
  if (!gaps.length) return pack;

  const packBlob = JSON.stringify(pack).toLowerCase();
  const stillMissing = gaps.filter((g) => !packBlob.includes(g.toLowerCase()));
  if (!stillMissing.length) return pack;

  // Phrases → bullets only on RECENT slots (i≤JD_REWRITE_MAX_INDEX). Never into techStack; never paint early career.
  const projects = (pack.projects || []).map((p, index) => {
    if (index > JD_REWRITE_MAX_INDEX) return p;
    const bulletNeed = stillMissing
      .filter(
        (g) =>
          !(p.bullets || []).some((b) =>
            (b || "").toLowerCase().includes(g.toLowerCase())
          )
      )
      .slice(0, 2)
      .map(
        (g) =>
          `Supported ${g} workstreams with configuration, validation, and stakeholder alignment.`
      );
    return {
      ...p,
      bullets: mergeBulletLists(p.bullets || [], bulletNeed),
    };
  });

  return {
    ...pack,
    projects,
    meta: {
      ...(pack.meta || {}),
      notes: [
        ...((pack.meta?.notes as string[]) || []),
        `inject_phrases_bullets_only:${stillMissing.slice(0, 6).join("|")}`,
      ].slice(0, 30),
    },
  };
}

/** Build ACCUMULATE instructions for Bible regen from Fit report gaps */
export function buildFitAccumulateFeedback(opts: {
  fitConfidence: number;
  missing: string[];
  /** Full requirement rows that are missing (include phrases) */
  missingRequirements: { kind: string; label: string }[];
  loop: number;
  maxLoops: number;
}): string {
  const phrases = opts.missingRequirements
    .filter((r) => r.kind === "phrase" || r.kind === "keyword")
    .map((r) => r.label);
  const other = opts.missingRequirements
    .filter((r) => r.kind !== "phrase" && r.kind !== "keyword")
    .map((r) => `[${r.kind}] ${r.label}`);

  const lines = [
    "=== FIT ACCUMULATE REPAIR (Bible free fields only — keep LOCKS) ===",
    `Current Fit confidence: ${opts.fitConfidence}/100 (need ≥80). Loop ${opts.loop}/${opts.maxLoops}.`,
    "ACCUMULATE — do NOT replace prior craft:",
    "- Tech Stack: NOUN TOOLS ONLY. KEEP prior tools; ADD JD product nouns only — never sentences or 'must have'.",
    "- Environment: platforms/collab tools only (Jira, ServiceNow, S/4HANA, Public Cloud) — NOUNS only; different list from techStack.",
    "- Bullets: KEEP strong prior bullets; ADD proofs for missing phrases (until 8–12) — ONLY on projects[0..2].",
    "- Skills: product/module nouns only — not requirement prose.",
    "- Roles on projects[0..2]: JD family + era-honest. projects[i≥3]: do NOT JD-rewrite; keep neutral.",
    "PRIOR JSON is the baseline — accrue; do not wipe.",
  ];

  if (phrases.length) {
    lines.push(
      "",
      "=== MUST WEAVE — JD PHRASES → SUMMARY + projects[0..2] BULLETS ONLY ===",
      "Do NOT put multi-word phrases into Tech Stack or Environment.",
      "Do NOT apply these phrases to projects[i≥3] (early career freeze).",
      ...phrases.slice(0, 24).map((p, i) => `${i + 1}. "${p}"`)
    );
    lines.push(
      "Tech Stack / Environment: short tool nouns only (IBP, S/4HANA, CPI, Jira, ServiceNow).",
      "Do not invent employers/metrics/certs. Prefer qualitative proof if numbers unknown."
    );
  }
  if (other.length) {
    lines.push("", "=== OTHER FIT GAPS ===", ...other.slice(0, 12));
  }
  if (opts.missing.length && !phrases.length) {
    lines.push("", "=== MISSING LABELS ===", ...opts.missing.slice(0, 16).map((m) => `- ${m}`));
  }

  lines.push(
    "",
    "REQUIRED every project: non-empty techStack + environment + ≥8 bullets after accumulate.",
    "Return full JSON pack per Bible."
  );
  return lines.join("\n");
}
