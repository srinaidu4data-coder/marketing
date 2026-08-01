/**
 * Master Profile — Karpathy-style ground truth.
 *
 * Philosophy:
 * 1. Parse ONCE at upload (create/replace master).
 * 2. Store a structured skeleton: employers, dates, titles, bullets, skills.
 * 3. Generation never invents employers; it only reframes this skeleton + JD.
 *
 * The AI path receives: MasterProfile (structured) + raw text (optional context) + JD.
 */

export const MASTER_PROFILE_VERSION = 1 as const;

export type MasterEngagement = {
  /** Display / employer name (ground truth) */
  client: string;
  location: string;
  startYear: number;
  endYear: number | "Present";
  /** Role title as written on master (not JD) */
  title: string;
  bullets: string[];
  project?: string;
  industry?: string;
  environment?: string;
};

export type MasterProfile = {
  version: typeof MASTER_PROFILE_VERSION;
  parsedAt: string;
  sourceChars: number;
  nameHint?: string;
  skills: string[];
  summaryLines: string[];
  engagements: MasterEngagement[];
  /** Diagnostics for completeness gates */
  signals: {
    roleLineCount: number;
    clientLineCount: number;
    companyDateLineCount: number;
  };
  warnings: string[];
};

export function emptyMasterProfile(sourceChars = 0): MasterProfile {
  return {
    version: MASTER_PROFILE_VERSION,
    parsedAt: new Date().toISOString(),
    sourceChars,
    skills: [],
    summaryLines: [],
    engagements: [],
    signals: { roleLineCount: 0, clientLineCount: 0, companyDateLineCount: 0 },
    warnings: sourceChars < 40 ? ["Master text too short to parse."] : [],
  };
}

export function serializeMasterProfile(p: MasterProfile): string {
  return JSON.stringify(p);
}

export function parseStoredMasterProfile(
  raw: string | null | undefined
): MasterProfile | null {
  if (!raw || !raw.trim() || raw.trim() === "{}") return null;
  try {
    const p = JSON.parse(raw) as MasterProfile;
    if (!p || !Array.isArray(p.engagements)) return null;
    return p;
  } catch {
    return null;
  }
}

// ─── Date parsing (tolerant of Word export quirks) ─────────────────────────

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

function monthToNum(m: string): number {
  const s = m.toLowerCase().slice(0, 3);
  const map: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return map[s] || 1;
}

export function parseDateRange(
  text: string
): { start: number; end: number | "Present" } | null {
  const t = text.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;

  // Mon YYYY – Mon YYYY | Present | Current | Now
  const re1 = new RegExp(
    `${MONTH}\\s*[.\\-/]?\\s*(19\\d{2}|20\\d{2})\\s*[–—\\-~to]+\\s*(?:${MONTH}\\s*[.\\-/]?\\s*)?(19\\d{2}|20\\d{2}|Present|Current|Now)\\b`,
    "i"
  );
  let m = t.match(re1);
  if (m) {
    const start = Number(m[1]);
    const endRaw = m[2];
    const end = /present|current|now/i.test(endRaw)
      ? ("Present" as const)
      : Number(endRaw);
    if (start >= 1980 && start <= 2100) return { start, end };
  }

  // YYYY – YYYY | Present
  m = t.match(
    /\b(19\d{2}|20\d{2})\s*[–—\-~to]+\s*(19\d{2}|20\d{2}|Present|Current|Now)\b/i
  );
  if (m) {
    const start = Number(m[1]);
    const end = /present|current|now/i.test(m[2])
      ? ("Present" as const)
      : Number(m[2]);
    if (start >= 1980) return { start, end };
  }

  // Single "Mon YYYY –" open-ended (treat as Present)
  const reOpen = new RegExp(
    `${MONTH}\\s*[.\\-/]?\\s*(19\\d{2}|20\\d{2})\\s*[–—\\-~]+\\s*$`,
    "i"
  );
  m = t.match(reOpen);
  if (m) {
    const start = Number(m[1]);
    if (start >= 1980) return { start, end: "Present" };
  }

  return null;
}

