/**
 * Job description parsing for resume tailoring.
 * Strips job-board noise so we never put "REMOTE", "FOSTER CITY", "Interview Mode"
 * into Technical Skills.
 */

import {
  DEFAULT_RESUME_ENGINE_POLICY,
  detectDomainWithPolicy,
  progressiveTitlesFromPolicy,
  type ResumeEnginePolicy,
} from "./resume-engine-policy";

const STOP = new Set(
  `the and for with that this from have will your our are you all any can not but into a an of to in on as by or be is was were been being at it its we they them their there here who what when where which while than then also only such both each few more most other some such no nor so too very just about above after again against all am between both during each few further once over own same than too under until up very`.split(
    " "
  )
);

/** Words that appear in vendor emails / job posts but are NOT skills */
const JD_NOISE = new Set(
  [
    "location",
    "locations",
    "remote",
    "onsite",
    "hybrid",
    "preferred",
    "required",
    "requirement",
    "requirements",
    "someone",
    "occasional",
    "travel",
    "traveling",
    "duration",
    "long",
    "term",
    "contract",
    "contracts",
    "interview",
    "interviews",
    "mode",
    "modes",
    "city",
    "state",
    "country",
    "usa",
    "united",
    "states",
    "timezone",
    "est",
    "pst",
    "cst",
    "mst",
    "job",
    "title",
    "role",
    "position",
    "opening",
    "openings",
    "client",
    "vendor",
    "recruiter",
    "looking",
    "seek",
    "seeking",
    "need",
    "needs",
    "must",
    "should",
    "please",
    "asap",
    "immediate",
    "joining",
    "join",
    "salary",
    "rate",
    "hourly",
    "bill",
    "billing",
    "c2c",
    "w2",
    "1099",
    "ctc",
    "benefits",
    "sponsorship",
    "visa",
    "h1b",
    "gc",
    "citizen",
    "local",
    "only",
    "years",
    "year",
    "experience",
    "experienced",
    "strong",
    "good",
    "excellent",
    "ability",
    "able",
    "work",
    "working",
    "team",
    "teams",
    "candidate",
    "candidates",
    "consultant",
    "consultants",
    "developer",
    "engineers",
    "engineer",
    "manager",
    "lead",
    "senior",
    "junior",
    "associate",
    "description",
    "responsibilities",
    "responsibility",
    "qualifications",
    "qualification",
    "nice",
    "plus",
    "etc",
    "including",
    "using",
    "use",
    "used",
    "via",
    "per",
    "day",
    "week",
    "month",
    "months",
    "full",
    "part",
    "time",
    "shift",
    "hours",
    "monday",
    "friday",
    "email",
    "phone",
    "call",
    "note",
    "notes",
    "thanks",
    "regards",
    "hello",
    "hi",
    "dear",
    "rate",
    "rates",
    "bill",
    "billing",
    "hourly",
    "salary",
    "budget",
    "question",
    "questions",
    "who",
    "what",
    "why",
    "how",
    "when",
    "where",
    "please",
    "share",
    "resume",
    "cv",
    "profile",
    "submission",
    "submissions",
    "interview",
    "interviews",
    "screening",
    "availability",
    "available",
    "start",
    "asap",
    "immediate",
    "joining",
    "notice",
    "period",
    "vendor",
    "end",
    "client",
    "impl",
    "implementation",
    "foster", // city name noise when paired with location blocks
    "california",
    "texas",
    "new",
    "york",
    "jersey",
    "chicago",
    "dallas",
    "atlanta",
    "boston",
    "seattle",
    "austin",
    "denver",
    "phoenix",
    "florida",
    "carolina",
    "virginia",
    "ohio",
    "michigan",
    "illinois",
    "pennsylvania",
    "georgia",
    "washington",
    "massachusetts",
    "colorado",
    "arizona",
    "india",
    "offshore",
    "onsite",
    "techno", // alone noise; "techno-functional" handled as phrase
    "functional", // alone too generic unless part of phrase
  ].map((s) => s.toLowerCase())
);

