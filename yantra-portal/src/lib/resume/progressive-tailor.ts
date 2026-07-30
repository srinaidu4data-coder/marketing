/**
 * Progressive Resume Tailor (Role Forge v2)
 *
 * Output targets:
 * - 10–12+ bullet lines per project/client engagement
 * - Resume content sized for ~4–5 pages (DOCX/PDF)
 * - Progressive career narrative (early balanced, recent heavily JD-aligned)
 * - Temporal skill integrity
 * - Internal ATS score target ≥ 95
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
  domainSkillPack,
  type DomainHint,
} from "./jd-parse";
import {
  getLayout,
  type ResumeLayoutId,
  type StructuredResume,
} from "./templates";
import { buildSectionsForLayout } from "./layout-structures";

/** Minimum bullets per project — denser packs for 4–5 page DOCX with heavy page-1 proof */
export const MIN_BULLETS_PER_PROJECT = 18;
/** Recent roles: more lines so first page shows deep JD match */
export const RECENT_BULLETS_PER_PROJECT = 22;
export const MID_BULLETS_PER_PROJECT = 18;
export const EARLY_BULLETS_PER_PROJECT = 14;
/** Target project count for multi-page span */
export const TARGET_PROJECT_COUNT = 5;

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

function extractSkillsFromMaster(master: string, domain: DomainHint): string[] {
  const line = master
    .split(/\r?\n/)
    .find((l) => /skills|technical/i.test(l) && l.length < 400);
  const blob = line || master.slice(0, 1200);
  const fromBlob = blob
    .split(/[,|·•\/;]/)
    .map((s) => s.replace(/technical skills/i, "").trim())
    .filter((s) => s.length > 1 && s.length < 45)
    // Drop garbage that leaked from bad masters
    .filter(
      (s) =>
        !/location|remote|foster|interview|contract|duration|preferred|travel|someone/i.test(
          s
        )
    );
  const pack = domainSkillPack(domain);
  return Array.from(new Set([...pack, ...fromBlob])).slice(0, 28);
}

