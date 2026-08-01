/**
 * Resume engine policy — all tunable content lives here as defaults that the
 * admin console can override via SystemSetting. Runtime code must not invent
 * domain packs, phrase lists, or caps outside this policy object.
 */

export type DomainRule = {
  /** Stable id used as domain hint (e.g. ewm, rar, generic) */
  id: string;
  /** Case-insensitive regex sources; first matching rule wins (order matters) */
  patterns: string[];
};

export type OffDomainRule = {
  /** Domain ids this ban applies to */
  whenDomain: string[];
  /** Regex source: if skill/title/bullet matches, treat as off-domain */
  banPattern: string;
};

export type ResumeEnginePolicy = {
  /** How many leading projects use the exact JD title */
  recentTitleCount: number;
  bullets: { recent: number; mid: number; early: number };
  skillCaps: { recent: number; mid: number; early: number };
  minKeywordCoverage: number;
  minAtsScore: number;
  /** Inject "JD keywords:" line into skills when coverage is weak */
  specialtyInject: boolean;
  /** Allow soft emergency bullets when AI + master are sparse */
  emergencyFill: boolean;
  /** Ordered domain detection rules (admin-maintained) */
  domainRules: DomainRule[];
  /** Cross-domain bans (admin-maintained) */
  offDomainRules: OffDomainRule[];
  /**
   * Progressive older titles. Placeholders: {core} {jobTitle}
   * Empty list → only use AI/master titles (no ladder).
   */
  progressiveTitleTemplates: string[];
  /**
   * Soft fill templates. Placeholders:
   * {role} {client} {skills} {s0} {s1} {s2}
   */
  emergencyBullets: {
    recent: string[];
    mid: string[];
    early: string[];
  };
  /**
   * Regex sources for multi-token phrases to extract only when present in JD.
   * Empty → SAP token extraction + keyword extract only.
   */
  criticalPhrasePatterns: string[];
  /** Optional default methodology lines when AI returns none */
  methodologyDefaults: string[];
  /** Optional default education lines when master/AI empty */
  educationDefaults: string[];
};