function stripDates(line: string): string {
  return line
    .replace(new RegExp(MONTH + "\\s*[.\\-/]?\\s*\\d{4}", "gi"), " ")
    .replace(/\b(19\d{2}|20\d{2})\b/g, " ")
    // Dashes only — never a character class that includes letters t/o
    .replace(/\s*[–—―−\-]+\s*/g, " ")
    .replace(/\s+\bto\b\s+/gi, " ")
    .replace(/\b(Present|Current|Now)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^Client:\s*/i, "")
    .trim();
}

function isHeaderLike(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 6 || t.length > 180) return false;
  if (/^(role|project|industry|environment|responsibilities|executive summary|skills|education|certifications?)\b/i.test(t))
    return false;
  if (/^[•▸→–\-\*]/.test(t)) return false;

  // Client: Company...
  if (/^Client:\s*.+/i.test(t)) return true;

  // Company, City, ST  (+ optional dates)
  if (
    /,\s*[A-Z]{2}\b/.test(t) &&
    !/^(configured|worked|implemented|managed|led|designed|conducted|integrated|delivered|developed|involved)/i.test(
      t
    )
  ) {
    return true;
  }

  // Company line with date range on same line
  if (parseDateRange(t) && !/^(configured|worked|implemented)/i.test(t)) {
    const left = stripDates(t);
    if (left.length >= 3 && left.length < 100) return true;
  }

  return false;
}

function normalizeClientName(raw: string): string {
  return raw
    .replace(/^Client:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[|,;]+$/g, "")
    .trim();
}

function extractLocation(line: string): string {
  // "Company, Dallas, TX" → Dallas, TX
  const cleaned = stripDates(line).replace(/^Client:\s*/i, "");
  const m = cleaned.match(/,\s*([^,]+,\s*[A-Z]{2})\s*$/);
  if (m) return m[1].trim();
  const m2 = cleaned.match(/,\s*([A-Za-z .]+,\s*[A-Z]{2})\b/);
  if (m2) return m2[1].trim();
  return "";
}

function isBullet(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^[•▸→–\-\*]/.test(t)) return true;
  if (
    t.length > 45 &&
    /^(Configured|Managed|Led|Delivered|Implemented|Worked|Conducted|Designed|Integrated|Developed|Performed|Assisted|Supported|Spearheaded|Optimized|Automated|Defined|Involved|Streamlined|Contributed|Driving|Drove)/i.test(
      t
    )
  )
    return true;
  return false;
}

function cleanBullet(line: string): string {
  return line.replace(/^[•▸→–\-\*]\s*/, "").replace(/\s+/g, " ").trim();
}

/**
 * Parse master resume text into structured ground truth.
 * Handles mixed formats: "Company, ST + dates", "Client: …", Role:/Project: blocks.
 */
