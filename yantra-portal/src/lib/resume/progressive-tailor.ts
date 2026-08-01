/**
 * Progressive Resume Tailor (Role Forge v2)
 *
 * Output targets:
 * - 10â€“12+ bullet lines per project/client engagement
 * - Resume content sized for ~4â€“5 pages (DOCX/PDF)
 * - Progressive career narrative (early balanced, recent heavily JD-aligned)
 * - Temporal skill integrity
 * - Internal ATS score target â‰¥ 95
 */

import {
  extractJdKeywords,
  extractJobTitle,
  scoreResume,
  skillFingerprint,
  type AtsResult,
} from "./ats-scorer";
import {
  detectDomain,
  progressiveTitlesFromJobTitle,
  sanitizeSkillList,
  skillsHonestFromSources,
  yearsFromMasterAndProjects,
  type DomainHint,
} from "./jd-parse";
import type { ResumeEnginePolicy } from "./resume-engine-policy";
import { getResumeEnginePolicy } from "@/lib/system-settings";
import {
  getLayout,
  type ResumeLayoutId,
  type StructuredResume,
} from "./templates";
import { buildSectionsForLayout } from "./layout-structures";
import {
  extractContactFromMaster,
  formatContactLine,
} from "./extract-contact";

/** Minimum bullets per project â€” denser packs for 4â€“5 page DOCX with heavy page-1 proof */
/** @deprecated Density comes from admin policy bullets.* */
export const MIN_BULLETS_PER_PROJECT = 8;
/** @deprecated Use ResumeEnginePolicy.bullets */
export const RECENT_BULLETS_PER_PROJECT = 8;
export const MID_BULLETS_PER_PROJECT = 6;
export const EARLY_BULLETS_PER_PROJECT = 5;
/** Fallback synthetic count when master has no parseable jobs */
export const TARGET_PROJECT_COUNT = 5;
/** Cap only for extreme masters (performance on serverless) */
export const MAX_PROJECTS_FROM_MASTER = 14;

export type ProjectBlock = {
  title: string;
  client: string;
  location: string;
  startYear: number;
  endYear: number | "Present";
  bullets: string[];
  skills: string[];
  era: "early" | "mid" | "recent";
};

const TECH_ERA: Record<string, number> = {
  "s/4hana": 2015,
  s4hana: 2015,
  "sap hana": 2011,
  hana: 2011,
  "rise with sap": 2021,
  "sap activate": 2015,
  fiori: 2013,
  btp: 2020,
  "sap btp": 2020,
  cpi: 2017,
  successfactors: 2011,
  ariba: 2012,
  "embedded analytics": 2018,
  sac: 2015,
  "analytics cloud": 2015,
  "group reporting": 2019,
  "central finance": 2016,
  abap: 1992,
  ecc: 2004,
  "r/3": 1992,
  lsmw: 2000,
  idoc: 1995,
  bapi: 1998,
  otc: 2000,
  p2p: 2000,
  fico: 1995,
  "s/4": 2015,
};

function yearOf(end: number | "Present") {
  return end === "Present" ? new Date().getFullYear() : end;
}

function skillAllowedInProject(skill: string, projectEndYear: number): boolean {
  const key = skill.toLowerCase();
  for (const [tech, minYear] of Object.entries(TECH_ERA)) {
    if (key.includes(tech) && projectEndYear < minYear) return false;
  }
  if (projectEndYear < 2015 && /s\/4|fiori|btp|rise with sap/i.test(skill)) {
    return false;
  }
  if (projectEndYear < 2011 && /hana/i.test(skill)) return false;
  return true;
}

function extractSkillsFromMaster(master: string, _domain?: DomainHint): string[] {
  void _domain;
  // Reuse honest splitter (master side only)
  return skillsHonestFromSources("", master, 28).masterOnly;
}

/**
 * Extract real employer / client names from the master resume experience block.
 * Supports common formats:
 *   Title â€” Employer (2019â€“Present)
 *   Title | Employer | 2019 â€“ Present
 *   Title at Employer
 *   Employer Name (2019 â€“ 2022)
 */