/** High-value multi-word / module phrases to pull from JD */
const PHRASE_PATTERNS: RegExp[] = [
  /SAP\s+ATTP/gi,
  /SAP\s+AATP/gi,
  /Advanced\s+Track\s+(?:and|&)\s+Trace/gi,
  /Track\s+(?:and|&)\s+Trace/gi,
  /serialization/gi,
  /seriali[sz]ation/gi,
  /GS1/gi,
  /EPCIS/gi,
  /DSCSA/gi,
  /EU\s+FMD/gi,
  /SAP\s+S\/4HANA/gi,
  /S\/4HANA/gi,
  /SAP\s+HANA/gi,
  /SAP\s+FICO/gi,
  /SAP\s+FI\/CO/gi,
  /SAP\s+MM/gi,
  /SAP\s+SD/gi,
  /SAP\s+PP/gi,
  /SAP\s+WM/gi,
  /SAP\s+EWM/gi,
  /SAP\s+QM/gi,
  /SAP\s+PM/gi,
  /SAP\s+BASIS/gi,
  /SAP\s+ABAP/gi,
  /SAP\s+RAR/gi,
  /Revenue\s+Accounting(?:\s+and\s+Reporting)?/gi,
  /Revenue\s+Accounting\s*&\s*Reporting/gi,
  /\bRAR\b/g,
  /IFRS\s*15/gi,
  /ASC\s*606/gi,
  /FI-?LA/gi,
  /Contract\s+Liability/gi,
  /Performance\s+Obligation/gi,
  /SAP\s+Leasing/gi,
  /Lease\s+Accounting/gi,
  /SAP\s+BW/gi,
  /SAP\s+BTP/gi,
  /SAP\s+CPI/gi,
  /SAP\s+PI\/PO/gi,
  /SuccessFactors/gi,
  /Ariba/gi,
  /Order[- ]to[- ]Cash/gi,
  /Procure[- ]to[- ]Pay/gi,
  /Record[- ]to[- ]Report/gi,
  /Asset\s+Accounting/gi,
  /General\s+Ledger/gi,
  /Accounts\s+Payable/gi,
  /Accounts\s+Receivable/gi,
  /SAP\s+Activate/gi,
  /Fiori/gi,
  /OData/gi,
  /CDS\s+Views?/gi,
  /RAP\b/gi,
  /IDoc/gi,
  /BAPI/gi,
  /LSMW/gi,
  /RFC/gi,
  /Batch\s+Management/gi,
  /Handling\s+Unit/gi,
  /Warehouse\s+Management/gi,
  /Event\s+Management/gi,
  /Supply\s+Chain/gi,
  /Pharma(?:ceutical)?/gi,
  /Life\s+Sciences?/gi,
  /Techno[- ]Functional/gi,
];

const SKILLISH =
  /^(SAP|ATTP|AATP|FICO|FI|CO|MM|SD|PP|WM|EWM|QM|PM|HR|HCM|ABAP|BASIS|BW|BTP|CPI|PI|PO|HANA|S\/4|OTC|P2P|R2R|GS1|EPCIS|DSCSA|Fiori|OData|IDoc|BAPI|LSMW|RFC|EDI|XML|JSON|SQL|Oracle|AWS|Azure)$/i;

export function extractJobTitle(jd: string): string {
  const lines = jd
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 12)) {
    const m = line.match(
      /^(?:job\s*)?(?:title|role|position)\s*[:\-]\s*(.+)$/i
    );
    if (m) return cleanTitle(m[1]);
  }

  // First-line / early-line job titles (non-SAP OK): "Senior Clinical Data Manager"
  const titleWord =
    /\b(manager|director|consultant|analyst|engineer|developer|architect|lead|specialist|officer|scientist|administrator|coordinator)\b/i;
  for (const line of lines.slice(0, 6)) {
    if (line.length < 8 || line.length > 100) continue;
    if (/^(rate|location|remote|hybrid|onsite|duration|we are|seeking|about|key responsibilities|required|preferred)\b/i.test(line))
      continue;
    if (/\$|\/\s*hr|c2c|w2|contract length/i.test(line)) continue;
    if (titleWord.test(line) || /^[A-Z][A-Za-z0-9/.\- &+]{6,90}$/.test(line)) {
      return cleanTitle(line);
    }
  }

  // Prefer SAP … title line when present
  for (const line of lines.slice(0, 15)) {
    if (/SAP\s+/i.test(line) && line.length <= 120 && !/location|duration|interview/i.test(line)) {
      return cleanTitle(line.replace(/^(job\s*title|role)\s*[:\-]\s*/i, ""));
    }
  }

  const sap = jd.match(
    /SAP\s+[A-Za-z0-9/.\-]+(?:\s+[A-Za-z0-9/.\-&]+){0,6}/i
  );
  if (sap?.[0]) return cleanTitle(sap[0]);
  // Last resort: first short line of JD, not a generic SAP invent
  if (lines[0] && lines[0].length >= 6 && lines[0].length <= 100) {
    return cleanTitle(lines[0]);
  }
  return "Consultant";
}

function cleanTitle(t: string) {
  return t
    .replace(/\s+/g, " ")
    .replace(/[|•].*$/, "")
    .trim()
    .slice(0, 120);
}

