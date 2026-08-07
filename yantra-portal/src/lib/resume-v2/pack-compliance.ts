/**
 * Prompt-compliance report for a generated pack.
 * Pure policy: JD rewrite expected on projects[0..2] only; i≥3 may stay neutral.
 * Structural checks (stack/env/bullets present) still apply to every project.
 */

import type { ResumePackV2 } from "./pack-schema";
import { parseStoredMasterProfile } from "@/lib/resume/master-profile";
import { FILLER_BULLET } from "./ensure-ship-shape";
import { JD_REWRITE_MAX_INDEX } from "./bible-prompt";

export type ComplianceItem = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type PackComplianceReport = {
  score: number;
  items: ComplianceItem[];
  summary: string;
  /** True if free fields show clear JD manufacture (not just master paste) */
  manufactured: boolean;
};

function tokens(s: string): Set<string> {
  const set = new Set<string>();
  for (const m of (s || "").toUpperCase().match(/\b[A-Z][A-Z0-9]{1,7}\b/g) || []) {
    if (m.length >= 2 && m.length <= 8) set.add(m.toLowerCase());
  }
  for (const w of (s || "").toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) || []) {
    if (w.length >= 4) set.add(w);
  }
  return set;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of Array.from(a)) if (b.has(t)) n++;
  return n;
}

const MODULES = [
  "fico",
  "rtr",
  "brim",
  "fica",
  "ewm",
  "mm",
  "sd",
  "otc",
  "ptp",
  "bw",
  "bpc",
];

/**
 * Build compliance checklist from pack + JD + optional master profile.
 */