export function extractEmployersFromMaster(master: string): string[] {
  const lines = master
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const found: string[] = [];
  const push = (raw: string) => {
    let name = raw
      .replace(/\s+/g, " ")
      .replace(/[,;|]+$/, "")
      .replace(/^\s*[-â€“â€”]\s*/, "")
      .trim();
    // Drop trailing date fragments if still attached
    name = name
      .replace(/\s*[\(\[]?\s*(?:Present|\d{4})\s*[-â€“â€”to]*\s*(?:Present|\d{4})?\s*[\)\]]?\s*$/i, "")
      .trim();
    if (name.length < 2 || name.length > 80) return;
    if (/^(experience|professional|education|skills|summary|technical|environment|stack)/i.test(name))
      return;
    if (/^\d{4}/.test(name)) return;
    if (/^(remote|onsite|hybrid|united states|client site)$/i.test(name)) return;
    // Prefer looking like an org name (has letter)
    if (!/[A-Za-z]/.test(name)) return;
    const key = name.toLowerCase();
    if (found.some((f) => f.toLowerCase() === key)) return;
    found.push(name);
  };

  for (const line of lines) {
    if (/^[â€¢â–¸â†’â€“\-\*]/.test(line)) continue;
    if (/^(technical skills|skills|education|certifications|summary)/i.test(line) && line.length < 60)
      continue;

    // Title â€” Employer (2019â€“Present)  or  Title â€“ Employer (2019-2021)
    let m = line.match(
      /^.+?\s+[â€”â€“\-]\s+(.+?)\s*[\(\[]\s*(?:Present|\d{4})/i
    );
    if (m?.[1]) {
      push(m[1]);
      continue;
    }

    // Title | Employer | dates
    m = line.match(/^.+?\s+\|\s+([^|]+?)\s+\|\s*(?:Present|\d{4}|Remote|Onsite)/i);
    if (m?.[1]) {
      push(m[1]);
      continue;
    }

    // Title at Employer (dates optional)
    m = line.match(
      /\b(?:Consultant|Developer|Lead|Analyst|Architect|Engineer|Manager|Specialist)\b\s+at\s+(.+?)(?:\s*[\(\|]|\s*$)/i
    );
    if (m?.[1]) {
      push(m[1]);
      continue;
    }

    // Standalone: Employer Name (2019 â€“ Present)
    m = line.match(
      /^([A-Z][A-Za-z0-9&.,'/ \-]{2,60})\s*[\(\[]\s*(?:Present|\d{4})/
    );
    if (m?.[1] && !/\b(Consultant|Developer|Lead|Analyst)\b/i.test(m[1])) {
      push(m[1]);
    }
  }

  return found;
}

/** Generic fallback client labels when master has fewer named employers (no domain invention) */
function clientsForDomain(_domain?: DomainHint): string[] {
  void _domain;
  return [
    "Global Enterprise Client (US)",
    "Fortune 500 Process Industry Client",
    "Regional Services Group Client",
    "Industrial Distribution Client",
    "Enterprise AMS / Continuous Improvement Client",
  ];
}

/** Merge master employers first, then neutral fallbacks â€” always TARGET_PROJECT_COUNT names */
function resolveClientNames(master: string, domain: DomainHint): string[] {
  const fromMaster = extractEmployersFromMaster(master);
  const fallbacks = clientsForDomain(domain);
  const out: string[] = [];
  for (let i = 0; i < TARGET_PROJECT_COUNT; i++) {
    out.push(fromMaster[i] || fallbacks[i] || `Client engagement ${i + 1}`);
  }
  return out;
}

/** Progressive titles from admin policy templates */
function titlesForDomain(
  _domain: DomainHint,
  jobTitle = "",
  policy?: ResumeEnginePolicy
): string[] {
  void _domain;
  return progressiveTitlesFromJobTitle(
    jobTitle || "Consultant",
    TARGET_PROJECT_COUNT,
    policy
  );
}

function parseYearToken(tok: string): number | "Present" | null {
  if (/present|current|now/i.test(tok)) return "Present";
  const y = Number(tok);
  if (y >= 1980 && y <= 2100) return y;
  return null;
}

/** Parse date range like "JUL 2019 â€“ PRESENT" or "2019-2021" */
function parseDateRange(
  text: string
): { start: number; end: number | "Present" } | null {
  const t = text.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  // MON YYYY â€“ PRESENT / MON YYYY â€“ MON YYYY
  let m = t.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*[.\-/]?\s*(\d{4})\s*[â€“â€”\-~to]+\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*[.\-/]?\s*)?(\d{4}|Present|Current|Now)\b/i
  );
  if (m) {
    const start = Number(m[2]);
    const end = parseYearToken(m[4]);
    if (start && end) return { start, end };
  }
  // YYYY â€“ YYYY / YYYY â€“ Present
  m = t.match(/\b(19\d{2}|20\d{2})\s*[â€“â€”\-~to]+\s*(19\d{2}|20\d{2}|Present|Current|Now)\b/i);
  if (m) {
    const start = Number(m[1]);
    const end = parseYearToken(m[2]);
    if (start && end) return { start, end };
  }
  return null;
}

function eraForEnd(end: number | "Present", now: number): ProjectBlock["era"] {
  const y = end === "Present" ? now : end;
  if (y >= now - 3) return "recent";
  if (y >= now - 8) return "mid";
  return "early";
}

type ParsedJob = {
  client: string;
  location: string;
  startYear: number;
  endYear: number | "Present";
  title: string;
  bullets: string[];
};

/** True if line is a location/remote phrase, not a company name */
function isLocationOnlyClient(name: string): boolean {
  return /^(remote|united states|usa|us hybrid|onsite|hybrid|client site|delivery center|home\s*office|various|multiple locations)/i.test(
    name.trim()
  );
}

/**
 * Parse Role Forge export / timeline format:
 *   [Recent leadership] Title
 *   Employer / Client: ACME
 *   Houston, TX  |  2022 â€“ Present
 *   bullets...
 */
function parseJobsFromEmployerClientFormat(lines: string[]): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  let i = 0;
  while (i < lines.length) {
    const empMatch = lines[i].match(/^Employer\s*\/\s*Client:\s*(.+)$/i);
    if (!empMatch) {
      i++;
      continue;
    }
    const client = empMatch[1].trim();
    // Title is usually the non-empty line immediately above Employer/Client
    let title = "Consultant";
    for (let b = i - 1; b >= Math.max(0, i - 4); b--) {
      const prev = lines[b];
      if (!prev) continue;
      if (/^(Employer|Environment|Stack|Modules|Chapter stack|Program stack)/i.test(prev))
        continue;
      if (/^[â€¢â–¸â†’â€“\-\*]/.test(prev)) continue;
      if (parseDateRange(prev)) continue;
      if (prev.length < 140) {
        title = prev.replace(/^\[.*?\]\s*/, "").replace(/\s*[Â·|]\s*/g, " â€” ").trim();
        break;
      }
    }
    i++;
    // Never invent country/city â€” blank until a real location|dates line is parsed
    let location = "";
    let startYear = 0;
    let endYear: number | "Present" = "Present";
    let sawDates = false;
    // Next lines: location | dates, stack, bullets
    const bullets: string[] = [];
    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i++;
        continue;
      }
      if (/^Employer\s*\/\s*Client:/i.test(line)) break;
      // Next title marker like [Recent leadership] or chapter heading before another employer
      if (
        /^\[(Recent|Growth|Foundation)/i.test(line) ||
        (/^[A-Z\[].{8,100}$/.test(line) &&
          !/^[â€¢â–¸â†’â€“\-\*]/.test(line) &&
          !parseDateRange(line) &&
          !/^(Environment|Stack|Modules|Chapter|Program)/i.test(line) &&
          bullets.length > 2)
      ) {
        // Peek: if following is Employer/Client, stop without consuming
        const peek = lines.slice(i, i + 3).join("\n");
        if (/Employer\s*\/\s*Client:/i.test(peek) || /^\[(Recent|Growth|Foundation)/i.test(line)) {
          break;
        }
      }
      const dates = parseDateRange(line);
      if (dates && !bullets.length) {
        const withoutDates = line
          .replace(
            /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*[.\-/]?\s*\d{4}\s*[â€“â€”\-~to]+\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*[.\-/]?\s*)?(?:\d{4}|Present|Current|Now)\b/gi,
            ""
          )
          .replace(
            /\b(19\d{2}|20\d{2})\s*[â€“â€”\-~to]+\s*(19\d{2}|20\d{2}|Present|Current|Now)\b/gi,
            ""
          )
          .replace(/\|/g, " ")
          .trim();
        if (withoutDates) location = withoutDates;
        startYear = dates.start;
        endYear = dates.end;
        sawDates = true;
        i++;
        continue;
      }
      if (/^(Environment|Stack|Modules|Chapter stack|Program stack)/i.test(line)) {
        i++;
        continue;
      }
      if (/^[â€¢â–¸â†’â€“\-\*]/.test(line) || line.length > 40) {
        bullets.push(line.replace(/^[â€¢â–¸â†’â€“\-\*]\s*/, "").trim());
      }
      i++;
    }
    // If client was a location placeholder, try to keep it readable
    const finalClient = isLocationOnlyClient(client)
      ? client // still better than inventing; synthetic path may replace later
      : client;
    // Dates unknown: leave startYear=0 so yearsFromMasterAndProjects ignores it
    if (!sawDates) {
      startYear = 0;
      endYear = "Present";
    }
    jobs.push({
      client: finalClient,
      location,
      startYear,
      endYear,
      title,
      bullets: bullets.filter((b) => b.length > 15).slice(0, 30),
    });
  }
  return jobs;
}

/**
 * Parse ALL professional experience jobs from master resume text.
 * Supports formats like:
 *   SR SOFT LLC | Houston, TX    JUL 2019 â€“ PRESENT
 *   Title line
 *   bullet / prose lines...
 * And Role Forge exports with "Employer / Client:" lines.
 */
export function parseJobsFromMasterText(master: string): ParsedJob[] {
  if (!master || master.length < 40) return [];
  const rawLines = master.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  // Normalize tabs and stuck "TXJUL 2019" patterns
  const lines = rawLines.map((l) =>
    l
      .replace(/\t+/g, " | ")
      .replace(/([A-Z]{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/gi, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
  );

  // Prefer Employer/Client export format when present (re-tailor of prior outputs)
  const empClientJobs = parseJobsFromEmployerClientFormat(lines);
  if (empClientJobs.length >= 2) {
    empClientJobs.sort((a, b) => {
      const ae = a.endYear === "Present" ? 9999 : a.endYear;
      const be = b.endYear === "Present" ? 9999 : b.endYear;
      if (be !== ae) return be - ae;
      return b.startYear - a.startYear;
    });
    return empClientJobs.slice(0, MAX_PROJECTS_FROM_MASTER);
  }

  // Find experience section start
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (
      /^(professional experience|work experience|experience|employment history|work history)\b/i.test(
        lines[i]
      ) &&
      lines[i].length < 60
    ) {
      startIdx = i + 1;
      break;
    }
  }

  // End at education / certifications if after experience
  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    if (
      /^(education|certifications?|skills|technical skills|awards|references)\b/i.test(
        lines[i]
      ) &&
      lines[i].length < 50 &&
      i > startIdx + 3
    ) {
      endIdx = i;
      break;
    }
  }

  const section = lines.slice(startIdx, endIdx);
  const jobs: ParsedJob[] = [];

  const isJobHeader = (line: string): {
    client: string;
    location: string;
    start: number;
    end: number | "Present";
  } | null => {
    if (!line || line.length < 8 || line.length > 160) return null;
    if (/^[â€¢â–¸â†’â€“\-\*]/.test(line)) return null;
    if (/^Employer\s*\/\s*Client:/i.test(line)) return null;
    const dates = parseDateRange(line);
    if (!dates) return null;
    // Must look like company header (has | or company-like left side)
    const withoutDates = line
      .replace(
        /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*[.\-/]?\s*\d{4}\s*[â€“â€”\-~to]+\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*[.\-/]?\s*)?(?:\d{4}|Present|Current|Now)\b/gi,
        ""
      )
      .replace(/\b(19\d{2}|20\d{2})\s*[â€“â€”\-~to]+\s*(19\d{2}|20\d{2}|Present|Current|Now)\b/gi, "")
      .trim()
      .replace(/[|Â·â€¢]+$/, "")
      .trim();
    if (withoutDates.length < 2) return null;
    // Prefer lines with company | location
    const parts = withoutDates.split(/\s*[|Â·â€¢]\s*/).map((p) => p.trim()).filter(Boolean);
    const client = parts[0] || withoutDates;
    // Blank when master has no city/region â€” never invent "United States"
    const location = parts.slice(1).join(", ") || "";
    // Reject pure skill/summary lines mistaken as jobs
    if (/^(profile|summary|skills|what i bring)/i.test(client)) return null;
    // Reject location-only "headers" (common in prior Role Forge exports)
    if (isLocationOnlyClient(client) && parts.length <= 1) return null;
    if (client.split(/\s+/).length > 12 && !/[A-Z]{2,}/.test(client)) return null;
    return { client, location, start: dates.start, end: dates.end };
  };

  let i = 0;
  while (i < section.length) {
    const header = isJobHeader(section[i]);
    if (!header) {
      i++;
      continue;
    }
    i++;
    // Title: next non-empty non-bullet line(s) until bullets/prose
    let title = "";
    const bullets: string[] = [];
    while (i < section.length && !isJobHeader(section[i])) {
      const line = section[i];
      if (!line) {
        i++;
        continue;
      }
      if (/^[â€¢â–¸â†’â€“\-\*]/.test(line) || /^[â€“â€”]\s/.test(line)) {
        bullets.push(line.replace(/^[â€¢â–¸â†’â€“\-\*]\s*/, "").trim());
        i++;
        continue;
      }
      // Title-like line (before bullets accumulate)
      if (!title && bullets.length === 0 && line.length < 140 && !/^Clients?\s+across/i.test(line)) {
        // May be "Title Â· subtitle"
        title = line
          .replace(/^\[.*?\]\s*/, "")
          .replace(/\s*[Â·|]\s*/g, " â€” ")
          .trim();
        i++;
        continue;
      }
      // Stack / meta line (tools) â€” skip as bullet or keep short context
      if (
        /S\/4HANA|SAP ECC|Power BI|Tableau|Oracle|BW|BODS|CFIN|Environment:|Stack:|Chapter stack/i.test(
          line
        ) &&
        line.length < 200 &&
        bullets.length === 0
      ) {
        i++;
        continue;
      }
      // Prose achievement without bullet
      if (line.length > 40 && !/^(profile|summary)/i.test(line)) {
        bullets.push(line);
      }
      i++;
    }
    if (!title) title = "Consultant";
    jobs.push({
      client: header.client,
      location: header.location,
      startYear: header.start,
      endYear: header.end,
      title,
      bullets: bullets.filter((b) => b.length > 15).slice(0, 30),
    });
  }

  // Newest first if not already
  jobs.sort((a, b) => {
    const ae = a.endYear === "Present" ? 9999 : a.endYear;
    const be = b.endYear === "Present" ? 9999 : b.endYear;
    if (be !== ae) return be - ae;
    return b.startYear - a.startYear;
  });

  return jobs.slice(0, MAX_PROJECTS_FROM_MASTER);
}

/**
 * Build engagements from master when possible; otherwise synthetic progressive slots.
 */
function parseMasterProjects(
  master: string,
  domain: DomainHint,
  jobTitle: string,
  policy?: ResumeEnginePolicy
): ProjectBlock[] {
  const now = new Date().getFullYear();
  const baseSkills = extractSkillsFromMaster(master, domain);
  const parsed = parseJobsFromMasterText(master);

  if (parsed.length > 0) {
    return parsed.map((job, idx) => {
      const era = eraForEnd(job.endYear, now);
      const endY = yearOf(job.endYear);
      const skills = baseSkills
        .filter((sk) => skillAllowedInProject(sk, endY))
        .slice(0, era === "early" ? 8 : 14);
      // JD/domain seeds FIRST for recent+mid so RAR/leasing etc. are not buried under master prose
      const seeds = seedBulletsForDomain(domain, era, idx);
      const masterBullets = job.bullets.filter(
        (b) =>
          b.length > 20 &&
          !/near-100%|keyword coverage|staffing|80\s*\/\s*hr|role\s*::/i.test(b)
      );
      const bullets =
        era === "early"
          ? [...masterBullets, ...seeds.slice(0, 3)].slice(0, 18)
          : [...seeds, ...masterBullets].slice(0, 28);
      return {
        // Project-level role always rewritten to JD title (see alignProjectRoleTitle)
        title: alignProjectRoleTitle(job.title, jobTitle, era),
        client: job.client,
        location: (job.location || "").trim(),
        startYear: job.startYear,
        endYear: job.endYear,
        era,
        skills,
        bullets,
      };
    });
  }

  // Fallback synthetic (master had no parseable jobs â€” e.g. placeholder upload)
  // Span only for slot layout â€” never invent "12 years" or force min 8
  const yearsHint = yearsFromMasterAndProjects(master);
  const years = yearsHint > 0 ? Math.min(40, yearsHint) : 10;
  const clients = resolveClientNames(master, domain);
  const titles = titlesForDomain(domain, jobTitle, policy);

  const slices: {
    era: ProjectBlock["era"];
    start: number;
    end: number | "Present";
    title: string;
    client: string;
    location: string;
  }[] = [
    {
      era: "recent",
      start: now - 2,
      end: "Present",
      title: alignProjectRoleTitle(titles[0] || jobTitle, jobTitle, "recent"),
      client: clients[0],
      location: "",
    },
    {
      era: "recent",
      start: now - 4,
      end: now - 2,
      title: alignProjectRoleTitle(titles[1] || jobTitle, jobTitle, "recent"),
      client: clients[1],
      location: "",
    },
    {
      era: "mid",
      start: now - Math.ceil(years * 0.55),
      end: now - 4,
      title: alignProjectRoleTitle(titles[2] || jobTitle, jobTitle, "mid"),
      client: clients[2],
      location: "",
    },
    {
      era: "mid",
      start: now - Math.ceil(years * 0.75),
      end: now - Math.ceil(years * 0.55),
      title: alignProjectRoleTitle(titles[3] || jobTitle, jobTitle, "mid"),
      client: clients[3],
      location: "",
    },
    {
      era: "early",
      start: now - years,
      end: now - Math.ceil(years * 0.75),
      title: alignProjectRoleTitle(titles[4] || jobTitle, jobTitle, "early"),
      client: clients[4],
      location: "",
    },
  ];

  return slices.slice(0, TARGET_PROJECT_COUNT).map((s, idx) => {
    const endY = yearOf(s.end);
    const skills = baseSkills
      .filter((sk) => skillAllowedInProject(sk, endY))
      .slice(0, s.era === "early" ? 8 : 14);
    return {
      title: s.title,
      client: s.client,
      location: s.location,
      startYear: s.start,
      endYear: s.end,
      era: s.era,
      skills,
      bullets: seedBulletsForDomain(domain, s.era, idx),
    };
  });
}

/**
 * Rewrite EVERY project role title toward the JD (employer/dates stay from master).
 * Recent + mid: exact JD title (project-level match).
 * Early: associate/junior form of JD title (progressive honesty, still JD-aligned).
 */
export function alignProjectRoleTitle(
  masterTitle: string,
  jobTitle: string,
  era: ProjectBlock["era"]
): string {
  const jd = (jobTitle || "").trim();
  const master = (masterTitle || "").trim();
  if (!jd) return master || "Consultant";
  if (era === "recent" || era === "mid") return jd.slice(0, 120);
  // Early: progressive junior form of the same JD role
  const base = jd.replace(/\s*[-â€“â€”|/].*$/, "").trim() || jd;
  const deLeaded = base
    .replace(/\b(Senior|Lead|Principal|Staff|Director)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^associate\b/i.test(deLeaded)) return deLeaded.slice(0, 120);
  return `Associate ${deLeaded}`.slice(0, 120);
}

/**
 * Neutral seed bullets only â€” no domain-canned RAR/ATTP/FICO lines.
 * JD-specific jargon is woven later from actual keywords.
 */
function seedBulletsForDomain(
  _domain: DomainHint,
  era: ProjectBlock["era"],
  idx: number
): string[] {
  void _domain;
  if (era === "recent") {
    return [
      "Owned end-to-end delivery for assigned workstream with PMO and process owners.",
      "Led solution design workshops and translated requirements into blueprints.",
      "Configured and unit-tested core process scenarios with measurable outcomes.",
      "Drove integration validation with adjacent modules and interfaces.",
      "Managed defect triage, hypercare, and knowledge transfer to AMS teams.",
    ];
  }
  if (era === "mid") {
    return [
      "Delivered configuration and enhancements across assigned modules with AMS support.",
      "Authored functional specifications and coordinated development handoffs.",
      "Supported SIT/UAT cycles, regression packs, and release readiness.",
      "Partnered with super-users on process training and SOP updates.",
    ];
  }
  return [
    "Supported ticket resolution, data loads, and unit testing under senior guidance.",
    "Assisted with configuration documentation and process walkthroughs.",
    "Contributed to knowledge base articles and team KT sessions.",
    `Engagement ${idx + 1}: built foundational consulting discipline on live client work.`,
  ];
}

/**
 * Expand to at least MIN_BULLETS_PER_PROJECT lines, intensity-scaled for progressive career.
 */
function weaveJdIntoBullets(
  bullets: string[],
  jdKeywords: string[],
  intensity: "high" | "medium" | "low",
  project: ProjectBlock,
  domain: DomainHint
): string[] {
  const endY = yearOf(project.endYear);
  const allowed = jdKeywords.filter((k) => skillAllowedInProject(k, endY));
  // Only JD keywords â€” no canned domain pack fill-ins
  const pack = allowed;
  const k = (i: number, fallback: string) =>
    allowed[i] || pack[i] || fallback;
  void domain;

  // Single JD-keyword-driven bank â€” never domain-canned ATTP/RAR/FICO paragraphs
  const highBank: string[] = [
    `Delivered ${project.title} scope for ${project.client}, emphasizing ${k(0, "core process areas")}, ${k(1, "configuration")}, and ${k(2, "integration")}.`,
    `Executed day-to-day responsibilities aligned to ${project.title}: ${allowed.slice(0, 6).join(", ") || pack.slice(0, 6).join(", ") || "module design, testing, and stakeholder delivery"}.`,
    `Facilitated discovery and design workshops with process owners to baseline requirements for ${k(0, "primary process")} scenarios.`,
    `Configured enterprise structures, master data, and transactional flows supporting ${k(1, "key processes")} and related sub-processes.`,
    `Built and executed unit test scripts covering happy-path and exception scenarios for ${k(2, "key business processes")}.`,
    `Led cross-functional integration testing with adjacent module and interface stakeholders.`,
    `Owned defect lifecycle management in SIT/UATâ€”triage, root-cause analysis, retest, and sign-off coordination.`,
    `Prepared cutover runbooks, mock cutover participation, and hypercare dashboards for go-live readiness.`,
    `Partnered with technical teams on interfaces (IDoc/BAPI/API) impacting ${k(3, "data exchange")} and reconciliation.`,
    `Drove operational support improvements reducing manual effort through automation and checklist discipline.`,
    `Delivered end-user training, job aids, and floor-support during hypercare with measurable adoption feedback.`,
    `Reported status, risks, and decisions to PMO and vendor stakeholders with clear escalation paths.`,
    `Applied ${k(4, "delivery method")} / Agile ceremonies for sprint planning, demos, and backlog refinement.`,
    `Ensured audit-friendly documentation: config trackers, FS/TS alignment notes, and evidence packs.`,
    `Mentored junior consultants on standards while retaining accountability for critical path deliverables.`,
    `Performed fit-gap analysis and recommended standard vs. custom approaches with impact statements.`,
    `Coordinated transport sequencing and release calendar alignment with Basis and change management.`,
    `Validated authorization design with security team for segregation-of-duties sensitive transactions.`,
  ];

  const midBank: string[] = [
    `Supported ${project.client} as ${project.title}, contributing to ${k(0, "module")} delivery within program guardrails.`,
    `Configured assigned process areas and validated results with business process owners.`,
    `Authored functional specs and clarified requirements with ABAP/integration counterparts.`,
    `Executed SIT/UAT scripts; logged defects with reproduction steps and retested fixes.`,
    `Assisted data migration mapping and mock loads for ${k(1, "master/transactional data")} objects.`,
    `Supported interface monitoring and basic reconciliation during test cycles.`,
    `Maintained configuration workbooks and process flow documentation for AMS handoff.`,
    `Conducted knowledge sessions for super-users on day-to-day transactions.`,
    `Collaborated with seniors on design alternatives without sole ownership of enterprise architecture.`,
    `Participated in daily stand-ups and weekly status, escalating blockers early.`,
    `Applied ${allowed.slice(0, 3).join(", ") || "core skills"} within release timelines and change-control process.`,
    `Contributed to regression pack updates after each transport wave.`,
    `Supported hypercare ticket queues with documented resolution steps.`,
    `Improved personal delivery quality via peer review of configs and test evidence.`,
    `Prepared demo scripts for sprint reviews and captured business feedback for backlog refinement.`,
    `Assisted cutover checklist execution for assigned objects during mock and production waves.`,
    `Coordinated with offshore team members on task split, handoffs, and daily progress updates.`,
  ];

  const earlyBank: string[] = [
    `Joined ${project.client} engagement as ${project.title}, building foundational SAP consulting skills under mentorship.`,
    `Assisted seniors with configuration changes following documented build steps (not independent design ownership).`,
    `Performed unit testing of assigned scenarios and captured results in shared test trackers.`,
    `Supported ticket research: reproduced issues, gathered screenshots, and drafted preliminary analysis.`,
    `Helped prepare training materials and quick-reference guides for business users.`,
    `Executed data load templates and validated counts under supervision.`,
    `Maintained meeting notes, RAID logs (as directed), and status inputs for the workstream lead.`,
    `Learned client process vocabulary and mapped transactions to standard SAP flows.`,
    allowed[0] && skillAllowedInProject(allowed[0], endY)
      ? `Gained introductory exposure to ${allowed[0]} through guided exercises (not lead ownership).`
      : `Gained introductory exposure to core SAP navigation and process flows through guided exercises.`,
    `Participated in shadowing sessions during workshops; contributed clarifying questions and notes.`,
    `Followed team coding/config standards and peer-review checklist before transports.`,
    `Built professional communication habits with onsite and offshore team members.`,
    `Documented lessons learned for the team knowledge base after each sprint/wave.`,
    `Supported preparation of evidence packs for audit or quality gate reviews as directed by seniors.`,
    `Practiced professional client presence: punctuality, clear status updates, and respectful escalation.`,
    `Completed internal training modules relevant to the engagement before taking production-facing tasks.`,
  ];

  const bank =
    intensity === "high" ? highBank : intensity === "medium" ? midBank : earlyBank;

  const target =
    intensity === "high"
      ? RECENT_BULLETS_PER_PROJECT
      : intensity === "medium"
        ? MID_BULLETS_PER_PROJECT
        : EARLY_BULLETS_PER_PROJECT;

  // Explicit JD-keyword bullets (recent+mid) so page-1 match is near-total
  const keywordBullets: string[] = [];
  if (intensity === "high" || intensity === "medium") {
    const pool = Array.from(new Set([...allowed, ...pack])).slice(
      0,
      intensity === "high" ? 14 : 8
    );
    for (let i = 0; i < pool.length; i += 2) {
      const a = pool[i];
      const b = pool[i + 1];
      keywordBullets.push(
        b
          ? `Applied ${a} and ${b} on ${project.client} deliverables with design, config/build, test evidence, and stakeholder sign-off.`
          : `Applied ${a} end-to-end on ${project.client} with configuration, validation, and release-ready documentation.`
      );
    }
  }

  // JD-first conversion: domain bank + keywords before master prose on recent/mid
  // so RAR/leasing/ABAP (etc.) appear at the top of every project, not buried.
  const ordered =
    intensity === "high"
      ? [...bank, ...keywordBullets, ...bullets]
      : intensity === "medium"
        ? [...keywordBullets, ...bank.slice(0, 12), ...bullets]
        : [...bullets, ...bank];

  const merged: string[] = [];
  const seen = new Set<string>();
  const cap = Math.min(28, Math.max(target + 4, bullets.length + 4));
  for (const line of ordered) {
    const t = line.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    // Drop generic "owned end-to-end" filler when we already have domain-specific lines
    if (
      intensity !== "low" &&
      merged.length >= 6 &&
      /Owned end-to-end delivery for assigned workstream|Led solution design workshops and translated requirements into blueprints/i.test(
        t
      )
    ) {
      continue;
    }
    seen.add(t.toLowerCase());
    merged.push(t);
    if (merged.length >= cap) break;
  }
  // Pad if still short
  let pad = 1;
  while (merged.length < target) {
    merged.push(
      intensity === "low"
        ? `Continued skill-building task ${pad}: documentation, testing support, and process shadowing on ${project.client}.`
        : `Additional delivery contribution ${pad}: supported ${k(pad % 5, "process")} improvements, testing, and release evidence for ${project.client} (${allowed.slice(0, 3).join(", ") || "JD-aligned modules"}).`
    );
    pad++;
  }
  return merged.slice(0, target);
}

function buildLongSummary(
  candidateName: string,
  headline: string,
  keywords: string[],
  vendorName: string,
  yearsHint: number,
  _domain?: DomainHint
): string[] {
  void _domain;
  const first = candidateName.split(/\s+/)[0] || candidateName;
  const kwPrimary =
    keywords.slice(0, 10).join(", ") ||
    "process delivery, configuration, integration";
  const kwSecondary =
    keywords.slice(10, 22).join(", ") ||
    "testing, cutover, hypercare, stakeholder management, documentation";
  // Jargon from JD keywords only â€” never canned domain paragraphs
  const jargon =
    keywords.slice(0, 8).join(", ") ||
    "solution blueprinting, configuration baselines, interface contracts, test traceability, and cutover orchestration";

  void vendorName;
  const yearsPart =
    yearsHint > 0
      ? ` with approximately ${yearsHint}+ years of progressive consulting`
      : " with progressive consulting experience";
  return [
    `${first} is a ${headline}${yearsPart} across full-lifecycle implementations, rollouts, upgrades, and AMS support models.`,
    `Core technical focus includes ${kwPrimary}.`,
    kwSecondary
      ? `Additional strengths include ${kwSecondary}.`
      : `Delivers configuration, testing, integration, and release-ready documentation across multi-workstream programs.`,
    `Hands-on delivery across ${jargon}.`,
    `Experienced in design workshops, configuration/build, interface validation, SIT/UAT, defect triage, cutover readiness, and hypercare stabilization.`,
    `Produces implementation artifacts including blueprints, configuration trackers, interface designs, and UAT evidence packs.`,
    `Career progression spans foundation delivery work, mid-level functional ownership, and recent workstream leadership with stakeholder and release accountability.`,
    `Works effectively in onsite/offshore collaboration models with clear status cadence and escalation during go-live windows.`,
  ].filter(Boolean);
}

function buildImpactSnapshot(
  _domain: DomainHint,
  keywords: string[],
  bullet: string
): string[] {
  void _domain;
  const k = keywords.slice(0, 10);
  const kwLine = k.join(", ") || "JD-critical skills";
  const peaks = [
    `Delivered end-to-end functional outcomes on ${kwLine} across recent transformation programs.`,
    `Owned design-to-deploy artifacts: workshops, config baselines, test traceability, and cutover runbooks.`,
    `Improved release quality via structured defect triage, regression packs, and stakeholder sign-off discipline.`,
    `Partnered with integration and security teams on interface and authorization readiness for production waves.`,
    `Completed hypercare and AMS knowledge transfer with reduction in open severity defects.`,
    `Executed implement, configure, test, integrate, and cutover activities with clear ownership and documentation.`,
    `Produced audit-friendly evidence packs including config trackers, test matrices, and go-live readiness notes.`,
  ];
  return peaks.map((p) => `${bullet} ${p}`);
}

function buildSkillsSection(
  keywords: string[],
  projects: ProjectBlock[],
  separator: string
): string[] {
  // Full JD skill bank first (page-1 density) â€” never job-board noise
  const functional = Array.from(
    new Set([
      ...keywords.filter(
        (k) =>
          k.length > 2 &&
          !/location|remote|foster|interview|contract|travel|duration|preferred|someone|occasional/i.test(
            k
          )
      ),
      ...projects.flatMap((p) => p.skills),
    ])
  ).slice(0, 40);

  const tools = [
    "SAP GUI",
    "Fiori (where era-appropriate)",
    "Solution Manager / Charm (program dependent)",
    "HP ALM / Azure DevOps / Jira (test & defect tracking)",
    "MS Excel / PowerPoint for workshops and status",
    "IDoc / RFC / interface monitoring",
    "Transport & change control",
    "Evidence packs / audit binders",
  ];

  const soft = [
    "Stakeholder management",
    "Workshop facilitation",
    "Cross-functional collaboration",
    "Documentation & KT",
    "Agile / Activate ceremonies",
    "PMO status & RAID discipline",
    "Hypercare command cadence",
  ];

  const half = Math.ceil(functional.length / 2);
  return [
    `Core skills: ${functional.slice(0, half).join(separator)}`,
    functional.slice(half).length
      ? `Additional skills: ${functional.slice(half).join(separator)}`
      : "",
    `Tools & platforms: ${tools.join(separator)}`,
    `Delivery skills: ${soft.join(separator)}`,
  ].filter(Boolean);
}

/** Force every JD keyword into structured first-page content (DOCX/PDF, not only plain text). */
function ensureStructuredJdCoverage(
  sections: { heading: string; lines: string[] }[],
  jobTitle: string,
  missing: string[],
  allKeywords: string[]
): void {
  if (!missing.length && allKeywords.length === 0) return;
  const inject = Array.from(
    new Set([...missing, ...allKeywords.slice(0, 24)])
  )
    .filter((m) => m.length > 2)
    .slice(0, 30);
  if (!inject.length) return;

  // Inject clean skills only â€” never labels with "JD" / "Role" / rates
  const cleanInject = sanitizeSkillList(inject, 28);
  if (!cleanInject.length) return;
  const skillsLine = cleanInject.join(" Â· ");
  const skillIdx = sections.findIndex((s) =>
    /competenc|skill|matrix|focus|toolkit|method|technical|capability/i.test(s.heading)
  );
  if (skillIdx >= 0) {
    const lines = [...sections[skillIdx].lines];
    // Prefer filling PRIMARY/Core skills line rather than prepending meta
    const coreIdx = lines.findIndex((l) =>
      /^(PRIMARY|Core skills|Additional skills)/i.test(l)
    );
    if (coreIdx >= 0 && !cleanInject.slice(0, 2).every((k) => lines[coreIdx].includes(k))) {
      lines[coreIdx] = `${lines[coreIdx]}  |  ${skillsLine}`;
    } else if (!lines.some((l) => cleanInject.slice(0, 2).every((k) => l.includes(k)))) {
      lines.push(skillsLine);
    }
    sections[skillIdx] = { ...sections[skillIdx], lines };
  }
  void jobTitle;
}

function reinforceForAts(
  text: string,
  jobTitle: string,
  missing: string[]
): string {
  if (!missing.length) return text;
  const inject = missing
    .slice(0, 20)
    .filter((m) => m.length > 2)
    .join(", ");
  if (!inject) return text;
  // Quiet ATS reinforcement â€” skills only, no marketing prose
  if (!/TECHNICAL SKILLS|CORE COMPETENCIES|CORE SKILLS/i.test(text)) {
    return text + `\n\nTECHNICAL SKILLS\n${inject}\n`;
  }
  if (!missing.every((m) => new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text))) {
    return text + `\n${inject}\n`;
  }
  void jobTitle;
  return text;
}

/**
 * Deterministic / preview path â€” SAME assembly as production OpenAI packs
 * (`assemble-pack.buildProjects` + `buildStructuredFromLayout`).
 *
 * Does NOT use dense weaveJdIntoBullets banks or a second LLM refine path.
 * `useLlm` is ignored (always false) so preview density cannot diverge from
 * production honesty rules; production must call tailorResume â†’ ai-tailor.
 */
export async function progressiveTailor(opts: {
  master: string;
  jd: string;
  vendorName: string;
  candidateName: string;
  layoutId?: ResumeLayoutId | string | null;
  email?: string;
  /** @deprecated Ignored â€” deterministic path never calls a second LLM. */
  useLlm?: boolean;
}): Promise<{
  structured: StructuredResume;
  text: string;
  ats: AtsResult;
  usedLlm?: boolean;
}> {
  void opts.useLlm;
  // Dynamic import avoids circular load with assemble-pack
  const { assembleDeterministicPack } = await import("./assemble-pack");
  const pack = await assembleDeterministicPack({
    master: opts.master,
    jd: opts.jd,
    vendorName: opts.vendorName,
    candidateName: opts.candidateName,
    layoutId: opts.layoutId,
    email: opts.email,
  });
  return {
    structured: pack.structured,
    text: pack.text,
    ats: pack.ats,
    usedLlm: false,
  };
}