export function parseMasterProfile(masterText: string): MasterProfile {
  const sourceChars = (masterText || "").length;
  const profile = emptyMasterProfile(sourceChars);
  if (sourceChars < 40) return profile;

  const rawLines = masterText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) =>
      l
        .replace(/\t+/g, " ")
        .replace(/([A-Z]{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/gi, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
    );

  const lines = rawLines.filter((l, i, arr) => l || (arr[i - 1] && arr[i + 1]));

  // Name hint: first short proper line
  if (lines[0] && lines[0].length < 60 && !/summary|skills|linkedin/i.test(lines[0])) {
    profile.nameHint = lines[0];
  }

  // Skills line(s)
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    if (/^(technical skills|skills|core competencies)\b/i.test(lines[i])) {
      const blob = [lines[i], lines[i + 1], lines[i + 2]]
        .filter(Boolean)
        .join(" ")
        .replace(/^(technical skills|skills|core competencies)\s*:?\s*/i, "");
      profile.skills = blob
        .split(/[,;|·•]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && s.length < 50)
        .slice(0, 40);
      break;
    }
  }

  // Summary
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    if (/^(executive summary|professional summary|summary|profile)\b/i.test(lines[i])) {
      const out: string[] = [];
      for (let j = i + 1; j < lines.length && out.length < 12; j++) {
        if (isHeaderLike(lines[j]) || /^(project work|experience|skills|role:)/i.test(lines[j]))
          break;
        if (lines[j].length > 40) out.push(lines[j]);
      }
      profile.summaryLines = out;
      break;
    }
  }

  // Signal counts
  profile.signals.roleLineCount = lines.filter((l) => /^Role:\s*/i.test(l)).length;
  profile.signals.clientLineCount = lines.filter((l) => /^Client:\s*/i.test(l)).length;
  profile.signals.companyDateLineCount = lines.filter(
    (l) => isHeaderLike(l) && parseDateRange(l)
  ).length;

  // Find engagement header indices
  const headerIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isHeaderLike(lines[i])) continue;
    // Prefer lines that have dates OR Client: OR look like company,ST before a Role:
    const hasDate = !!parseDateRange(lines[i]);
    const isClient = /^Client:/i.test(lines[i]);
    const nextRole = lines.slice(i, i + 4).some((l) => /^Role:\s*/i.test(l));
    const companySt =
      /,\s*[A-Z]{2}\b/.test(lines[i]) &&
      !/^(Configured|Worked|Implemented)/i.test(lines[i]);
    if (hasDate || isClient || (companySt && nextRole)) {
      headerIdx.push(i);
    }
  }

  // Dedupe adjacent headers (same company)
  const headers: number[] = [];
  for (const i of headerIdx) {
    if (
      headers.length &&
      normalizeClientName(stripDates(lines[headers[headers.length - 1]])) ===
        normalizeClientName(stripDates(lines[i]))
    ) {
      continue;
    }
    headers.push(i);
  }

  for (let h = 0; h < headers.length; h++) {
    const start = headers[h];
    const end = h + 1 < headers.length ? headers[h + 1] : lines.length;
    const block = lines.slice(start, end);
    const headerLine = block[0] || "";

    const dates = parseDateRange(headerLine);
    let startYear = dates?.start || 0;
    let endYear: number | "Present" = dates?.end || "Present";

    // Sometimes dates on next line
    if (!dates) {
      for (const bl of block.slice(1, 4)) {
        const d = parseDateRange(bl);
        if (d) {
          startYear = d.start;
          endYear = d.end;
          break;
        }
      }
    }

    const client = normalizeClientName(stripDates(headerLine)) || "Client";
    const location = extractLocation(headerLine);

    let title = "";
    let project = "";
    let industry = "";
    let environment = "";
    const bullets: string[] = [];
    let inResponsibilities = false;

    for (let i = 1; i < block.length; i++) {
      const line = block[i];
      if (!line) continue;

      const roleM = line.match(/^Role:\s*(.+)$/i);
      if (roleM) {
        title = roleM[1].trim();
        continue;
      }
      const projM = line.match(/^Project:\s*(.+)$/i);
      if (projM) {
        project = projM[1].trim();
        continue;
      }
      const indM = line.match(/^Industry:\s*(.+)$/i);
      if (indM) {
        industry = indM[1].trim();
        continue;
      }
      const envM = line.match(/^Environment:\s*(.+)$/i);
      if (envM) {
        environment = envM[1].trim();
        continue;
      }
      if (/^Responsibilities:\s*$/i.test(line)) {
        inResponsibilities = true;
        continue;
      }
      if (/^(clients|clients:)/i.test(line) && line.length < 80) continue;

      if (isBullet(line) || inResponsibilities) {
        const b = cleanBullet(line);
        if (b.length > 20 && b.length < 400) bullets.push(b);
        if (bullets.length >= 40) break;
      }
    }

    if (!title) {
      // Fallback: first short non-meta line
      for (const line of block.slice(1, 6)) {
        if (
          line.length > 8 &&
          line.length < 120 &&
          !/^(project|industry|environment|responsibilities|clients)/i.test(line)
        ) {
          title = line;
          break;
        }
      }
    }
    if (!title) title = "Consultant";

    // Skip garbage "headers" that captured prose
    if (
      /^(Worked|Configured|Implemented|Managed)\b/i.test(client) ||
      client.split(/\s+/).length > 14
    ) {
      profile.warnings.push(`Skipped suspicious header: ${client.slice(0, 60)}`);
      continue;
    }

    profile.engagements.push({
      client,
      location,
      startYear,
      endYear,
      title: title.slice(0, 140),
      bullets: bullets.slice(0, 36),
      project: project || undefined,
      industry: industry || undefined,
      environment: environment || undefined,
    });
  }

  // Sort newest first
  profile.engagements.sort((a, b) => {
    const ae = a.endYear === "Present" ? 9999 : a.endYear;
    const be = b.endYear === "Present" ? 9999 : b.endYear;
    if (be !== ae) return be - ae;
    return b.startYear - a.startYear;
  });

  // Harvest skills from Environment: lines when no Skills section (common consultant format)
  if (profile.skills.length === 0) {
    const envTokens = new Set<string>();
    for (const e of profile.engagements) {
      if (!e.environment) continue;
      for (const tok of e.environment.split(/[,;/|·•]+/)) {
        const t = tok.trim();
        if (t.length > 1 && t.length < 48) envTokens.add(t);
      }
    }
    profile.skills = Array.from(envTokens).slice(0, 40);
  }

  // Completeness warnings
  const n = profile.engagements.length;
  if (n === 0) {
    profile.warnings.push("No engagements parsed from master.");
  }
  if (
    profile.signals.roleLineCount > 0 &&
    n < profile.signals.roleLineCount
  ) {
    profile.warnings.push(
      `Parsed ${n} engagements but found ${profile.signals.roleLineCount} Role: lines — review master format.`
    );
  }
  if (
    profile.signals.clientLineCount > 0 &&
    n < profile.signals.clientLineCount
  ) {
    profile.warnings.push(
      `Parsed ${n} engagements but found ${profile.signals.clientLineCount} Client: lines.`
    );
  }

  return profile;
}

