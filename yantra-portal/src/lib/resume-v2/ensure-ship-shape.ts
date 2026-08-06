/**
 * Guarantee pack text is ship-compatible:
 * - Employer / Client blocks
 * - Sufficient dense bullets (from LLM first; skill-neutral bank when thin)
 * Never company+(N/M) "engagement goals" filler.
 */

import type { ResumePackV2 } from "./pack-schema";
import { renderPackText } from "./render-pack";
import {
  MIN_BULLETS_PER_PROJECT,
  TARGET_BULLETS_PER_PROJECT,
} from "@/lib/resume/bullet-density";
/** Ship law: every employer ≥ MIN_BULLETS (8). */
const MIN_SUMMARY = 6;
const MIN_RECENT = MIN_BULLETS_PER_PROJECT;
import {
  DEFAULT_SKILL_NEUTRAL_BULLETS,
  getSkillNeutralBulletBank,
  pickBankBullets,
} from "@/lib/resume/skill-neutral-bullet-bank";

const EC = "Employer / Client:";

export const FILLER_BULLET =
  /aligned to engagement goals\s*\(\d+\s*\/\s*\d+\)|engagement outcomes aligned to role expectations\s*\(\d+\s*\/\s*\d+\)|Supported .+ outcomes with quality delivery\s*\(\d+\s*\/\s*\d+\)|measurable outcomes for .+\(\d+\s*\/\s*\d+\)|Delivered measurable outcomes for/i;

function padBulletsFromBank(
  bullets: string[],
  bank: string[],
  used: Set<string>,
  minCount = MIN_RECENT
): string[] {
  const out = bullets
    .map((b) => String(b || "").replace(/^[•\-–*]\s*/, "").trim())
    .filter((b) => b && !FILLER_BULLET.test(b));
  for (const b of out) used.add(b.toLowerCase());
  if (out.length < minCount) {
    const need = minCount - out.length;
    out.push(...pickBankBullets(bank, need, used));
  }
  return out.slice(0, Math.max(minCount, out.length, out.length));
}

/** Strip banned filler from any pack after LLM or before render */
export function stripFillerBullets(pack: {
  professionalSummary?: { bullets?: string[] };
  projects?: { bullets?: string[]; employerOrClient?: string; role?: string }[];
}): void {
  if (pack.professionalSummary?.bullets) {
    pack.professionalSummary.bullets = pack.professionalSummary.bullets.filter(
      (b) => b && !FILLER_BULLET.test(b)
    );
  }
  for (const p of pack.projects || []) {
    if (p.bullets?.length) {
      p.bullets = p.bullets.filter((b) => b && !FILLER_BULLET.test(b));
    }
  }
}

/** Pull rough employer names from master text */
export function guessEmployersFromMaster(master: string, max = 6): string[] {
  const names: string[] = [];
  const lines = (master || "").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 3 || t.length > 80) continue;
    if (/employer\s*\/\s*client\s*:/i.test(t)) {
      const n = t.split(/:/)[1]?.trim();
      if (n && !names.includes(n)) names.push(n);
      continue;
    }
  }
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i]!.trim();
    const b = lines[i + 1]!.trim();
    if (
      a.length >= 3 &&
      a.length <= 70 &&
      /20\d{2}\s*[-–—]\s*(20\d{2}|present|current)/i.test(b) &&
      !/^(core|skills|education|summary)/i.test(a)
    ) {
      if (!names.includes(a)) names.push(a);
    }
  }
  if (!names.length) names.push("Professional Experience");
  return names.slice(0, max);
}

/**
 * Mutate pack so every project has employer + dense bullets.
 * Uses Admin skill-neutral bank when short — never engagement-goals (N/M).
 */