/** Factory defaults — also shown in admin console until overridden. */
export const DEFAULT_RESUME_ENGINE_POLICY: ResumeEnginePolicy = {
  recentTitleCount: 2,
  /** Target 8–10 bullets per client/project for client-submittable density */
  bullets: { recent: 10, mid: 9, early: 8 },
  skillCaps: { recent: 8, mid: 5, early: 3 },
  minKeywordCoverage: 0.9,
  minAtsScore: 95,
  specialtyInject: true,
  emergencyFill: true,
  domainRules: [
    {
      id: "clinical-dm",
      patterns: [
        "clinical\\s+data\\s+manager",
        "clinical\\s+data\\s+management",
        "\\bedc\\b",
        "data\\s+management\\s+plan",
        "\\bcdisc\\b",
        "\\bcdash\\b",
        "\\bsdtm\\b",
        "crf\\s+completion",
        "query\\s+generation",
      ],
    },
    {
      id: "rar",
      patterns: [
        "\\brar\\b",
        "revenue\\s+accounting",
        "ifrs\\s*15",
        "asc\\s*606",
        "fi-?la",
        "lease\\s+accounting",
        "sap\\s+leasing",
      ],
    },
    {
      id: "attp",
      patterns: [
        "attp",
        "track\\s*(&|and)\\s*trace",
        "serialization",
        "epcis",
        "dscsa",
        "gs1",
        // note: bare "pharma" alone is too broad — pair with serialization stack
        "pharma.*serial",
        "life\\s*science.*trace",
      ],
    },
    {
      id: "ewm",
      patterns: [
        "\\bewm\\b",
        "extended\\s+warehouse",
        "warehouse\\s+management",
        "\\bwm\\b",
      ],
    },
    {
      id: "mm",
      patterns: [
        "\\bmm\\b",
        "materials management",
        "procure",
        "p2p",
        "purchasing",
      ],
    },
    {
      id: "sd",
      patterns: [
        "\\bsd\\b",
        "sales\\s+and\\s+distribution",
        "order.to.cash",
        "\\botc\\b",
        "order management",
      ],
    },
    {
      id: "fico",
      patterns: [
        "fico",
        "fi\\/co",
        "asset accounting",
        "general ledger",
        "controlling",
        "cost center",
        "\\bfinance\\b",
      ],
    },
    {
      id: "basis",
      patterns: ["basis", "security", "authorization", "system admin"],
    },
    {
      id: "abap",
      patterns: [
        "abap",
        "\\brap\\b",
        "cds",
        "odata",
        "btp.*dev",
        "badi",
        "enhancement",
        "developer",
      ],
    },
  ],
  offDomainRules: [
    {
      whenDomain: ["ewm", "mm"],
      banPattern:
        "\\b(fico|fi\\/co|material ledger|central finance|cfin|new gl|co-pa|treasury|lockbox|asset accounting|general ledger|s\\/4hana finance|finance lead|finance analyst)\\b",
    },
    {
      whenDomain: ["rar", "fico"],
      banPattern:
        "\\b(ewm|putaway|picking|wave management|cross-docking|rf framework)\\b",
    },
  ],
  progressiveTitleTemplates: [
    "{core}",
    "{coreAnalyst}",
    "Associate {core}",
  ],
  emergencyBullets: {
    // Enough soft-fill lines to top each engagement to 8–10 when AI/master short
    recent: [
      "Delivered {role}-aligned work for {client}, covering {skills} with design, test evidence, and stakeholder updates.",
      "Partnered with business and technical owners on process design, integration touchpoints, and release readiness at {client}.",
      "Built unit and SIT/UAT evidence packs for {s0}-related scenarios on {client}.",
      "Drove requirements workshops and solution walkthroughs for {role} scope with {client} stakeholders.",
      "Maintained issue logs, RACI clarity, and status cadence across {client} workstreams involving {s1}.",
      "Validated end-to-end scenarios spanning {s0} and {s1}, capturing defects and retest evidence for {client}.",
      "Coordinated with cross-functional teams on data readiness, cutover checklists, and hypercare for {client}.",
      "Produced functional specs, configuration notes, and handoff packs aligned to {role} delivery on {client}.",
      "Led triage of priority defects during SIT/UAT with clear ownership and closure criteria at {client}.",
      "Supported go-live readiness reviews and post-go-live stabilization for {client} on {skills}.",
    ],
    mid: [
      "Supported {role}-related delivery tasks for {client}, including documentation and test evidence around {s0}.",
      "Assisted seniors with workshops, unit tests, and defect notes for {client}.",
      "Contributed to configuration trackers and handoff materials under guidance on {client}.",
      "Executed assigned test scripts for {s0}-related scenarios and logged results for {client}.",
      "Helped refine process maps and functional notes supporting {role} outcomes at {client}.",
      "Participated in defect triage calls and retested fixes for {client} releases.",
      "Prepared status inputs and evidence packs used in {client} steering updates.",
      "Collaborated with peers on integration touchpoints involving {s1} for {client}.",
      "Documented as-built configuration and open questions for {client} knowledge transfer.",
    ],
    early: [
      "Assisted seniors with documentation, unit tests, and evidence capture on {client}.",
      "Built foundational delivery discipline (notes, retests, status inputs) under mentorship on {client}.",
      "Supported test data setup and script execution for {s0} scenarios at {client}.",
      "Logged defects with clear repro steps and followed retest instructions for {client}.",
      "Maintained configuration and issue trackers used by the {client} delivery team.",
      "Shadowed design workshops and converted notes into actionable follow-ups for {client}.",
      "Helped prepare training and handoff materials under senior review for {client}.",
      "Contributed to day-to-day coordination across {role}-adjacent tasks on {client}.",
    ],
  },
  criticalPhrasePatterns: [
    "\\bIFRS\\s*15\\b",
    "\\bASC\\s*606\\b",
    "\\bBRF\\+?\\b",
    "\\bFI-?LA\\b",
    "\\bEPCIS\\b",
    "\\bDSCSA\\b",
    "\\bGS1\\b",
    "\\bS\\/4HANA\\b",
    "\\bOData\\b",
    "\\bCDS(?:\\s+Views?)?\\b",
    "\\bRAP\\b",
    "\\bABAP\\b",
    "\\bFiori\\b",
    "\\bIDoc\\b",
    "\\bBAPI\\b",
    "\\bBADI\\b",
    "\\bRevenue Accounting(?: and Reporting)?\\b",
    "\\bExtended Warehouse Management\\b",
    "\\bTrack\\s*(?:&|and)\\s*Trace\\b",
    "\\bProcure-to-Pay\\b",
    "\\bOrder-to-Cash\\b",
    "\\bMaterials Management\\b",
    "\\bWarehouse Management\\b",
    "\\bGeneral Ledger\\b",
    "\\bAsset Accounting\\b",
    "\\bPerformance Obligations?\\b",
    "\\bSerialization\\b",
  ],
  methodologyDefaults: [
    "Spec → build → test → release → hypercare → AMS KT.",
    "Prefer standard platform capability; document gaps with impact and approval path.",
  ],
  /** @deprecated Not used by pack assembly — education is master-only. Kept for admin JSON compat. */
  educationDefaults: [
    "Bachelor's degree or equivalent professional experience.",
  ],
};

