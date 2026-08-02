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
  `If master cannot support ${MIN_BULLETS_PER_PROJECT} distinct bullets for an employer, fail closed (do not invent density).`;

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

/**
 * Hard gate: every engagement must have ≥ MIN bullets (≤ MAX after cap).
 * Throws — callers must not render DOCX/PDF/send on failure.
 */
export function assertMandatoryBulletDensity(
  projects: { client?: string; bullets?: string[] }[],
  min: number = MIN_BULLETS_PER_PROJECT
): void {
  // Never allow callers to weaken the floor below product law.
  const floor = Math.max(MIN_BULLETS_PER_PROJECT, min || MIN_BULLETS_PER_PROJECT);
  if (!projects.length) {
    throw new Error(
      "Resume generation blocked: zero projects/clients — cannot deliver a pack."
    );
  }
  const thin = projects
    .map((p, i) => ({
      i,
      client: (p.client || `Project ${i + 1}`).split(",")[0].trim(),
      n: Array.isArray(p.bullets)
        ? p.bullets.filter((b) => String(b).trim().length > 20).length
        : 0,
    }))
    .filter((p) => p.n < floor);

  if (thin.length) {
    const detail = thin.map((t) => `${t.client}: ${t.n}/${floor}`).join("; ");
    throw new Error(
      `Resume generation blocked: every project/client/employer requires ${BULLET_DENSITY_RANGE} bullets (min ${floor}). Insufficient: ${detail}. Re-upload a richer master or regenerate.`
    );
  }
}
