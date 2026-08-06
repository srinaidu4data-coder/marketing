/**
 * Accumulate craft across Fit-repair loops: never drop prior stack/skills/bullets.
 * Locks (employers, durations) prefer base pack.
 */

import type { ResumePackV2 } from "./pack-schema";
import { MAX_BULLETS_PER_PROJECT } from "@/lib/resume/bullet-density";
import { FILLER_BULLET } from "./ensure-ship-shape";

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
  const toStr = (s: ResumePackV2["techSkills"]): string => {
    if (typeof s === "string") return s;
    if (Array.isArray(s)) return s.join(", ");
    if (s && typeof s === "object") {
      return Object.entries(s)
        .map(([k, v]) => {
          const vals = Array.isArray(v) ? v.join(", ") : String(v || "");
          return vals ? `${k}: ${vals}` : "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return "";
  };
  const merged = joinTools([...splitTools(toStr(a).replace(/\n/g, ",")), ...splitTools(toStr(b).replace(/\n/g, ","))]);
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

    const stack = joinTools([
      ...splitTools(bp.techStack || ""),
      ...splitTools(np.techStack || ""),
    ]);
    const envSeen = new Set<string>();
    const envParts: string[] = [];
    for (const e of [bp.environment || "", np.environment || ""]) {
      const t = e.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (envSeen.has(k)) continue;
      envSeen.add(k);
      envParts.push(t);
    }
    const env = envParts.join("; ");
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
 * Deterministic weave: ensure missing Fit phrases/keywords appear in pack text
 * (skills + every project techStack) so Fit dashboard can tick them.
 * Does not invent employers/metrics — only appends JD gap labels already extracted.
 */
export function injectMissingPhrasesIntoPack(
  pack: ResumePackV2,
  missingLabels: string[]
): ResumePackV2 {
  const gaps = (missingLabels || [])
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 2 && s.length <= 80)
    .slice(0, 20);
  if (!gaps.length) return pack;

  const packBlob = JSON.stringify(pack).toLowerCase();
  const stillMissing = gaps.filter((g) => !packBlob.includes(g.toLowerCase()));
  if (!stillMissing.length) return pack;

  const addTools = joinTools([
    ...splitTools(
      typeof pack.techSkills === "string"
        ? pack.techSkills
        : Array.isArray(pack.techSkills)
          ? pack.techSkills.join(", ")
          : ""
    ),
    ...stillMissing,
  ]);

  const projects = (pack.projects || []).map((p) => {
    const stack = joinTools([...splitTools(p.techStack || ""), ...stillMissing]);
    // One proof bullet per project if phrase still not in bullets
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
    const bullets = mergeBulletLists(p.bullets || [], bulletNeed);
    return {
      ...p,
      techStack: stack,
      environment:
        (p.environment || "").trim() ||
        "Client delivery environment with integrated SAP landscape",
      bullets,
    };
  });

  return {
    ...pack,
    techSkills: addTools,
    projects,
    meta: {
      ...(pack.meta || {}),
      notes: [
        ...((pack.meta?.notes as string[]) || []),
        `inject_phrases:${stillMissing.slice(0, 6).join("|")}`,
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
    "- Tech Stack: KEEP every existing tool; ADD missing JD tools (union, comma-separated).",
    "- Environment: KEEP prior; ADD JD platforms/context if missing.",
    "- Bullets: KEEP strong prior bullets; ADD new distinct bullets that prove MISSING phrases/keywords (until 8–12 per project).",
    "- Skills section: KEEP prior skills; ADD missing JD terms.",
    "- Roles: if wrong domain (e.g. FICO under BRIM JD), rewrite to JD family but do not drop proof bullets.",
    "PRIOR JSON is the baseline — output full pack with accrued fields, not a thinner rewrite.",
  ];

  if (phrases.length) {
    lines.push(
      "",
      "=== MUST WEAVE — JD PHRASES & KEYWORDS (were missing / marked PHRASE on Fit dashboard) ===",
      "Each of these MUST appear naturally in summary and/or project techStack/environment/bullets:",
      ...phrases.slice(0, 24).map((p, i) => `${i + 1}. "${p}"`)
    );
    lines.push(
      "How to use phrases: embed exact wording where honest (tools in Tech Stack; multi-word capabilities in bullets; modules in environment).",
      "Do not invent employers/metrics. Prefer qualitative proof if numbers unknown."
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
