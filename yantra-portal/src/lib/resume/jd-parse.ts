/**
 * Job description parsing for resume tailoring.
 * Strips job-board noise so we never put "REMOTE", "FOSTER CITY", "Interview Mode"
 * into Technical Skills.
 */

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

  // Prefer SAP … title line
  for (const line of lines.slice(0, 15)) {
    if (/SAP\s+/i.test(line) && line.length <= 120 && !/location|duration|interview/i.test(line)) {
      return cleanTitle(line.replace(/^(job\s*title|role)\s*[:\-]\s*/i, ""));
    }
  }

  const sap = jd.match(
    /SAP\s+[A-Za-z0-9/.\-]+(?:\s+[A-Za-z0-9/.\-&]+){0,6}/i
  );
  return cleanTitle(sap?.[0] || "SAP Consultant");
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
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    if (JD_NOISE.has(key)) return;
    if (STOP.has(key)) return;
    seen.add(key);
    out.push(s);
  }

  for (const p of phrases) push(p);
  for (const w of words) {
    if (out.length >= limit) break;
    // Prefer skill-like tokens
    if (SKILLISH.test(w) || /SAP|ATTP|Fiori|HANA|GS1|EPCIS|DSCSA|ABAP|BTP/i.test(w)) {
      push(w);
    }
  }
  // Fill remaining with non-noise words that look technical
  for (const w of words) {
    if (out.length >= limit) break;
    if (/^[A-Z]{2,}$/.test(w) || /[A-Z][a-z]+[A-Z]/.test(w) || w.includes("/")) {
      push(w);
    }
  }

  return out.slice(0, limit);
}

function normalizeSkill(s: string) {
  return s
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

export type DomainHint =
  | "attp"
  | "fico"
  | "mm"
  | "sd"
  | "abap"
  | "basis"
  | "ewm"
  | "generic";

export function detectDomain(jd: string, title: string): DomainHint {
  const t = `${title} ${jd}`.toLowerCase();
  if (/attp|track\s*(&|and)\s*trace|serialization|epcis|dscsa|gs1|pharma|life\s*science/.test(t))
    return "attp";
  if (/fico|fi\/co|finance|asset accounting|general ledger|controlling/.test(t))
    return "fico";
  if (/\bmm\b|materials management|procure|p2p|purchasing/.test(t)) return "mm";
  if (/\bsd\b|sales|order.to.cash|otc|order management/.test(t)) return "sd";
  if (/abap|rap\b|cds|odata|btp.*dev|developer/.test(t)) return "abap";
  if (/basis|security|authorization|transport|system admin/.test(t)) return "basis";
  if (/ewm|warehouse|wm\b/.test(t)) return "ewm";
  return "generic";
}

export function domainSkillPack(domain: DomainHint): string[] {
  switch (domain) {
    case "attp":
      return [
        "SAP ATTP",
        "Track & Trace",
        "Serialization",
        "GS1",
        "EPCIS",
        "DSCSA",
        "Batch Management",
        "Event Repository",
        "Supply Chain Visibility",
        "Regulatory Compliance",
        "SAP S/4HANA",
        "Integration (IDoc/RFC)",
        "Master Data",
        "Rule Configuration",
        "Exception Handling",
      ];
    case "fico":
      return [
        "SAP FICO",
        "General Ledger",
        "Accounts Payable",
        "Accounts Receivable",
        "Asset Accounting",
        "Controlling",
        "Cost Center Accounting",
        "Profit Center",
        "Month-end Close",
        "SAP S/4HANA Finance",
        "Integration FI-MM/SD",
      ];
    case "abap":
      return [
        "SAP ABAP",
        "RAP",
        "CDS Views",
        "OData",
        "AMDP",
        "BAPI",
        "IDoc",
        "Enhancements",
        "SAP BTP",
        "Fiori",
      ];
    case "mm":
      return [
        "SAP MM",
        "Procure-to-Pay",
        "Purchase Orders",
        "Inventory Management",
        "MRP",
        "Vendor Master",
        "Invoice Verification",
      ];
    case "sd":
      return [
        "SAP SD",
        "Order-to-Cash",
        "Pricing",
        "Shipping",
        "Billing",
        "Customer Master",
        "ATP",
      ];
    case "ewm":
      return [
        "SAP EWM",
        "Warehouse Management",
        "Inbound/Outbound",
        "HU Management",
        "RF Framework",
      ];
    case "basis":
      return [
        "SAP Basis",
        "Transports",
        "System Monitoring",
        "Authorizations",
        "Client Administration",
      ];
    default:
      return [
        "SAP",
        "Configuration",
        "Integration",
        "Testing",
        "Cutover",
        "Documentation",
        "Stakeholder Management",
      ];
  }
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
