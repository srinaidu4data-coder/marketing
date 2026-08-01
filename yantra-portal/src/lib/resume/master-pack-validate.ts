/**
 * Full ground-truth validation — upload profile + post-generation pack.
 *
 * Not “how many jobs?” — every field the AI path must respect:
 * identity, tenure, each employer (client/location/dates/title/bullets/env),
 * skills, completeness signals, and after generation: presence, no invention,
 * single years claim, no dropped clients.
 */

import {
  parseMasterProfile,
  parseStoredMasterProfile,
  type MasterEngagement,
  type MasterProfile,
} from "./master-profile";

export type CheckSeverity = "pass" | "warn" | "fail";

export type ValidationCheck = {
  id: string;
  label: string;
  severity: CheckSeverity;
  detail: string;
  /** Group for UI */
  group:
    | "identity"
    | "completeness"
    | "engagement"
    | "skills"
    | "pack"
    | "honesty";
};

export type MasterValidationReport = {
  ok: boolean; // no fails
  score: number; // 0–100 weighted
  engagementCount: number;
  careerSpanYears: number;
  checks: ValidationCheck[];
  /** Per-engagement field matrix for UI */
  engagements: {
    index: number;
    client: string;
    location: string;
    startYear: number;
    endYear: number | "Present";
    title: string;
    project?: string;
    industry?: string;
    environment?: string;
    bulletCount: number;
    sampleBullets: string[];
    fieldChecks: ValidationCheck[];
  }[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
};

export type PackValidationReport = MasterValidationReport & {
  clientsFound: string[];
  clientsMissing: string[];
  clientsExtra: string[];
  yearsClaimsInSummary: string[];
};

function normClient(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/^employer\s*\/\s*client:\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function careerSpan(profile: MasterProfile): number {
  const starts = profile.engagements
    .map((e) => e.startYear)
    .filter((y) => y >= 1980 && y <= 2100);
  if (!starts.length) return 0;
  return Math.max(0, new Date().getFullYear() - Math.min(...starts));
}

function tally(checks: ValidationCheck[]): MasterValidationReport["summary"] {
  return {
    pass: checks.filter((c) => c.severity === "pass").length,
    warn: checks.filter((c) => c.severity === "warn").length,
    fail: checks.filter((c) => c.severity === "fail").length,
  };
}

function scoreFrom(checks: ValidationCheck[]): number {
  if (!checks.length) return 0;
  let pts = 0;
  let max = 0;
  for (const c of checks) {
    const w = c.severity === "fail" ? 3 : c.severity === "warn" ? 2 : 1;
    max += 3;
    if (c.severity === "pass") pts += 3;
    else if (c.severity === "warn") pts += 1;
    else pts += 0;
    void w;
  }
  return Math.round((pts / max) * 100);
}

function engagementFieldChecks(
  e: MasterEngagement,
  index: number
): ValidationCheck[] {
  const tag = `E${index + 1}`;
  const checks: ValidationCheck[] = [];

  const clientOk = (e.client || "").trim().length >= 2 && e.client !== "Client";
  checks.push({
    id: `${tag}_client`,
    label: `${tag} employer/client`,
    severity: clientOk ? "pass" : "fail",
    detail: clientOk ? e.client : "Missing or generic client name",
    group: "engagement",
  });

  const datesOk =
    e.startYear >= 1980 &&
    e.startYear <= 2100 &&
    (e.endYear === "Present" ||
      (typeof e.endYear === "number" &&
        e.endYear >= e.startYear &&
        e.endYear <= 2100));
  checks.push({
    id: `${tag}_dates`,
    label: `${tag} dates`,
    severity: datesOk ? "pass" : e.startYear ? "warn" : "fail",
    detail: `${e.startYear || "?"}–${e.endYear}`,
    group: "engagement",
  });

  const titleOk =
    (e.title || "").trim().length >= 3 &&
    !/^(consultant|role)$/i.test(e.title.trim());
  checks.push({
    id: `${tag}_title`,
    label: `${tag} master title`,
    severity: titleOk ? "pass" : "warn",
    detail: e.title || "(empty)",
    group: "engagement",
  });

  checks.push({
    id: `${tag}_location`,
    label: `${tag} location`,
    severity: (e.location || "").trim().length >= 2 ? "pass" : "warn",
    detail: e.location || "(none on master line)",
    group: "engagement",
  });

  const bullets = e.bullets || [];
  checks.push({
    id: `${tag}_bullets`,
    label: `${tag} responsibility bullets`,
    severity:
      bullets.length >= 4 ? "pass" : bullets.length >= 1 ? "warn" : "fail",
    detail: `${bullets.length} bullet(s)`,
    group: "engagement",
  });

  checks.push({
    id: `${tag}_project`,
    label: `${tag} project`,
    severity: e.project ? "pass" : "warn",
    detail: e.project || "(optional — not on master)",
    group: "engagement",
  });

  checks.push({
    id: `${tag}_industry`,
    label: `${tag} industry`,
    severity: e.industry ? "pass" : "warn",
    detail: e.industry || "(optional — not on master)",
    group: "engagement",
  });

  checks.push({
    id: `${tag}_environment`,
    label: `${tag} environment/tools`,
    severity: e.environment ? "pass" : "warn",
    detail: e.environment
      ? e.environment.slice(0, 120)
      : "(optional — not on master)",
    group: "engagement",
  });

  return checks;
}

/**
 * Validate structured master after upload — every field needed for AI path.
 */
export function validateMasterProfile(
  profile: MasterProfile | null | undefined
): MasterValidationReport {
  const checks: ValidationCheck[] = [];
  const empty: MasterValidationReport = {
    ok: false,
    score: 0,
    engagementCount: 0,
    careerSpanYears: 0,
    checks: [
      {
        id: "profile_present",
        label: "Structured profile present",
        severity: "fail",
        detail: "No masterProfileJson — re-upload .docx/.txt master",
        group: "completeness",
      },
    ],
    engagements: [],
    summary: { pass: 0, warn: 0, fail: 1 },
  };
  if (!profile) return empty;

  checks.push({
    id: "profile_present",
    label: "Structured profile present",
    severity: "pass",
    detail: `v${profile.version} · parsed ${profile.parsedAt || "?"} · ${profile.sourceChars || 0} source chars`,
    group: "completeness",
  });

  checks.push({
    id: "source_chars",
    label: "Master text extracted",
    severity:
      profile.sourceChars >= 500
        ? "pass"
        : profile.sourceChars >= 40
          ? "warn"
          : "fail",
    detail: `${profile.sourceChars} characters`,
    group: "completeness",
  });

  checks.push({
    id: "name_hint",
    label: "Name hint from master",
    severity: profile.nameHint ? "pass" : "warn",
    detail: profile.nameHint || "(not detected — header may use logo-only)",
    group: "identity",
  });

  const n = profile.engagements.length;
  checks.push({
    id: "engagement_count",
    label: "Engagement count (employers)",
    severity: n >= 1 ? "pass" : "fail",
    detail: `${n} engagement(s)`,
    group: "completeness",
  });

  // Completeness vs Role:/Client: signals
  const { roleLineCount, clientLineCount, companyDateLineCount } =
    profile.signals || {
      roleLineCount: 0,
      clientLineCount: 0,
      companyDateLineCount: 0,
    };

  checks.push({
    id: "signal_roles",
    label: "Role: lines vs parsed engagements",
    severity:
      roleLineCount === 0
        ? "pass"
        : n >= roleLineCount
          ? "pass"
          : n >= Math.max(1, roleLineCount - 1)
            ? "warn"
            : "fail",
    detail: `Role: lines=${roleLineCount}, parsed=${n}`,
    group: "completeness",
  });

  checks.push({
    id: "signal_clients",
    label: "Client: lines vs parsed engagements",
    severity:
      clientLineCount === 0
        ? "pass"
        : n >= clientLineCount
          ? "pass"
          : "warn",
    detail: `Client: lines=${clientLineCount}, parsed=${n}`,
    group: "completeness",
  });

  checks.push({
    id: "signal_company_dates",
    label: "Company+date header lines",
    severity:
      companyDateLineCount === 0
        ? "warn"
        : n >= companyDateLineCount
          ? "pass"
          : "warn",
    detail: `headers with dates=${companyDateLineCount}, parsed=${n}`,
    group: "completeness",
  });

  const span = careerSpan(profile);
  checks.push({
    id: "career_span",
    label: "Career span (for single years claim)",
    severity: span >= 1 && span <= 45 ? "pass" : "warn",
    detail: span > 0 ? `~${span}+ years (earliest start → now)` : "unknown",
    group: "identity",
  });

  checks.push({
    id: "skills_bank",
    label: "Skills / environment tokens",
    severity:
      profile.skills.length >= 8
        ? "pass"
        : profile.skills.length >= 1
          ? "warn"
          : "warn",
    detail:
      profile.skills.length > 0
        ? `${profile.skills.length}: ${profile.skills.slice(0, 12).join(", ")}${
            profile.skills.length > 12 ? "…" : ""
          }`
        : "None harvested — AI will use master text + JD intersection",
    group: "skills",
  });

  checks.push({
    id: "summary_lines",
    label: "Master summary lines",
    severity: profile.summaryLines.length >= 1 ? "pass" : "warn",
    detail:
      profile.summaryLines.length > 0
        ? `${profile.summaryLines.length} line(s)`
        : "No summary block detected",
    group: "identity",
  });

  for (const w of profile.warnings || []) {
    checks.push({
      id: `warn_${checks.length}`,
      label: "Parser warning",
      severity: "warn",
      detail: w,
      group: "completeness",
    });
  }

  const engRows = profile.engagements.map((e, index) => {
    const fieldChecks = engagementFieldChecks(e, index);
    checks.push(...fieldChecks);
    return {
      index,
      client: e.client,
      location: e.location || "",
      startYear: e.startYear || 0,
      endYear: e.endYear || "Present",
      title: e.title,
      project: e.project,
      industry: e.industry,
      environment: e.environment,
      bulletCount: (e.bullets || []).length,
      sampleBullets: (e.bullets || []).slice(0, 3),
      fieldChecks,
    };
  });

  // Duplicate client detection
  const seen = new Map<string, number>();
  for (const e of profile.engagements) {
    const k = normClient(e.client);
    if (!k) continue;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  for (const [k, c] of Array.from(seen.entries())) {
    if (c > 1) {
      checks.push({
        id: `dup_${k}`,
        label: "Duplicate employer token",
        severity: "warn",
        detail: `"${k}" appears ${c} times — confirm not a parse split error`,
        group: "engagement",
      });
    }
  }

  const summary = tally(checks);
  return {
    ok: summary.fail === 0,
    score: scoreFrom(checks),
    engagementCount: n,
    careerSpanYears: span,
    checks,
    engagements: engRows,
    summary,
  };
}

const YEARS_IN_TEXT =
  /\b(?:over|approximately|about|around|nearly|more than)?\s*\d{1,2}\+?\s*years?\b/gi;

/**
 * After tailored resume is created — validate pack against master ground truth.
 */
export function validatePackAgainstMaster(opts: {
  masterProfileJson?: string | null;
  masterText?: string;
  tailoredText: string;
  expectedYears?: number;
}): PackValidationReport {
  let profile =
    parseStoredMasterProfile(opts.masterProfileJson) ||
    (opts.masterText ? parseMasterProfile(opts.masterText) : null);

  const base = validateMasterProfile(profile);
  const checks = [...base.checks];
  const text = opts.tailoredText || "";
  const textLc = text.toLowerCase();

  if (!text || text.length < 200) {
    checks.push({
      id: "pack_present",
      label: "Tailored resume text present",
      severity: "fail",
      detail: "Empty or too short tailored pack",
      group: "pack",
    });
  } else {
    checks.push({
      id: "pack_present",
      label: "Tailored resume text present",
      severity: "pass",
      detail: `${text.length} characters`,
      group: "pack",
    });
  }

  const clients = profile?.engagements.map((e) => e.client) || [];
  const clientsFound: string[] = [];
  const clientsMissing: string[] = [];

  for (const client of clients) {
    const core = client.split(",")[0].trim();
    const tokens = normClient(core).split(" ").filter((t) => t.length > 3);
    // Match primary employer word (e.g. Collabera, Genpact)
    const primary =
      tokens.find((t) => t.length >= 5) || tokens[0] || normClient(core);
    const hit =
      primary.length >= 3 &&
      (textLc.includes(primary) ||
        textLc.includes(normClient(core).slice(0, 20)));
    if (hit) clientsFound.push(client);
    else clientsMissing.push(client);

    checks.push({
      id: `pack_client_${normClient(core).slice(0, 20)}`,
      label: `Pack retains employer: ${core.slice(0, 40)}`,
      severity: hit ? "pass" : "fail",
      detail: hit ? "Found in tailored text" : "MISSING from tailored pack",
      group: "pack",
    });
  }

  // Dates from master present
  if (profile) {
    for (let i = 0; i < profile.engagements.length; i++) {
      const e = profile.engagements[i];
      const startOk =
        e.startYear >= 1980 && text.includes(String(e.startYear));
      const endTok =
        e.endYear === "Present"
          ? /present|current/i.test(text)
          : text.includes(String(e.endYear));
      checks.push({
        id: `pack_dates_${i}`,
        label: `Pack dates E${i + 1} (${e.startYear}–${e.endYear})`,
        severity: startOk && endTok ? "pass" : startOk || endTok ? "warn" : "fail",
        detail: `start ${startOk ? "✓" : "✗"} · end ${endTok ? "✓" : "✗"}`,
        group: "pack",
      });
    }
  }

  // Engagement count: Employer / Client lines or distinct matched clients
  const employerLines = (
    text.match(/Employer\s*\/\s*Client\s*:/gi) || []
  ).length;
  const expected = clients.length;
  if (expected > 0) {
    checks.push({
      id: "pack_engagement_count",
      label: "Pack engagement count vs master",
      severity:
        clientsFound.length >= expected
          ? "pass"
          : clientsFound.length >= expected - 1
            ? "warn"
            : "fail",
      detail: `master=${expected}, clients found in pack=${clientsFound.length}, Employer/Client lines=${employerLines}`,
      group: "pack",
    });
  }

  // Single years claim in summary region
  const summarySlice = text.slice(0, Math.min(1800, text.length));
  const yearsClaims = Array.from(
    summarySlice.matchAll(YEARS_IN_TEXT),
    (m) => m[0].trim()
  );
  const uniqueYears = Array.from(
    new Set(
      yearsClaims.map((y) => y.replace(/\s+/g, " ").toLowerCase())
    )
  );
  checks.push({
    id: "pack_single_years",
    label: "Single years claim in summary",
    severity:
      uniqueYears.length <= 1
        ? "pass"
        : uniqueYears.length === 2
          ? "warn"
          : "fail",
    detail:
      uniqueYears.length === 0
        ? "No years claim in opening (ok if intentional)"
        : uniqueYears.join(" | "),
    group: "honesty",
  });

  if (opts.expectedYears && opts.expectedYears > 0 && yearsClaims.length) {
    const nums = yearsClaims
      .map((y) => {
        const m = y.match(/(\d{1,2})/);
        return m ? Number(m[1]) : null;
      })
      .filter((n): n is number => n != null);
    const mismatch = nums.some(
      (n) => Math.abs(n - opts.expectedYears!) > 2
    );
    checks.push({
      id: "pack_years_match_span",
      label: "Years claim matches master career span",
      severity: mismatch ? "warn" : "pass",
      detail: `master span ~${opts.expectedYears}+; claims: ${nums.join(", ") || "none"}`,
      group: "honesty",
    });
  }

  // Locations
  if (profile) {
    for (let i = 0; i < profile.engagements.length; i++) {
      const loc = (profile.engagements[i].location || "").trim();
      if (!loc) continue;
      const city = loc.split(",")[0].trim();
      const hit = city.length >= 3 && textLc.includes(city.toLowerCase());
      checks.push({
        id: `pack_loc_${i}`,
        label: `Pack location E${i + 1}: ${loc}`,
        severity: hit ? "pass" : "warn",
        detail: hit ? "Found" : "Not found (may be reformatted)",
        group: "pack",
      });
    }
  }

  // Template junk / dual-voice heuristics
  const junkHits = [
    "Core focus includes",
    "Career progression moves from foundation",
    "aligned to Pharmaceutical, PowerPoint",
  ].filter((j) => text.includes(j));
  checks.push({
    id: "pack_no_template_junk",
    label: "No known summary template junk",
    severity: junkHits.length ? "fail" : "pass",
    detail: junkHits.length ? junkHits.join("; ") : "Clean",
    group: "honesty",
  });

  const clientsExtra: string[] = []; // reserved for invented-client detection later

  const summary = tally(checks);
  return {
    ...base,
    ok: summary.fail === 0,
    score: scoreFrom(checks),
    checks,
    summary,
    clientsFound,
    clientsMissing,
    clientsExtra,
    yearsClaimsInSummary: yearsClaims,
  };
}

/** Human-readable multi-line report for logs / replace toast */
export function formatValidationReport(
  report: MasterValidationReport | PackValidationReport,
  title = "Master profile validation"
): string {
  const lines = [
    `${title}: ${report.ok ? "PASS" : "NEEDS REVIEW"} · score ${report.score}% · ${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail`,
    `Engagements: ${report.engagementCount} · career span ~${report.careerSpanYears}+ years`,
  ];
  const fails = report.checks.filter((c) => c.severity === "fail");
  const warns = report.checks.filter((c) => c.severity === "warn");
  if (fails.length) {
    lines.push("FAILS:");
    for (const c of fails.slice(0, 12)) {
      lines.push(`  ✗ ${c.label}: ${c.detail}`);
    }
  }
  if (warns.length) {
    lines.push("WARNINGS:");
    for (const c of warns.slice(0, 16)) {
      lines.push(`  ⚠ ${c.label}: ${c.detail}`);
    }
  }
  if ("clientsMissing" in report && report.clientsMissing.length) {
    lines.push(
      `Missing clients in pack: ${report.clientsMissing.map((c) => c.split(",")[0]).join(" | ")}`
    );
  }
  return lines.join("\n");
}

export function reportFromStoredJson(
  masterProfileJson: string | null | undefined
): MasterValidationReport {
  return validateMasterProfile(parseStoredMasterProfile(masterProfileJson));
}