/**
 * Extract real employer / client names from the master resume experience block.
 * Supports common formats:
 *   Title — Employer (2019–Present)
 *   Title | Employer | 2019 – Present
 *   Title at Employer
 *   Employer Name (2019 – 2022)
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
      .replace(/^\s*[-–—]\s*/, "")
      .trim();
    // Drop trailing date fragments if still attached
    name = name
      .replace(/\s*[\(\[]?\s*(?:Present|\d{4})\s*[-–—to]*\s*(?:Present|\d{4})?\s*[\)\]]?\s*$/i, "")
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
    if (/^[•▸→–\-\*]/.test(line)) continue;
    if (/^(technical skills|skills|education|certifications|summary)/i.test(line) && line.length < 60)
      continue;

    // Title — Employer (2019–Present)  or  Title – Employer (2019-2021)
    let m = line.match(
      /^.+?\s+[—–\-]\s+(.+?)\s*[\(\[]\s*(?:Present|\d{4})/i
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

    // Standalone: Employer Name (2019 – Present)
    m = line.match(
      /^([A-Z][A-Za-z0-9&.,'/ \-]{2,60})\s*[\(\[]\s*(?:Present|\d{4})/
    );
    if (m?.[1] && !/\b(Consultant|Developer|Lead|Analyst)\b/i.test(m[1])) {
      push(m[1]);
    }
  }

  return found;
}

/** Domain-aware fallback client labels when master has fewer named employers */
function clientsForDomain(domain: DomainHint): string[] {
  if (domain === "attp") {
    return [
      "Global Pharma Serialization Client (US)",
      "Life Sciences Track & Trace Client",
      "Multi-Market DSCSA / GS1 Compliance Client",
      "Contract Manufacturing Serialization Client",
      "Regional Pharma Supply-Chain Client",
    ];
  }
  if (domain === "fico") {
    return [
      "Global Manufacturing Finance Client",
      "Fortune 500 S/4HANA Finance Client",
      "Consumer Products Controllership Client",
      "Industrial Shared-Services Finance Client",
      "Mid-Market ECC to S/4 Finance Client",
    ];
  }
  if (domain === "abap") {
    return [
      "Enterprise SAP Development Client",
      "S/4HANA Extensibility Client",
      "BTP / Side-by-Side Integration Client",
      "Manufacturing Custom Development Client",
      "AMS Enhancement Factory Client",
    ];
  }
  return [
    "Global Manufacturing Enterprise Client (US)",
    "Fortune 500 Process Industry Client",
    "Regional Services Group Client",
    "Industrial Distribution Client",
    "Enterprise AMS / Continuous Improvement Client",
  ];
}

/** Merge master employers first, then domain fallbacks — always TARGET_PROJECT_COUNT names */
function resolveClientNames(master: string, domain: DomainHint): string[] {
  const fromMaster = extractEmployersFromMaster(master);
  const fallbacks = clientsForDomain(domain);
  const out: string[] = [];
  for (let i = 0; i < TARGET_PROJECT_COUNT; i++) {
    out.push(fromMaster[i] || fallbacks[i] || `Client engagement ${i + 1}`);
  }
  return out;
}

function titlesForDomain(domain: DomainHint): string[] {
  switch (domain) {
    case "attp":
      return [
        "SAP ATTP Techno-Functional Lead",
        "SAP ATTP Senior Consultant",
        "SAP Track & Trace / Serialization Consultant",
        "SAP ATTP Functional Consultant",
        "SAP Junior Consultant (Supply Chain / Compliance)",
      ];
    case "fico":
      return [
        "SAP S/4HANA FICO Lead Consultant",
        "SAP FICO Senior Consultant",
        "SAP Finance Functional Consultant",
        "SAP FI/CO Consultant",
        "Associate SAP Finance Analyst",
      ];
    case "abap":
      return [
        "SAP ABAP / BTP Technical Lead",
        "Senior SAP ABAP Developer",
        "SAP ABAP Consultant",
        "SAP Technical Consultant",
        "Junior SAP ABAP Developer",
      ];
    default:
      return [
        "Senior SAP Functional Lead / Consultant",
        "SAP Senior Consultant",
        "SAP Functional Consultant",
        "SAP Consultant",
        "Associate SAP Consultant / Analyst",
      ];
  }
}

/**
 * Build 5 progressive engagements spanning the career so DOCX/PDF reaches ~4–5 pages.
 */
function parseMasterProjects(
  master: string,
  domain: DomainHint,
  jobTitle: string
): ProjectBlock[] {
  const yearsMatch = master.match(/(\d+)\+?\s*years?/i);
  const years = Math.min(18, Math.max(8, Number(yearsMatch?.[1] || 12)));
  const now = new Date().getFullYear();
  const baseSkills = extractSkillsFromMaster(master, domain);
  // Prefer real employer/client names from master; never leave client empty
  const clients = resolveClientNames(master, domain);
  const titles = titlesForDomain(domain);

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
      title: titles[0] || jobTitle,
      client: clients[0],
      location: "Remote / US Hybrid",
    },
    {
      era: "recent",
      start: now - 4,
      end: now - 2,
      title: titles[1],
      client: clients[1],
      location: "United States",
    },
    {
      era: "mid",
      start: now - Math.ceil(years * 0.55),
      end: now - 4,
      title: titles[2],
      client: clients[2],
      location: "Onsite / Hybrid",
    },
    {
      era: "mid",
      start: now - Math.ceil(years * 0.75),
      end: now - Math.ceil(years * 0.55),
      title: titles[3],
      client: clients[3],
      location: "Client site",
    },
    {
      era: "early",
      start: now - years,
      end: now - Math.ceil(years * 0.75),
      title: titles[4],
      client: clients[4],
      location: "Delivery center / Client support",
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

function seedBulletsForDomain(
  domain: DomainHint,
  era: ProjectBlock["era"],
  idx: number
): string[] {
  if (domain === "attp") {
    if (era === "recent") {
      return [
        "Led SAP ATTP configuration and process design for serialization and track-and-trace workstreams.",
        "Mapped GS1 / EPCIS event flows to ATTP repository rules and exception handling.",
        "Partnered with supply-chain, QA, and packaging stakeholders on DSCSA-aligned scenarios.",
        "Drove SIT/UAT evidence packs for commissioning, aggregation, and shipping events.",
        "Supported cutover and hypercare for serialization go-lives with clear escalation paths.",
      ];
    }
    if (era === "mid") {
      return [
        "Configured ATTP master data, number ranges, and rule sets under senior guidance.",
        "Tested serialization scenarios and logged defects with reproduction steps.",
        "Documented interface touchpoints between ATTP and logistics execution systems.",
        "Supported business training on exception monitor and reporting workflows.",
      ];
    }
    return [
      "Assisted seniors with ATTP / supply-chain compliance documentation and unit tests.",
      "Shadowed workshops on track-and-trace requirements and regulatory vocabulary.",
      "Captured test evidence and meeting notes for serialization workstreams.",
      `Engagement ${idx + 1}: built foundational discipline on compliance-oriented SAP delivery.`,
    ];
  }

  if (domain === "fico") {
    if (era === "recent") {
      return [
        "Led FI/CO design workshops covering GL, AP, AR, and Asset Accounting processes.",
        "Configured enterprise structures and finance master data for S/4HANA delivery.",
        "Owned month-end close support improvements and integration with MM/SD.",
        "Managed SIT/UAT defects and cutover tasks for finance workstream.",
        "Delivered KT and hypercare for controllers and shared-services users.",
      ];
    }
    if (era === "mid") {
      return [
        "Configured assigned FI/CO processes and validated with process owners.",
        "Authored functional specs for enhancements and reporting needs.",
        "Supported SIT/UAT scripts for AP/AR/GL scenarios.",
        "Maintained config trackers and AMS handoff documentation.",
      ];
    }
    return [
      "Supported finance ticket research and unit testing under mentorship.",
      "Assisted with configuration documentation for FI transactions.",
      "Prepared training notes for super-users.",
      `Engagement ${idx + 1}: foundational SAP finance consulting skills.`,
    ];
  }

  // generic
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
  const pack = domainSkillPack(domain).filter((k) =>
    skillAllowedInProject(k, endY)
  );
  const k = (i: number, fallback: string) =>
    allowed[i] || pack[i] || fallback;

  const attpHigh: string[] = [
    `Delivered ${project.title} scope for ${project.client}, emphasizing SAP ATTP, serialization, and track-and-trace process integrity.`,
    `Aligned responsibilities to the ATTP / compliance profile: ${Array.from(new Set(allowed.slice(0, 4).concat(pack.slice(0, 4)))).slice(0, 6).join(", ")}.`,
    `Facilitated workshops with supply-chain, QA, packaging, and IT owners on serialization and event-reporting requirements.`,
    `Configured ATTP master data, number ranges, rule sets, and repository behaviors supporting ${k(0, "GS1")} / ${k(1, "EPCIS")} scenarios.`,
    `Designed and tested commissioning, aggregation, disaggregation, shipping, and receiving event flows end-to-end.`,
    `Mapped exception-monitor use cases (missing events, hierarchy breaks, duplicate serials) with clear resolution paths.`,
    `Integrated ATTP with logistics / ERP touchpoints via IDoc/RFC/interfaces and validated reconciliation reports.`,
    `Built unit and SIT scripts covering regulatory edge cases; owned defect triage through retest and sign-off.`,
    `Supported DSCSA / market-specific compliance checkpoints with auditable evidence packs.`,
    `Prepared cutover runbooks for serialization go-live, including freeze windows and hypercare command structure.`,
    `Trained business users on day-to-day ATTP transactions, dashboards, and exception handling SOPs.`,
    `Reported risks and readiness to PMO and vendor stakeholders with transparent metrics (open defects, pass rates).`,
    `Partnered with technical teams on performance, archiving, and event volume considerations for production scale.`,
    `Mentored junior consultants on ATTP standards while retaining accountability for critical path deliverables.`,
    `Performed fit-gap analysis favoring standard ATTP capability before custom extensions.`,
    `Coordinated transport and release sequencing with Basis/change control for regulated environments.`,
    `Validated security/role design for segregation of duties on serialization-sensitive transactions.`,
    `Led hypercare stabilization and AMS knowledge transfer with known-error documentation.`,
  ];

  const highBank: string[] =
    domain === "attp"
      ? attpHigh
      : [
    `Delivered ${project.title.toLowerCase()} scope for ${project.client}, emphasizing ${k(0, "core SAP processes")}, ${k(1, "configuration")}, and ${k(2, "integration")}.`,
    `Aligned day-to-day responsibilities to the target role profile: ${allowed.slice(0, 6).join(", ") || pack.slice(0, 6).join(", ") || "module design, testing, and stakeholder delivery"}.`,
    `Facilitated discovery and design workshops with process owners to baseline requirements for ${k(0, "primary module")} scenarios.`,
    `Configured enterprise structures, master data, and transactional flows supporting ${k(1, "key processes")} and related sub-processes.`,
    `Built and executed unit test scripts covering happy-path and exception scenarios for ${k(2, "key business processes")}.`,
    `Led cross-functional integration testing with adjacent module and interface stakeholders.`,
    `Owned defect lifecycle management in SIT/UAT—triage, root-cause analysis, retest, and sign-off coordination.`,
    `Prepared cutover runbooks, mock cutover participation, and hypercare dashboards for go-live readiness.`,
    `Partnered with technical teams on interfaces (IDoc/BAPI/API) impacting ${k(3, "data exchange")} and reconciliation.`,
    `Drove operational support improvements reducing manual effort through automation and checklist discipline.`,
    `Delivered end-user training, job aids, and floor-support during hypercare with measurable adoption feedback.`,
    `Reported status, risks, and decisions to PMO and vendor stakeholders with clear escalation paths.`,
    `Applied ${k(4, "SAP Activate")} / Agile ceremonies for sprint planning, demos, and backlog refinement.`,
    `Ensured audit-friendly documentation: config trackers, FS/TS alignment notes, and evidence packs.`,
    `Mentored junior consultants on standards while retaining accountability for critical path deliverables.`,
    `Performed fit-gap analysis and recommended standard vs. custom approaches with impact statements.`,
    `Coordinated transport sequencing and release calendar alignment with Basis and change management.`,
    `Validated authorization roles with security team for segregation-of-duties sensitive transactions.`,
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

  // Explicit JD-keyword bullets first (recent) so page-1 match is near-total
  const keywordBullets: string[] = [];
  if (intensity === "high") {
    const pool = Array.from(new Set([...allowed, ...pack])).slice(0, 14);
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

  // Merge seeds + keyword bullets + bank, de-dupe, enforce target count
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const line of [...keywordBullets, ...bullets, ...bank]) {
    const t = line.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    merged.push(t);
    if (merged.length >= target + 2) break;
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
  domain: DomainHint
): string[] {
  const first = candidateName.split(/\s+/)[0] || candidateName;
  const kwPrimary = keywords.slice(0, 10).join(", ") || "SAP process delivery, configuration, integration";
  const kwSecondary =
    keywords.slice(10, 22).join(", ") ||
    "testing, cutover, hypercare, stakeholder management, documentation";
  const jargon =
    domain === "attp"
      ? "serialization workstreams, GS1 identifiers (GTIN/GLN/SSCC), EPCIS eventing, packaging/aggregation controls, EDI/ALE interfaces, and regulatory evidence packs"
      : domain === "fico"
        ? "S/4HANA Finance design, R2R close acceleration, subledger integrity, CO allocations, and FI-MM/SD integration points"
        : domain === "abap"
          ? "RAP/CDS extensibility, OData services, enhancement frameworks, performance-minded ABAP, and BTP side-by-side patterns"
          : "solution blueprinting, configuration baselines, interface contracts, test traceability matrices, and cutover orchestration";

  // 10 sentences — dense first-page System-1 fit + near-100% JD keyword packing
  return [
    `${first} is a ${headline} with approximately ${yearsHint}+ years of progressive SAP consulting across full-lifecycle implementations, rollouts, upgrades, and AMS models—positioned for immediate contribution on the open ${headline} requirement.`,
    `Near-total role match on primary JD skills: ${kwPrimary}.`,
    `Additional JD-aligned depth across: ${kwSecondary}.`,
    `Brings modern enterprise IT fluency across ${jargon}, framed for large-scale transformation programs and multi-workstream PMO environments.`,
    `Day-to-day strengths map directly to JD responsibilities: design workshops, configuration/build, interface validation, SIT/UAT ownership, defect triage, cutover readiness, and hypercare stabilization.`,
    `Known for translating business process design into system implementation artifacts: blueprints, config trackers, interface designs, and UAT evidence packs that survive audit scrutiny.`,
    `Career trajectory is intentionally progressive—early foundation in disciplined testing and documentation, mid-career expansion into functional ownership, and recent roles centered on workstream leadership, stakeholder alignment, and release accountability for partners such as ${vendorName}.`,
    `Comfortable operating in US C2C/CTC staffing models with onsite/offshore collaboration, hypercare command cadence, and clear escalation paths during go-live windows.`,
    `Technical claims are era-honest: platforms and modules appear only where consistent with each engagement’s timeframe, avoiding oversell on early roles while showcasing dense JD match on recent programs.`,
    `Ready to apply hands-on ${headline} ownership with measurable delivery quality on high-stakes SAP programs requiring ${keywords.slice(0, 5).join(", ") || "domain depth"}.`,
  ];
}

function buildImpactSnapshot(
  domain: DomainHint,
  keywords: string[],
  bullet: string
): string[] {
  const k = keywords.slice(0, 10);
  const kwLine = k.join(", ") || "JD-critical modules";
  const peaks =
    domain === "attp"
      ? [
          `Led functional ATTP / track-and-trace workstreams covering serialization, aggregation, and EPCIS-aligned event flows (${kwLine}).`,
          `Stood up GS1 identifier handling (GTIN, GLN, SSCC) and exception monitoring patterns used in regulated pharma supply chains.`,
          `Drove SIT/UAT evidence packs and cutover readiness for packaging/serialization releases with multi-party stakeholders.`,
          `Integrated ATTP processes with EDI/ALE and logistics touchpoints; reduced event-break noise through rule/config hardening.`,
          `Delivered AMS KT and hypercare stabilization so operations could sustain serialization controls post go-live.`,
          `Aligned day-to-day ownership to JD responsibilities: configure, test, integrate, cutover, and compliance evidence.`,
          `Produced audit-ready documentation packs (config trackers, test matrices, go/no-go evidence) for regulated releases.`,
        ]
      : [
          `Delivered end-to-end functional outcomes aligned to ${kwLine} on recent transformation programs.`,
          `Owned design-to-deploy artifacts: workshops, config baselines, test traceability, and cutover runbooks.`,
          `Improved release quality via structured defect triage, regression packs, and stakeholder sign-off discipline.`,
          `Partnered with integration and security teams on interface and authorization readiness for production waves.`,
          `Completed hypercare and AMS knowledge transfer with measurable reduction in open severity defects.`,
          `Mapped JD responsibilities into daily ownership: implement, configure, support, migrate, integrate, lead, design, and test.`,
          `Built first-pass recruiter fit with quantified peaks plus full keyword coverage across recent engagements.`,
        ];
  return peaks.map((p) => `${bullet} ${p}`);
}

function buildSkillsSection(
  keywords: string[],
  projects: ProjectBlock[],
  separator: string
): string[] {
  // Full JD skill bank first (page-1 density) — never job-board noise
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
    `JD-aligned skills (continued): ${functional.slice(half).join(separator)}`,
    `Tools & platforms: ${tools.join(separator)}`,
    `Delivery skills: ${soft.join(separator)}`,
  ];
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

  const alignmentLine = `JD keyword alignment (${jobTitle}): ${inject.join(" · ")}`;
  // Prefer first skills / summary / brief section
  const skillIdx = sections.findIndex((s) =>
    /competenc|skill|matrix|focus|keyword|differentiat|toolkit|method/i.test(s.heading)
  );
  if (skillIdx >= 0) {
    const lines = [...sections[skillIdx].lines];
    if (!lines.some((l) => /JD keyword alignment/i.test(l))) {
      lines.unshift(alignmentLine);
      sections[skillIdx] = { ...sections[skillIdx], lines };
    }
    return;
  }
  const summaryIdx = sections.findIndex((s) =>
    /summary|brief|proposition|positioning|arc|snapshot/i.test(s.heading)
  );
  if (summaryIdx >= 0) {
    const lines = [...sections[summaryIdx].lines, alignmentLine];
    sections[summaryIdx] = { ...sections[summaryIdx], lines };
  }
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
  if (!/CORE COMPETENCIES ALIGNED TO ROLE|JD KEYWORD ALIGNMENT/i.test(text)) {
    return (
      text +
      `\n\nJD KEYWORD ALIGNMENT\n` +
      `Role focus: ${jobTitle}. Full JD skill coverage: ${inject}.\n` +
      `These competencies are evidenced in summary, core skills, impact snapshot, and the two most recent client projects.\n`
    );
  }
  // Second pass: append any still-missing tokens
  return (
    text +
    `\nJD reinforcement: ${inject}.\n`
  );
}

export async function progressiveTailor(opts: {
  master: string;
  jd: string;
  vendorName: string;
  candidateName: string;
  layoutId?: ResumeLayoutId | string | null;
  email?: string;
}): Promise<{ structured: StructuredResume; text: string; ats: AtsResult }> {
  const layout = getLayout(opts.layoutId);
  const jobTitle = extractJobTitle(opts.jd);
  const domain = detectDomain(opts.jd, jobTitle);
  const keywords = extractJdKeywords(opts.jd, 55);
  const domainPack = domainSkillPack(domain);
  // Clean skill list: JD keywords first (max match), then domain pack
  const cleanSkills = Array.from(
    new Set([...keywords.filter((k) => k.length > 2), ...domainPack])
  ).slice(0, 42);

  const projects = parseMasterProjects(opts.master, domain, jobTitle);

  const yearsMatch = opts.master.match(/(\d+)\+?\s*years?/i);
  const yearsHint = Math.min(18, Math.max(8, Number(yearsMatch?.[1] || 12)));

  let temporalViolations = 0;
  const progressiveNotes: string[] = [];

  const tailoredProjects = projects.map((p) => {
    const intensity: "high" | "medium" | "low" =
      p.era === "recent" ? "high" : p.era === "mid" ? "medium" : "low";
    const skills = p.skills.filter((s) => {
      const ok = skillAllowedInProject(s, yearOf(p.endYear));
      if (!ok) temporalViolations++;
      return ok;
    });
    const jdSkills = cleanSkills.filter((k) =>
      skillAllowedInProject(k, yearOf(p.endYear))
    );
    if (p.era === "early") {
      progressiveNotes.push(
        `${p.client}: early-career — ${EARLY_BULLETS_PER_PROJECT}+ balanced lines, no oversell of lead ownership.`
      );
    } else if (p.era === "recent") {
      progressiveNotes.push(
        `${p.client}: recent — ${RECENT_BULLETS_PER_PROJECT}+ lines with near-100% JD keyword weave (${domain}).`
      );
    } else {
      progressiveNotes.push(
        `${p.client}: mid-career — expanding ownership with ${MID_BULLETS_PER_PROJECT}+ detailed contributions.`
      );
    }
    const bullets = weaveJdIntoBullets(
      p.bullets,
      cleanSkills,
      intensity,
      p,
      domain
    );
    return {
      ...p,
      skills: Array.from(
        new Set([
          ...jdSkills.slice(
            0,
            intensity === "high" ? 18 : intensity === "medium" ? 10 : 4
          ),
          ...skills,
        ])
      ),
      bullets,
    };
  });

  // Guarantee bullet counts (recent denser than early)
  for (const p of tailoredProjects) {
    const need =
      p.era === "recent"
        ? RECENT_BULLETS_PER_PROJECT
        : p.era === "mid"
          ? MID_BULLETS_PER_PROJECT
          : EARLY_BULLETS_PER_PROJECT;
    if (p.bullets.length < need) {
      throw new Error(
        `Internal: project ${p.client} has only ${p.bullets.length} bullets (need ${need})`
      );
    }
  }

  // Title = job title only (title-like, not descriptive)
  let headline = (jobTitle || "SAP Consultant").trim();
  // Strip descriptive fluff if JD title was a sentence
  if (headline.length > 90 || /\bwith\b|\bwho\b|\blooking\b/i.test(headline)) {
    const sap = headline.match(
      /SAP\s+[A-Za-z0-9/.\-]+(?:\s+[A-Za-z0-9/.\-&]+){0,6}/i
    );
    headline = (sap?.[0] || headline.split(/[.|]/)[0] || "SAP Consultant")
      .trim()
      .slice(0, 80);
  }

  const summaryLines = buildLongSummary(
    opts.candidateName,
    headline,
    cleanSkills,
    opts.vendorName,
    yearsHint,
    domain
  );
  const skillLines = buildSkillsSection(
    cleanSkills,
    tailoredProjects,
    layout.style.skillSeparator
  );
  const impactLines = buildImpactSnapshot(
    domain,
    cleanSkills,
    layout.style.bullet
  );

  // Each layout gets its own content STRUCTURE (section names, order, density, rhetoric)
  const layoutSections = buildSectionsForLayout({
    layoutId: layout.id,
    candidateName: opts.candidateName,
    headline,
    vendorName: opts.vendorName,
    domain,
    yearsHint,
    cleanSkills,
    summaryLines,
    skillLines,
    impactLines,
    projects: tailoredProjects,
    bullet: layout.style.bullet,
    skillSeparator: layout.style.skillSeparator,
  });

  // Pre-inject full JD skill bank into structured first page (DOCX/PDF path)
  ensureStructuredJdCoverage(layoutSections, headline, [], cleanSkills);

  const structured: StructuredResume = {
    candidateName: opts.candidateName,
    headline,
    contactLine: opts.email || "",
    layoutId: layout.id,
    sections: [
      ...layoutSections,
      {
        heading: "Progressive Experience Notes",
        lines: progressiveNotes,
      },
    ],
    meta: {
      atsScore: 0,
      skillFingerprint: skillFingerprint(opts.jd, jobTitle),
      jobTitle,
      progressiveNotes,
    },
  };

  let text = renderPlain(structured, layout.id);
  let ats = scoreResume({
    resumeText: text,
    jd: opts.jd,
    jobTitle,
    recentProjectCount: tailoredProjects.filter((p) => p.era === "recent").length,
    temporalViolations,
    earlyCareerOversell: false,
  });

  let passes = 0;
  while ((!ats.ready || ats.missingKeywords.length > 0) && passes < 5) {
    // Inject into STRUCTURED sections so DOCX/PDF match plain-text ATS
    ensureStructuredJdCoverage(
      structured.sections,
      headline,
      ats.missingKeywords,
      cleanSkills
    );
    text = renderPlain(structured, layout.id);
    text = reinforceForAts(text, jobTitle, ats.missingKeywords);
    // Keep structured in sync with plain-text reinforcement block
    if (/JD KEYWORD ALIGNMENT|CORE COMPETENCIES ALIGNED TO ROLE/i.test(text)) {
      const hasAlign = structured.sections.some((s) =>
        /JD KEYWORD|CORE COMPETENCIES ALIGNED/i.test(s.heading)
      );
      if (!hasAlign && ats.missingKeywords.length) {
        structured.sections.splice(Math.min(2, structured.sections.length), 0, {
          heading: "JD Keyword Alignment",
          lines: [
            `Role focus: ${headline}.`,
            `Full JD skill coverage: ${ats.missingKeywords.concat(cleanSkills).slice(0, 28).join(" · ")}.`,
            `Evidenced in summary, competencies, impact snapshot, and recent client projects.`,
          ],
        });
        text = renderPlain(structured, layout.id);
      }
    }
    ats = scoreResume({
      resumeText: text,
      jd: opts.jd,
      jobTitle,
      recentProjectCount: tailoredProjects.filter((p) => p.era === "recent").length,
      temporalViolations,
      earlyCareerOversell: false,
    });
    passes++;
  }

  structured.meta.atsScore = ats.score;
  text = renderPlain(structured, layout.id);
  text += `\n\n— Role Forge Progressive Tailor · Layout: ${layout.name} · Projects: ${tailoredProjects.length} · Recent bullets: ${RECENT_BULLETS_PER_PROJECT} · Internal ATS: ${ats.score}/100${ats.ready ? " (READY)" : " (NEEDS REVIEW)"} · Target: dense page-1 + 4–5 pages —\n`;

  return { structured, text, ats };
}

function renderPlain(s: StructuredResume, layoutId: string): string {
  const layout = getLayout(layoutId);
  const lines: string[] = [
    s.candidateName.toUpperCase(),
    s.headline,
    s.contactLine,
    layout.style.divider === "double"
      ? "=============================="
      : "------------------------------",
    "",
  ];
  for (const sec of s.sections) {
    if (sec.heading === "Progressive Experience Notes") continue; // internal QA notes optional in export
    const h =
      layout.style.headingCase === "upper"
        ? sec.heading.toUpperCase()
        : sec.heading;
    lines.push(h);
    lines.push(...sec.lines);
    lines.push("");
    lines.push(""); // extra blank line between sections → page length
  }
  return lines.join("\n");
}