export const RESUME_POLICY_SETTING_KEY = "resume_engine_policy";

export function parseResumeEnginePolicy(raw: string | null | undefined): ResumeEnginePolicy {
  if (!raw || !raw.trim()) return clonePolicy(DEFAULT_RESUME_ENGINE_POLICY);
  try {
    const parsed = JSON.parse(raw) as Partial<ResumeEnginePolicy>;
    return mergePolicy(DEFAULT_RESUME_ENGINE_POLICY, parsed);
  } catch {
    return clonePolicy(DEFAULT_RESUME_ENGINE_POLICY);
  }
}

export function serializeResumeEnginePolicy(p: ResumeEnginePolicy): string {
  return JSON.stringify(p, null, 2);
}

function clonePolicy(p: ResumeEnginePolicy): ResumeEnginePolicy {
  return JSON.parse(JSON.stringify(p)) as ResumeEnginePolicy;
}

function mergePolicy(
  base: ResumeEnginePolicy,
  patch: Partial<ResumeEnginePolicy>
): ResumeEnginePolicy {
  const out = clonePolicy(base);
  if (typeof patch.recentTitleCount === "number" && patch.recentTitleCount >= 1) {
    out.recentTitleCount = Math.min(6, Math.floor(patch.recentTitleCount));
  }
  if (patch.bullets) {
    out.bullets = {
      recent: num(patch.bullets.recent, out.bullets.recent, 8, 24),
      mid: num(patch.bullets.mid, out.bullets.mid, 8, 20),
      early: num(patch.bullets.early, out.bullets.early, 8, 16),
    };
  }
  if (patch.skillCaps) {
    out.skillCaps = {
      recent: num(patch.skillCaps.recent, out.skillCaps.recent, 1, 20),
      mid: num(patch.skillCaps.mid, out.skillCaps.mid, 1, 16),
      early: num(patch.skillCaps.early, out.skillCaps.early, 1, 12),
    };
  }
  if (typeof patch.minKeywordCoverage === "number") {
    out.minKeywordCoverage = Math.min(1, Math.max(0, patch.minKeywordCoverage));
  }
  if (typeof patch.minAtsScore === "number") {
    out.minAtsScore = Math.min(100, Math.max(0, Math.floor(patch.minAtsScore)));
  }
  if (typeof patch.specialtyInject === "boolean") {
    out.specialtyInject = patch.specialtyInject;
  }
  if (typeof patch.emergencyFill === "boolean") {
    out.emergencyFill = patch.emergencyFill;
  }
  if (Array.isArray(patch.domainRules) && patch.domainRules.length) {
    out.domainRules = patch.domainRules
      .filter((r) => r && typeof r.id === "string" && Array.isArray(r.patterns))
      .map((r) => ({
        id: r.id.trim().toLowerCase() || "generic",
        patterns: r.patterns.map(String).filter(Boolean),
      }));
  }
  if (Array.isArray(patch.offDomainRules)) {
    out.offDomainRules = patch.offDomainRules
      .filter((r) => r && Array.isArray(r.whenDomain) && r.banPattern)
      .map((r) => ({
        whenDomain: r.whenDomain.map((d) => String(d).toLowerCase()),
        banPattern: String(r.banPattern),
      }));
  }
  if (Array.isArray(patch.progressiveTitleTemplates)) {
    out.progressiveTitleTemplates = patch.progressiveTitleTemplates
      .map(String)
      .filter(Boolean)
      .slice(0, 12);
  }
  if (patch.emergencyBullets) {
    out.emergencyBullets = {
      recent: arr(patch.emergencyBullets.recent, out.emergencyBullets.recent),
      mid: arr(patch.emergencyBullets.mid, out.emergencyBullets.mid),
      early: arr(patch.emergencyBullets.early, out.emergencyBullets.early),
    };
  }
  if (Array.isArray(patch.criticalPhrasePatterns)) {
    out.criticalPhrasePatterns = patch.criticalPhrasePatterns
      .map(String)
      .filter(Boolean)
      .slice(0, 80);
  }
  if (Array.isArray(patch.methodologyDefaults)) {
    out.methodologyDefaults = patch.methodologyDefaults.map(String).filter(Boolean);
  }
  if (Array.isArray(patch.educationDefaults)) {
    out.educationDefaults = patch.educationDefaults.map(String).filter(Boolean);
  }
  return out;
}