/**
 * Compact structured payload for the AI path: facts only (no prose invent).
 * Pair this with the JD; model reframes, never invents employers/dates.
 */
export function profileForAiPath(profile: MasterProfile): {
  version: number;
  engagementCount: number;
  nameHint?: string;
  skills: string[];
  summaryLines: string[];
  engagements: {
    i: number;
    client: string;
    location: string;
    startYear: number;
    endYear: number | "Present";
    title: string;
    project?: string;
    industry?: string;
    environment?: string;
    masterBullets: string[];
  }[];
  warnings: string[];
} {
  return {
    version: profile.version,
    engagementCount: profile.engagements.length,
    nameHint: profile.nameHint,
    skills: profile.skills.slice(0, 40),
    summaryLines: profile.summaryLines.slice(0, 12),
    engagements: profile.engagements.map((e, i) => ({
      i,
      client: e.client,
      location: e.location || "",
      startYear: e.startYear || 0,
      endYear: e.endYear || "Present",
      title: e.title || "Consultant",
      project: e.project,
      industry: e.industry,
      environment: e.environment,
      masterBullets: (e.bullets || []).filter((b) => b.length > 12).slice(0, 12),
    })),
    warnings: profile.warnings,
  };
}

/** Convert profile → generation anchors (AI path contract). */
export function profileToAnchors(profile: MasterProfile): {
  i: number;
  client: string;
  location: string;
  startYear: number;
  endYear: number | "Present";
  masterTitle: string;
  masterBullets: string[];
}[] {
  return profile.engagements.map((e, i) => ({
    i,
    client: e.client,
    location: e.location || "",
    startYear: e.startYear || 0,
    endYear: e.endYear || "Present",
    masterTitle: e.title || "Consultant",
    masterBullets: (e.bullets || []).filter((b) => b.length > 12).slice(0, 20),
  }));
}