export function buildPackCompliance(opts: {
  pack: ResumePackV2 | null;
  text: string;
  jd: string;
  masterText?: string;
  masterProfileJson?: string | null;
}): PackComplianceReport {
  const items: ComplianceItem[] = [];
  const jd = opts.jd || "";
  const jdTok = tokens(jd);
  const pack = opts.pack;
  const text = opts.text || "";
  const profile = parseStoredMasterProfile(opts.masterProfileJson);

  // 1. Header job title present and JD-ish
  const title = pack?.header.jobTitle || text.split("\n")[0] || "";
  const titleTok = tokens(title);
  const titleJd = overlap(titleTok, jdTok);
  items.push({
    id: "header_title",
    label: "Header job title JD-aligned",
    ok: title.length >= 8 && (titleJd >= 1 || /sap|brim|consultant|analyst/i.test(title)),
    detail: title ? `"${title.slice(0, 72)}"` : "missing",
  });

  // 2. Every project has Employer/Client
  const ecBlocks = text.split(/Employer\s*\/\s*Client:\s*/i).slice(1);
  items.push({
    id: "employer_blocks",
    label: "Employer/Client blocks present",
    ok: ecBlocks.length > 0,
    detail: `${ecBlocks.length} block(s)`,
  });

  // Structural: all projects. JD-face craft: only recency slots 0..JD_REWRITE_MAX_INDEX
  const projects = pack?.projects || [];
  if (projects.length) {
    let rolesJd = 0;
    let stacksPresent = 0;
    let stacksJd = 0;
    let envsPresent = 0;
    let bulletsOk = 0;
    let rolesNotMasterModule = 0;
    const masterTitles = new Set(
      (profile?.engagements || []).map((e) => (e.title || "").toLowerCase().trim())
    );
    const rewriteSlots = projects.slice(0, JD_REWRITE_MAX_INDEX + 1);
    const rewriteN = Math.max(1, rewriteSlots.length);

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]!;
      const role = (p.role || "").trim();
      const stack = (p.techStack || "").trim();
      const env = (p.environment || "").trim();
      const bullets = (p.bullets || []).filter((b) => b && !FILLER_BULLET.test(b));
      const roleT = tokens(role);
      const stackT = tokens(stack);
      const isRewriteSlot = i <= JD_REWRITE_MAX_INDEX;

      // JD role face only required on recency slots
      if (
        isRewriteSlot &&
        (overlap(roleT, jdTok) >= 1 ||
          MODULES.some((m) => jdTok.has(m) && roleT.has(m)))
      ) {
        rolesJd++;
      }
      if (isRewriteSlot && role && !masterTitles.has(role.toLowerCase())) {
        rolesNotMasterModule++;
      }
      if (stack.length >= 4) {
        stacksPresent++;
        if (isRewriteSlot && overlap(stackT, jdTok) >= 1) stacksJd++;
      }
      if (env.length >= 3) envsPresent++;
      if (bullets.length >= 6) bulletsOk++;
    }

    const n = projects.length;
    items.push({
      id: "roles_jd",
      label: `Roles JD-rewritten on projects[0..${JD_REWRITE_MAX_INDEX}] only`,
      ok:
        rolesJd >= Math.ceil(rewriteN * 0.6) ||
        rolesNotMasterModule >= Math.ceil(rewriteN * 0.6),
      detail: `${rolesJd}/${rewriteN} recent roles share JD tokens; ${rolesNotMasterModule}/${rewriteN} differ from master (early career freeze OK)`,
    });
    items.push({
      id: "tech_stack",
      label: "Tech Stack present on every project",
      ok: stacksPresent === n,
      detail: `${stacksPresent}/${n} have Tech Stack`,
    });
    items.push({
      id: "tech_stack_jd",
      label: `Tech Stack JD tools on projects[0..${JD_REWRITE_MAX_INDEX}]`,
      ok:
        stacksJd >= Math.ceil(rewriteN * 0.5) ||
        (stacksPresent === n && stacksJd >= 1),
      detail: `${stacksJd}/${rewriteN} recent stacks share JD tool tokens`,
    });
    items.push({
      id: "environment",
      label: "Environment present on every project",
      ok: envsPresent === n,
      detail: `${envsPresent}/${n} have Environment`,
    });
    items.push({
      id: "bullets_dense",
      label: "Bullets dense enough per project (≥6)",
      ok: bulletsOk === n,
      detail: `${bulletsOk}/${n} projects ≥6 bullets`,
    });
  } else {
    // Text-only fallbacks
    const stackLines = (text.match(/^Tech Stack:\s*.+/gim) || []).length;
    const envLines = (text.match(/^Environment:\s*.+/gim) || []).length;
    items.push({
      id: "tech_stack",
      label: "Tech Stack lines in pack text",
      ok: stackLines >= Math.max(1, ecBlocks.length),
      detail: `${stackLines} Tech Stack line(s) for ${ecBlocks.length} employer(s)`,
    });
    items.push({
      id: "environment",
      label: "Environment lines in pack text",
      ok: envLines >= Math.max(1, ecBlocks.length),
      detail: `${envLines} Environment line(s)`,
    });
    items.push({
      id: "roles_jd",
      label: "Roles readable as JD family (text scan)",
      ok: /brim|fi-ca|fica|data analysis|migration/i.test(text) || titleJd >= 1,
      detail: "parsed pack JSON unavailable — text heuristic",
    });
  }

  // Filler ban
  const filler = FILLER_BULLET.test(text);
  items.push({
    id: "no_filler",
    label: "No engagement-goals (N/M) filler",
    ok: !filler,
    detail: filler ? "banned filler still present" : "clean",
  });

  // Phase C: never ship [object Object]
  const objLeak = /\[object\s+Object\]/i.test(text);
  items.push({
    id: "no_object_object",
    label: "No [object Object] skills leak",
    ok: !objLeak,
    detail: objLeak ? "skills rendered as [object Object]" : "clean",
  });

  // Clone stack/env across projects
  if (projects.length >= 3) {
    const stackKeys = projects.map((p) =>
      `${(p.techStack || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(p.environment || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`
    );
    const uniq = new Set(stackKeys.filter(Boolean));
    const cloned = uniq.size === 1 && stackKeys.filter(Boolean).length >= 3;
    items.push({
      id: "unique_stacks",
      label: "Tech Stack/Environment differ across projects",
      ok: !cloned,
      detail: cloned
        ? "identical stack/env on every project (clone stamp)"
        : `${uniq.size} unique stack/env signatures`,
    });
  }

  // Progressive roles (not all identical senior titles)
  if (projects.length >= 3) {
    const roleKeys = projects.map((p) =>
      (p.role || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    );
    const allSame =
      roleKeys[0] &&
      roleKeys.every((r) => r === roleKeys[0]) &&
      roleKeys[0].length > 10;
    items.push({
      id: "progressive_roles",
      label: "Progressive role titles (not identical on every job)",
      ok: !allSame,
      detail: allSame
        ? `same title on all ${projects.length} projects`
        : "titles vary by era",
    });
  }

  // Summary present
  const summaryBullets = pack?.professionalSummary?.bullets?.length ?? 0;
  items.push({
    id: "summary",
    label: "Professional summary bullets (6–8)",
    ok: summaryBullets >= 6 || (text.match(/^• /gm) || []).length >= 6,
    detail: pack ? `${summaryBullets} summary bullets` : "text-mode",
  });

  const okCount = items.filter((i) => i.ok).length;
  const score = items.length ? Math.round((okCount / items.length) * 100) : 0;
  const manufactured =
    items.find((i) => i.id === "header_title")?.ok === true &&
    (items.find((i) => i.id === "roles_jd")?.ok === true ||
      items.find((i) => i.id === "tech_stack_jd")?.ok === true) &&
    items.find((i) => i.id === "no_filler")?.ok === true;

  const fails = items.filter((i) => !i.ok).map((i) => i.label);
  const summary = manufactured
    ? `Prompt craft signals OK (${score}%) — free fields show JD manufacture`
    : `Prompt craft gaps (${score}%): ${fails.slice(0, 4).join("; ") || "see checklist"}`;

  return { score, items, summary, manufactured };
}

/** Parse pack from progressive notes is hard; optional JSON in breakdown */
export function complianceFromBreakdown(
  atsBreakdownJson: string | null | undefined,
  text: string,
  jd: string,
  masterText?: string,
  masterProfileJson?: string | null
): PackComplianceReport {
  let pack: ResumePackV2 | null = null;
  try {
    const o = JSON.parse(atsBreakdownJson || "{}") as {
      packSnapshot?: ResumePackV2;
      compliance?: PackComplianceReport;
    };
    if (o.compliance?.items?.length) return o.compliance;
    if (o.packSnapshot?.projects) pack = o.packSnapshot;
  } catch {
    /* */
  }
  return buildPackCompliance({
    pack,
    text,
    jd,
    masterText,
    masterProfileJson,
  });
}