function num(v: unknown, fb: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function arr(v: unknown, fb: string[]): string[] {
  if (!Array.isArray(v)) return fb;
  const out = v.map(String).filter(Boolean);
  return out.length ? out : fb;
}

/** Safe regex from admin-provided source */
export function tryRegExp(source: string, flags = "i"): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

export function detectDomainWithPolicy(
  jd: string,
  title: string,
  policy: ResumeEnginePolicy
): string {
  const t = `${title} ${jd}`.toLowerCase();
  for (const rule of policy.domainRules) {
    for (const p of rule.patterns) {
      const re = tryRegExp(p, "i");
      if (re && re.test(t)) return rule.id || "generic";
    }
  }
  return "generic";
}

export function isOffDomainText(
  text: string,
  domain: string,
  policy: ResumeEnginePolicy
): boolean {
  const t = (text || "").toLowerCase();
  if (!t) return false;
  for (const rule of policy.offDomainRules) {
    if (!rule.whenDomain.map((d) => d.toLowerCase()).includes(domain.toLowerCase())) {
      continue;
    }
    const re = tryRegExp(rule.banPattern, "i");
    if (re && re.test(t)) return true;
  }
  return false;
}

export function progressiveTitlesFromPolicy(
  jobTitle: string,
  policy: ResumeEnginePolicy,
  count = 8
): string[] {
  const jt = (jobTitle || "Consultant").replace(/\s+/g, " ").trim().slice(0, 100);
  const core = jt
    .replace(/^(senior|sr\.?|lead|principal|staff|chief|head of)\s+/i, "")
    .replace(/\s+(senior|sr\.?|lead|principal)\s+/i, " ")
    .replace(/\s+/g, " ")
    .trim() || jt;
  const coreAnalyst = core
    .replace(/\bconsultant\b/i, "Analyst")
    .replace(/\bdeveloper\b/i, "Engineer");

  const templates =
    policy.progressiveTitleTemplates.length > 0
      ? policy.progressiveTitleTemplates
      : ["{core}", "Associate {core}"];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const tmpl of templates) {
    const clean = tmpl
      .replace(/\{jobTitle\}/gi, jt)
      .replace(/\{coreAnalyst\}/gi, coreAnalyst)
      .replace(/\{core\}/gi, core)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    if (!clean || clean.toLowerCase() === jt.toLowerCase()) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= count) break;
  }
  if (!out.length) out.push(`Associate ${core}`.slice(0, 120));
  while (out.length < count) out.push(out[out.length - 1]);
  return out.slice(0, count);
}

export function applyEmergencyTemplate(
  tmpl: string,
  vars: {
    role: string;
    client: string;
    skills: string;
    s0: string;
    s1: string;
    s2: string;
  }
): string {
  return tmpl
    .replace(/\{role\}/gi, vars.role)
    .replace(/\{client\}/gi, vars.client)
    .replace(/\{skills\}/gi, vars.skills)
    .replace(/\{s0\}/gi, vars.s0)
    .replace(/\{s1\}/gi, vars.s1)
    .replace(/\{s2\}/gi, vars.s2)
    .replace(/\s+/g, " ")
    .trim();
}
