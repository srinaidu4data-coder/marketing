/**
 * Guarantee pack text is ship-compatible:
 * - Employer / Client blocks
 * - Sufficient dense bullets (from LLM first; skill-neutral bank when thin)
 * Never company+(N/M) "engagement goals" filler.
 */

import {
  normalizeTechSkills,
  skillsTextIsUnusable,
  type ResumePackV2,
} from "./pack-schema";
import { renderPackText, skillsToLines } from "./render-pack";
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
import {
  scrubToToolNouns,
  scrubEnvironment,
  toolsFromJd,
  normalizeStackEnvPair,
} from "./tools-nouns";
import {
  BANNED_BULLET_RE,
  hardenPackQuality,
} from "./pack-quality-harden";

const EC = "Employer / Client:";

/** @deprecated use BANNED_BULLET_RE — kept for pack-compliance imports */
export const FILLER_BULLET = BANNED_BULLET_RE;

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
export function ensurePackShipShape(
  pack: ResumePackV2,
  masterText?: string,
  bulletBank?: string[],
  jd?: string
): ResumePackV2 {
  // Phase A harden first (skills objects, certs, clone stacks, progressive roles)
  const hardened = hardenPackQuality(pack, {
    masterText,
    jd,
  });
  pack = hardened.pack;
  if (hardened.notes.length) {
    pack.meta = {
      ...(pack.meta || {}),
      notes: [...(pack.meta?.notes || []), ...hardened.notes.map((n) => `harden: ${n}`)],
    };
  }

  stripFillerBullets(pack);
  const bank =
    bulletBank && bulletBank.length >= 10
      ? bulletBank
      : DEFAULT_SKILL_NEUTRAL_BULLETS;
  const used = new Set<string>();
  const employers = guessEmployersFromMaster(masterText || "");
  const stackFallback = toolsFromJd(jd, 10);
  const envFallback = scrubEnvironment("", jd, 8) || stackFallback;
  let projects = [...(pack.projects || [])];

  if (!projects.length) {
    projects = employers.map((emp) => ({
      role: pack.header.jobTitle || "Consultant",
      employerOrClient: emp,
      location: "",
      duration: "",
      techStack: stackFallback,
      environment: envFallback,
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
      // Scrub junk (C2C, engineering, NOTE…); noun tools only; zero stack/env overlap
      const pair = normalizeStackEnvPair(
        p.techStack || "",
        p.environment || "",
        jd,
        { minStack: 3, minEnv: 2 }
      );
      const stack = pair.techStack || stackFallback;
      let env = pair.environment || envFallback;
      // Final zero-overlap pass
      if (stack && env) {
        const sSet = new Set(
          stack.split(", ").map((x) => x.toLowerCase().trim())
        );
        env = env
          .split(", ")
          .filter((x) => x && !sSet.has(x.toLowerCase().trim()))
          .join(", ");
        if (!env) env = envFallback || scrubEnvironment("", jd, 6) || "Azure, Jira";
      }
      return {
        ...p,
        role: (p.role || "").trim() || pack.header.jobTitle || "Consultant",
        employerOrClient: emp,
        techStack: stack,
        environment: env,
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

  // Skills section: coerce object items, scrub prose, never ship [object Object]
  {
    const reNorm = normalizeTechSkills(pack.techSkills);
    pack.techSkills = reNorm.techSkills;
    const jdTools = toolsFromJd(jd, 12) || "";
    const masterTools = toolsFromJd(masterText, 12) || "";
    const fallbackTools = jdTools || masterTools || "";

    if (typeof pack.techSkills === "string") {
      pack.techSkills =
        scrubToToolNouns(pack.techSkills, 20) || fallbackTools || "";
    } else if (Array.isArray(pack.techSkills)) {
      const joined = pack.techSkills.join(", ");
      const scrubbed = scrubToToolNouns(joined, 20);
      pack.techSkills = scrubbed
        ? scrubbed.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
        : fallbackTools
          ? fallbackTools.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
          : [];
    } else if (pack.techSkills && typeof pack.techSkills === "object") {
      const rendered = skillsToLines(pack.techSkills);
      if (skillsTextIsUnusable(rendered)) {
        pack.techSkills = fallbackTools || "";
      } else {
        // Re-scrub each group values to tool nouns
        const next: Record<string, string[]> = {};
        for (const [k, vals] of Object.entries(pack.techSkills)) {
          const scrubbed = scrubToToolNouns(
            (Array.isArray(vals) ? vals : []).join(", "),
            12
          );
          if (scrubbed) {
            next[k] = scrubbed
              .split(/[,;|]/)
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }
        pack.techSkills = Object.keys(next).length
          ? next
          : fallbackTools || "";
      }
    }

    const finalText = skillsToLines(pack.techSkills, {
      toolNouns: fallbackTools,
    });
    if (skillsTextIsUnusable(finalText) && fallbackTools) {
      pack.techSkills = fallbackTools;
    }
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
  const skillFallback = {
    toolNouns: toolsFromJd(jd, 12) || toolsFromJd(masterText, 12) || "",
  };
  let text = renderPackText(shaped, skillFallback);
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
  // Phase C: never ship [object Object]
  if (/\[object\s+Object\]/i.test(text)) {
    text = text.replace(/\[object\s+Object\]/gi, "").replace(/,\s*,/g, ",");
    const fb = skillFallback.toolNouns || "";
    if (/TECHNICAL SKILLS\s*\n\s*$/im.test(text) || /TECHNICAL SKILLS\s*\n\s*\n/i.test(text)) {
      text = text.replace(
        /TECHNICAL SKILLS\s*\n[^\n]*/i,
        `TECHNICAL SKILLS\n${fb || "SAP, Integration, Testing"}`
      );
    }
    shaped.meta = {
      ...(shaped.meta || {}),
      notes: [
        ...(shaped.meta?.notes || []),
        "harden: stripped residual [object Object] from text",
      ],
    };
  }
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