/** Pull tool-like tokens from JD for empty techStack pad (never fake employers). */
function jdToolHints(jd?: string, limit = 10): string {
  if (!jd?.trim()) return "";
  const found: string[] = [];
  const re =
    /\b(SAP|BRIM|FI-CA|FICA|S\/4HANA|S4HANA|HANA|RAR|SOM|OTC|PTP|FICO|RTR|BW|BPC|MDG|EWM|Ariba|OpenText|ServiceNow|Jira|Concur|SuccessFactors|DataSphere|SAC)\b/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(jd)) && found.length < limit) {
    const t = m[0];
    const key = t.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(t);
  }
  return found.join(", ");
}

export function ensurePackShipShape(
  pack: ResumePackV2,
  masterText?: string,
  bulletBank?: string[],
  jd?: string
): ResumePackV2 {
  stripFillerBullets(pack);
  const bank =
    bulletBank && bulletBank.length >= 10
      ? bulletBank
      : DEFAULT_SKILL_NEUTRAL_BULLETS;
  const used = new Set<string>();
  const employers = guessEmployersFromMaster(masterText || "");
  const stackFallback = jdToolHints(jd);
  let projects = [...(pack.projects || [])];

  if (!projects.length) {
    projects = employers.map((emp) => ({
      role: pack.header.jobTitle || "Consultant",
      employerOrClient: emp,
      location: "",
      duration: "",
      techStack: stackFallback,
      environment: "Client delivery environment",
      bullets: padBulletsFromBank([], bank, used, MIN_RECENT),
    }));
  } else {
    const n = projects.length;
    projects = projects.map((p, i) => {
      const emp =
        (p.employerOrClient || "").trim() ||
        employers[i] ||
        employers[0] ||
        `Client ${i + 1}`;
      // Ship law: every project ≥ MIN_BULLETS_PER_PROJECT
      void n;
      const minB = MIN_BULLETS_PER_PROJECT;
      const stack = (p.techStack || "").trim() || stackFallback;
      const env = (p.environment || "").trim();
      return {
        ...p,
        role: (p.role || "").trim() || pack.header.jobTitle || "Consultant",
        employerOrClient: emp,
        techStack: stack,
        environment: env || "Client delivery environment",
        bullets: padBulletsFromBank(
          p.bullets || [],
          bank,
          used,
          Math.max(
            minB,
            Math.min(
              TARGET_BULLETS_PER_PROJECT,
              (p.bullets || []).length || minB
            )
          )
        ),
      };
    });
  }

  const summary = padBulletsFromBank(
    pack.professionalSummary?.bullets || [],
    bank,
    used,
    MIN_SUMMARY
  );

  return {
    ...pack,
    professionalSummary: { bullets: summary },
    projects,
  };
}

export async function ensurePackShipShapeAsync(
  pack: ResumePackV2,
  masterText?: string,
  jd?: string
): Promise<ResumePackV2> {
  const bank = await getSkillNeutralBulletBank();
  return ensurePackShipShape(pack, masterText, bank, jd);
}

/** Re-render text after ensuring shape */
export function ensureShipCompatibleText(
  pack: ResumePackV2,
  masterText?: string,
  bulletBank?: string[],
  jd?: string
): { pack: ResumePackV2; text: string } {
  const shaped = ensurePackShipShape(pack, masterText, bulletBank, jd);
  let text = renderPackText(shaped);
  if (!/Employer\s*\/\s*Client\s*:/i.test(text)) {
    text +=
      `\n\nPROFESSIONAL EXPERIENCE\n` +
      shaped.projects
        .map(
          (p) =>
            `${p.role}\n${EC} ${p.employerOrClient}\n` +
            p.bullets.map((b) => `• ${b}`).join("\n")
        )
        .join("\n\n");
  }
  // Final scrub of any leftover banned patterns in rendered text
  text = text
    .split(/\r?\n/)
    .filter((line) => !FILLER_BULLET.test(line))
    .join("\n");
  return { pack: shaped, text };
}

export async function ensureShipCompatibleTextAsync(
  pack: ResumePackV2,
  masterText?: string,
  jd?: string
): Promise<{ pack: ResumePackV2; text: string }> {
  const bank = await getSkillNeutralBulletBank();
  return ensureShipCompatibleText(pack, masterText, bank, jd);
}
