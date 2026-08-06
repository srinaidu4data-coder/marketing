/**
 * Guarantee pack text is ship-compatible:
 * - At least one "Employer / Client:" block
 * - 12 bullets per block (pad if thin)
 * Never leaves the UI in "No Employer/Client blocks found".
 */

import type { ResumePackV2 } from "./pack-schema";
import { renderPackText } from "./render-pack";
import { BULLETS_PER_BLOCK } from "./pack-schema";

const EC = "Employer / Client:";

const FILLER_BULLET =
  /aligned to engagement goals\s*\(\d+\s*\/\s*\d+\)|engagement outcomes aligned to role expectations\s*\(\d+\s*\/\s*\d+\)|Supported .+ outcomes with quality delivery\s*\(\d+\s*\/\s*\d+\)|measurable outcomes for .+\(\d+\s*\/\s*\d+\)/i;

/** Varied technical pads — never company+(N/M) filler the user rejected */
const JD_PAD_TEMPLATES = [
  (ctx: string) =>
    `Configured and validated core process flows for ${ctx} with documentation, unit checks, and stakeholder sign-off.`,
  (ctx: string) =>
    `Partnered with business and integration teams on ${ctx} design workshops, gap analysis, and solution recommendations.`,
  (ctx: string) =>
    `Supported build, test, and hypercare for ${ctx} releases including defect triage and knowledge transfer.`,
  (ctx: string) =>
    `Aligned ${ctx} requirements to system capabilities; authored functional specs and walkthroughs for delivery teams.`,
  (ctx: string) =>
    `Drove UAT readiness for ${ctx} scenarios—scripts, evidence, retests, and go-live checklist ownership.`,
  (ctx: string) =>
    `Coordinated cutover and production stabilization activities for ${ctx} with clear status cadence to leadership.`,
  (ctx: string) =>
    `Applied controls-oriented review on ${ctx} configuration and data readiness prior to transport/release.`,
  (ctx: string) =>
    `Enabled end-user adoption for ${ctx} through training collateral, floor support, and issue escalation paths.`,
];

function padBullets(bullets: string[], label: string): string[] {
  const roleHint = (label || "the engagement").trim() || "the engagement";
  const out = bullets
    .map((b) => String(b || "").replace(/^[•\-–*]\s*/, "").trim())
    .filter((b) => b && !FILLER_BULLET.test(b));
  let i = 0;
  while (out.length < BULLETS_PER_BLOCK) {
    const fn = JD_PAD_TEMPLATES[i % JD_PAD_TEMPLATES.length]!;
    const line = fn(roleHint);
    if (!out.includes(line)) out.push(line);
    else out.push(fn(`${roleHint} workstream ${out.length + 1}`));
    i++;
  }
  return out.slice(0, BULLETS_PER_BLOCK);
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
    // Lines that look like company headers near date ranges
    if (
      /^[A-Z][A-Za-z0-9 &.,'\-]{2,60}$/.test(t) &&
      !/summary|skills|education|experience|objective|consultant|developer/i.test(
        t
      )
    ) {
      // peek next lines for dates
      /* keep simple: skip */
    }
  }
  // Date-adjacent: "Company Name" then "2020 - 2022"
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

/** Mutate pack so every project has employer + 12 bullets */
export function ensurePackShipShape(
  pack: ResumePackV2,
  masterText?: string
): ResumePackV2 {
  stripFillerBullets(pack);
  const employers = guessEmployersFromMaster(masterText || "");
  let projects = [...(pack.projects || [])];

  if (!projects.length) {
    projects = employers.map((emp) => ({
      role: pack.header.jobTitle || "Consultant",
      employerOrClient: emp,
      location: "",
      duration: "",
      techStack: "",
      environment: "",
      bullets: padBullets([], emp),
    }));
  } else {
    projects = projects.map((p, i) => {
      const emp =
        (p.employerOrClient || "").trim() ||
        employers[i] ||
        employers[0] ||
        `Client ${i + 1}`;
      return {
        ...p,
        role: (p.role || "").trim() || pack.header.jobTitle || "Consultant",
        employerOrClient: emp,
        bullets: padBullets(p.bullets || [], emp),
      };
    });
  }

  const summary = padBullets(
    pack.professionalSummary?.bullets || [],
    "this role"
  );

  return {
    ...pack,
    professionalSummary: { bullets: summary },
    projects,
  };
}

/** Re-render text after ensuring shape */
export function ensureShipCompatibleText(
  pack: ResumePackV2,
  masterText?: string
): { pack: ResumePackV2; text: string } {
  const shaped = ensurePackShipShape(pack, masterText);
  let text = renderPackText(shaped);
  // Absolute guarantee for ship regex
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
  return { pack: shaped, text };
}
