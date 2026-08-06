/**
 * Prompt-compliance report for a generated pack.
 * Answers: did AI rewrite role/stack/env/bullets for every project vs master/JD?
 * Honesty is separate — this is "did the free craft fields change toward the JD".
 */

import type { ResumePackV2 } from "./pack-schema";
import { parseStoredMasterProfile } from "@/lib/resume/master-profile";
import { FILLER_BULLET } from "./ensure-ship-shape";

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

  // 3–6 per project via pack if available
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

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]!;
      const role = (p.role || "").trim();
      const stack = (p.techStack || "").trim();
      const env = (p.environment || "").trim();
      const bullets = (p.bullets || []).filter((b) => b && !FILLER_BULLET.test(b));
      const roleT = tokens(role);
      const stackT = tokens(stack);
      if (overlap(roleT, jdTok) >= 1 || MODULES.some((m) => jdTok.has(m) && roleT.has(m))) {
        rolesJd++;
      }
      // Role changed from master title
      if (role && !masterTitles.has(role.toLowerCase())) {
        rolesNotMasterModule++;
      }
      // Wrong module in role while JD has different module
      const roleWrong = MODULES.filter((m) => roleT.has(m) && !jdTok.has(m));
      const jdMods = MODULES.filter((m) => jdTok.has(m));
      if (roleWrong.length && jdMods.length && !roleWrong.some((m) => jdMods.includes(m))) {
        // still counts as fail for role JD — already tracked via rolesJd
      }
      if (stack.length >= 4) {
        stacksPresent++;
        if (overlap(stackT, jdTok) >= 1) stacksJd++;
      }
      if (env.length >= 3) envsPresent++;
      if (bullets.length >= 6) bulletsOk++;
    }

    const n = projects.length;
    items.push({
      id: "roles_jd",
      label: "Project roles rewritten toward JD (not pure master titles)",
      ok: rolesJd >= Math.ceil(n * 0.6) || rolesNotMasterModule >= Math.ceil(n * 0.6),
      detail: `${rolesJd}/${n} roles share JD tokens; ${rolesNotMasterModule}/${n} differ from master titles`,
    });
    items.push({
      id: "tech_stack",
      label: "Tech Stack present on every project",
      ok: stacksPresent === n,
      detail: `${stacksPresent}/${n} have Tech Stack`,
    });
    items.push({
      id: "tech_stack_jd",
      label: "Tech Stack includes JD-domain tools",
      ok: stacksJd >= Math.ceil(n * 0.5) || (stacksPresent === n && stacksJd >= 1),
      detail: `${stacksJd}/${n} stacks share JD tool tokens`,
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
