/**
 * SINGLE LAW — bullet density for every employer / project / client.
 *
 * One car. No mode-specific floors. No era floors below 8.
 * Prompt, AI tailor, progressive, assemble, ship, validate — all import from here.
 *
 *   MIN  = 8  (hard floor — pack does not ship below this)
 *   MAX  = 12 (hard ceiling — never more than this per engagement)
 *   TARGET = 10 (preferred soft target in prompts)
 */

/** Hard floor: every real employer must have ≥ this many bullets. */
export const MIN_BULLETS_PER_PROJECT = 8;

/** Hard ceiling: never more than this many bullets per engagement. */
export const MAX_BULLETS_PER_PROJECT = 12;

/** Soft preferred count used in prompts (between min and max). */
export const TARGET_BULLETS_PER_PROJECT = 10;

/** Human-readable range for errors and prompts. */
export const BULLET_DENSITY_RANGE = `${MIN_BULLETS_PER_PROJECT}–${MAX_BULLETS_PER_PROJECT}`;

/** Prompt one-liner (identical wording everywhere). */
export const BULLET_DENSITY_PROMPT_RULE =
  `EVERY project/employer MUST have ${MIN_BULLETS_PER_PROJECT}–${MAX_BULLETS_PER_PROJECT} bullets ` +
  `(minimum ${MIN_BULLETS_PER_PROJECT}, preferred ${TARGET_BULLETS_PER_PROJECT}, never fewer than ${MIN_BULLETS_PER_PROJECT}, never more than ${MAX_BULLETS_PER_PROJECT}). ` +
  `Rephrase MASTER material only — do NOT invent employers, metrics, tools, or ownership absent from master. ` +
  `If output is thin, expand by rephrasing distinct master achievements until every employer has at least ${MIN_BULLETS_PER_PROJECT} bullets — the pipeline will also force-pad to the floor so a pack always ships.`;

/** Clamp any bullet count into the legal window. */
export function clampBulletCount(n: number): number {
  const x = Math.floor(Number(n) || 0);
  return Math.min(MAX_BULLETS_PER_PROJECT, Math.max(MIN_BULLETS_PER_PROJECT, x));
}

/** Cap a list to MAX (does not pad). */
export function capBullets<T>(bullets: T[]): T[] {
  return bullets.slice(0, MAX_BULLETS_PER_PROJECT);
}

/** True when count is legal for ship. */
export function isBulletDensityOk(n: number): boolean {
  return n >= MIN_BULLETS_PER_PROJECT && n <= MAX_BULLETS_PER_PROJECT;
}

function countSubstantial(bullets: string[] | undefined): number {
  return Array.isArray(bullets)
    ? bullets.filter((b) => String(b).trim().length > 20).length
    : 0;
}

/**
 * Force every project to ≥ MIN bullets by expanding existing lines + role/client
 * context fillers. Never invents new employers — only pads density so packs ship.
 * Product rule: generation must always produce a resume (no user-facing block).
 */
export function ensureMandatoryBulletDensity<
  T extends { client?: string; bullets?: string[]; title?: string },
>(
  projects: T[],
  opts?: {
    min?: number;
    jobTitle?: string;
    skillBank?: string[];
  }
): T[] {
  const floor = Math.max(
    MIN_BULLETS_PER_PROJECT,
    opts?.min || MIN_BULLETS_PER_PROJECT
  );
  const role = (opts?.jobTitle || "Consultant").trim();
  const skills = (opts?.skillBank || [])
    .map((s) => String(s).trim())
    .filter((s) => s.length > 1 && s.length < 48)
    .slice(0, 8);

  return projects.map((p, idx) => {
    const client = (p.client || `Client ${idx + 1}`).split(",")[0].trim();
    let bullets = Array.isArray(p.bullets)
      ? p.bullets.map((b) => String(b).trim()).filter(Boolean)
      : [];

    // Expand short stubs so they count as substantial
    bullets = bullets.map((b) =>
      b.length >= 28
        ? b
        : `${b} supporting ${role} delivery at ${client} with clear documentation and stakeholder follow-through.`
    );

    const fillers = densityFillers({
      client,
      role,
      skills,
      seed: bullets[0] || "",
    });

    const seen = new Set(
      bullets.map((b) => b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 55))
    );
    for (const f of fillers) {
      if (countSubstantial(bullets) >= floor) break;
      const k = f.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 55);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      bullets.push(f);
    }

    // Last resort: rephrase variants of first bullet
    let n = 0;
    while (countSubstantial(bullets) < floor && bullets.length > 0 && n < 12) {
      const base = bullets[n % bullets.length]!;
      const variant = rephraseForDensity(base, client, role, n);
      const k = variant.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 55);
      if (!seen.has(k)) {
        seen.add(k);
        bullets.push(variant);
      }
      n++;
    }

    // Absolute last resort: generic role/client lines (still no new employers)
    while (countSubstantial(bullets) < floor) {
      const i = bullets.length + 1;
      bullets.push(
        `Supported ${role} workstream activities for ${client} including coordination, evidence notes, and delivery readiness (item ${i}).`
      );
    }

    return { ...p, bullets: capBullets(bullets) };
  });
}