export function extractJdKeywords(jd: string, limit = 35): string[] {
  const phrases: string[] = [];
  for (const re of PHRASE_PATTERNS) {
    const copy = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = copy.exec(jd)) !== null) {
      const p = m[0].replace(/\s+/g, " ").trim();
      if (p.length > 1) phrases.push(normalizeSkill(p));
    }
  }

  // Word tokens — heavily filtered
  const words = jd
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\w+/.\-#\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2)
    .filter((w) => !STOP.has(w.toLowerCase()))
    .filter((w) => !JD_NOISE.has(w.toLowerCase()))
    .filter((w) => !/^\d+(\.\d+)?$/.test(w))
    .filter((w) => SKILLISH.test(w) || w.length >= 4);

  const out: string[] = [];
  const seen = new Set<string>();

  function push(s: string) {
    if (!isValidSkillToken(s)) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalizeSkill(s));
  }

  for (const p of phrases) push(p);
  for (const w of words) {
    if (out.length >= limit) break;
    // Prefer skill-like tokens — never bare "80/hr" style paths
    if (w.includes("/") && !/^(S\/4|FI\/CO|PI\/PO|GS1)/i.test(w) && /\d/.test(w)) continue;
    if (SKILLISH.test(w) || /SAP|ATTP|Fiori|HANA|GS1|EPCIS|DSCSA|ABAP|BTP|MDG|RAR/i.test(w)) {
      push(w);
    }
  }
  for (const w of words) {
    if (out.length >= limit) break;
    if (w.includes("/") && /\d/.test(w)) continue;
    if (/^[A-Z]{2,}$/.test(w) || /[A-Z][a-z]+[A-Z]/.test(w)) {
      push(w);
    }
  }

  return sanitizeSkillList(out, limit);
}