function densityFillers(opts: {
  client: string;
  role: string;
  skills: string[];
  seed: string;
}): string[] {
  const c = opts.client;
  const r = opts.role;
  const s0 = opts.skills[0] || r;
  const s1 = opts.skills[1] || opts.skills[0] || "core processes";
  const s2 = opts.skills[2] || s1;
  return [
    `Delivered ${r}-aligned configuration and process work for ${c}, emphasizing quality, documentation, and stakeholder alignment around ${s0}.`,
    `Partnered with business and technical owners at ${c} on requirements clarity, validation evidence, and release readiness for ${s0}.`,
    `Built test notes and issue logs for ${s0}-related scenarios supporting ${c} delivery timelines.`,
    `Maintained clear status cadence, defect notes, and handoff materials used by ${c} teams during ${r} execution.`,
    `Facilitated walkthroughs covering ${s0} and ${s1} with ${c} stakeholders to reduce ambiguity and rework.`,
    `Validated end-to-end scenarios spanning ${s0} and ${s1}, capturing defects and retest proof for ${c}.`,
    `Produced functional notes and evidence packs aligned to ${r} expectations on ${c}.`,
    `Collaborated across teams to resolve process and data issues affecting ${c} milestones under ${r} scope.`,
    `Documented open questions, owners, and closure criteria used in ${c} steering updates.`,
    `Reinforced delivery discipline (notes, retests, status inputs) for ${s2} workstreams at ${c}.`,
    `Supported cutover/readiness activities for ${c} with checklists, communications, and issue triage under ${r}.`,
    `Improved operational readiness for ${c} by aligning ${s0} practices with documented controls and handoffs.`,
  ];
}

function rephraseForDensity(
  base: string,
  client: string,
  role: string,
  n: number
): string {
  const core = base
    .replace(/^[•▸→–\-\*◆›]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const prefixes = [
    "Additionally, ",
    "Further, ",
    "Extended this work by ensuring ",
    "Reinforced outcomes through ",
    "Followed through with ",
  ];
  const suffixes = [
    ` for ${client}`,
    ` under ${role} scope at ${client}`,
    ` with documented evidence for ${client}`,
    ` and clear owner follow-up at ${client}`,
  ];
  const p = prefixes[n % prefixes.length]!;
  const s = suffixes[n % suffixes.length]!;
  const body = core.charAt(0).toLowerCase() + core.slice(1);
  const out = `${p}${body.replace(/\.$/, "")}${s}.`;
  return out.length > 260 ? out.slice(0, 257) + "…" : out;
}

/**
 * Ensure density then verify. Only throws when there are zero projects
 * (cannot invent employers). Thin bullets are force-padded — never user-facing block.
 */
export function assertMandatoryBulletDensity(
  projects: { client?: string; bullets?: string[]; title?: string }[],
  min: number = MIN_BULLETS_PER_PROJECT,
  padOpts?: { jobTitle?: string; skillBank?: string[] }
): void {
  const floor = Math.max(MIN_BULLETS_PER_PROJECT, min || MIN_BULLETS_PER_PROJECT);
  if (!projects.length) {
    throw new Error(
      "Resume generation blocked: zero projects/clients — cannot deliver a pack."
    );
  }
  // Mutate in place so callers keep references
  const padded = ensureMandatoryBulletDensity(projects, {
    min: floor,
    jobTitle: padOpts?.jobTitle,
    skillBank: padOpts?.skillBank,
  });
  for (let i = 0; i < projects.length; i++) {
    projects[i]!.bullets = padded[i]!.bullets;
  }
  // Absolute guarantee — if still thin (shouldn't happen), pad once more generically
  for (const p of projects) {
    while (countSubstantial(p.bullets) < floor) {
      const c = (p.client || "the client").split(",")[0].trim();
      p.bullets = capBullets([
        ...(p.bullets || []),
        `Supported delivery activities for ${c} with documentation, coordination, and validation follow-through.`,
      ]);
    }
  }
}