function normalizeSkill(s: string) {
  return s
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

/** Reject rate / meta / broken tokens that must never appear on a resume */
export function isValidSkillToken(raw: string): boolean {
  const s = normalizeSkill(raw);
  if (!s || s.length < 2) return false;
  const lower = s.toLowerCase();

  // Rates & compensation
  if (/\$/.test(s)) return false;
  if (/\d+\s*\/\s*(hr|hour|hrs|day|mo|month|yr|year)\b/i.test(s)) return false;
  if (/\/\s*hr\b/i.test(s) || /\bper\s*hour\b/i.test(s)) return false;
  if (/^\d+\s*\/\s*hr/i.test(s) || /^80\s*\/\s*hr/i.test(s)) return false;
  if (/^\d+(\.\d+)?$/.test(s)) return false;

  // Meta / staffing labels
  if (
    /^(jd|job|role|title|position|match|keyword|keywords|coverage|primary|secondary|extended|domain|tenure|rate|rates|bill|c2c|w2|ctc|salary|budget|remote|hybrid|onsite|offshore|onshore|interview|available|availability|asap)$/i.test(
      s
    )
  )
    return false;
  if (/\b(jd|job description)\b/i.test(s) && s.length < 20) return false;

  // Broken SAP fragments from slash-splitting S/4HANA etc.
  if (/^sap\s*s$/i.test(s)) return false;
  if (/^s\/?4?$/i.test(s)) return false;
  if (/^sap\s*certified/i.test(s) && s.length < 18) return false;
  if (/^[–—\-]+$/.test(s)) return false;
  if (/certified\s*[–—\-]\s*s$/i.test(s)) return false;

  // Generic noise leftovers
  if (/^(close|open|new|end|impl|client|vendor|logistics|finance)$/i.test(s)) return false;
  if (JD_NOISE.has(lower) || STOP.has(lower)) return false;

  return true;
}

/** Normalize + dedupe skill list for resume display */
export function sanitizeSkillList(skills: string[], limit = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of skills) {
    let s = normalizeSkill(raw);
    // Prefer canonical S/4HANA when fragments appear
    if (/^s\/4/i.test(s) && !/hana/i.test(s)) s = "S/4HANA";
    if (/^sap\s*s\/4/i.test(s)) s = "SAP S/4HANA";
    if (!isValidSkillToken(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    // Drop if already covered by longer phrase
    let covered = false;
    seen.forEach((k) => {
      if (k.includes(key) && k !== key) covered = true;
    });
    if (covered) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Domain id string — rules come from admin Resume Engine Policy */
export type DomainHint = string;

/**
 * Detect domain using admin policy rules (System Settings → Resume engine policy).
 * Pass policy from getResumeEnginePolicy() in request path; falls back to factory defaults
 * only when policy is omitted (legacy callers).
 */
export function detectDomain(
  jd: string,
  title: string,
  policy: ResumeEnginePolicy = DEFAULT_RESUME_ENGINE_POLICY
): DomainHint {
  return detectDomainWithPolicy(jd, title, policy);
}

/**
 * Skills bank derived ONLY from the job description (+ optional master).
 * Never invents domain canned lists (EWM pack, FICO pack, etc.) irrespective of JD.
 */
export function skillsFromJdAndMaster(
  jd: string,
  master = "",
  limit = 40
): string[] {
  return skillsHonestFromSources(jd, master, limit).all;
}

export type HonestSkillBank = {
  /** JD skills that also appear in master text (safe to claim ownership) */
  grounded: string[];
  /** JD-only keywords (ATS page-1 only — not forced onto early project modules) */
  jdOnly: string[];
  /** master-extracted skills not necessarily on JD */
  masterOnly: string[];
  /** grounded first, then masterOnly, then light jdOnly */
  all: string[];
};

/**
 * Honest skill split: prefer intersection of JD × master before JD-only stuffing.
 */
export function skillsHonestFromSources(
  jd: string,
  master = "",
  limit = 40
): HonestSkillBank {
  const fromJd = extractJdKeywords(jd || "", Math.min(45, limit + 10));
  const sapHits = (jd || "").match(
    /SAP\s+[A-Za-z0-9/.\-]{2,28}(?:\s+[A-Za-z0-9/.\-+]{2,24}){0,4}/gi
  ) || [];
  const titleTokens = (extractJobTitle(jd || "") || "")
    .split(/[\s,/|–—\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && t.length < 40)
    .filter(
      (t) =>
        !/^(senior|junior|lead|principal|consultant|analyst|developer|engineer|the|and|for)$/i.test(
          t
        )
    );

  const masterSkillsRaw: string[] = [];
  if (master) {
    const skillLine = master
      .split(/\r?\n/)
      .find((l) => /skills|technical|competenc/i.test(l) && l.length < 500);
    const blob = skillLine || "";
    for (const part of blob.split(/[,|·•;]/)) {
      const s = part.replace(/technical skills[:\s]*/i, "").trim();
      if (s.length > 1 && s.length < 50) masterSkillsRaw.push(s);
    }
  }

  const jdBank = sanitizeSkillList(
    [...sapHits.map((s) => s.trim()), ...fromJd, ...titleTokens],
    limit
  );
  const masterBank = sanitizeSkillList(masterSkillsRaw, limit);
  const masterLc = (master || "").toLowerCase();

  const grounded: string[] = [];
  const jdOnly: string[] = [];
  for (const s of jdBank) {
    const token = s.toLowerCase();
    const inMasterText =
      masterLc.includes(token) ||
      (token.length > 4 && masterLc.includes(token.slice(0, Math.min(12, token.length))));
    const inMasterSkills = masterBank.some(
      (m) =>
        m.toLowerCase() === token ||
        m.toLowerCase().includes(token) ||
        token.includes(m.toLowerCase())
    );
    if (inMasterText || inMasterSkills) grounded.push(s);
    else jdOnly.push(s);
  }

  const masterOnly = masterBank.filter(
    (m) => !grounded.some((g) => g.toLowerCase() === m.toLowerCase())
  );

  const all = sanitizeSkillList([...grounded, ...masterOnly, ...jdOnly], limit);
  return {
    grounded: grounded.slice(0, limit),
    jdOnly: jdOnly.slice(0, limit),
    masterOnly: masterOnly.slice(0, limit),
    all,
  };
}

/**
 * Years of experience from master text or career span — never invent "12".
 * Returns 0 when unknown (callers must not print fake years).
 */
export function yearsFromMasterAndProjects(
  master: string,
  projectStartYears: number[] = []
): number {
  const starts = projectStartYears.filter((y) => y >= 1980 && y <= 2100);
  if (starts.length) {
    const span = new Date().getFullYear() - Math.min(...starts);
    if (span >= 1 && span <= 45) return span;
  }
  const m = (master || "").match(/(\d{1,2})\+?\s*years?/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 45) return n;
  }
  return 0;
}

/**
 * Progressive older-role titles from admin policy templates ({core}, {jobTitle}, …).
 */
export function progressiveTitlesFromJobTitle(
  jobTitle: string,
  count = 8,
  policy: ResumeEnginePolicy = DEFAULT_RESUME_ENGINE_POLICY
): string[] {
  return progressiveTitlesFromPolicy(jobTitle, policy, count);
}

export function skillFingerprint(jd: string, jobTitle: string): string {
  const kws = extractJdKeywords(jd, 20).map((k) => k.toLowerCase()).sort();
  const title = jobTitle.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const domain = detectDomain(jd, jobTitle);
  const core = kws
    .filter((k) =>
      /attp|track|trace|serial|fico|s\/4|hana|mm|sd|pp|abap|bw|basis|ewm|gs1|epcis|dscsa|otc|p2p|integration/i.test(
        k
      )
    )
    .slice(0, 8);
  const pack = core.length ? core : [domain, ...kws.slice(0, 6)];
  return `${title}::${pack.join("|")}`;
}
