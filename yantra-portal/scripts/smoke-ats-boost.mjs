/**
 * Smoke: ATS escalation graph must clear ship floor (95) on a thin pack + dense JD.
 */
import { boostPackTowardAts100 } from "../src/lib/resume/ats-boost.ts";

const jd = `
Senior Clinical Data Manager
EDC Rave Medidata CDISC SDTM CDASH CRF eCRF query management
pharmacovigilance protocol compliance stakeholder UAT SIT
implement configure support design test integrate lead migration
`;

const master = `
Sri Naidu SAP FICO Consultant
Employer / Client: Westlake Chemicals
Configured SAP FI modules, led UAT, supported stakeholders, implemented GL.
`;

const structured = {
  candidateName: "Sri Naidu",
  headline: "Consultant",
  contactLine: "sri@example.com",
  layoutId: "consultant_band",
  sections: [
    {
      heading: "Professional Summary",
      lines: ["Experienced SAP consultant with progressive delivery."],
    },
    {
      heading: "Technical Skills",
      lines: ["SAP FICO · UAT · Configuration"],
    },
    {
      heading: "Professional Experience",
      lines: [
        "SAP FICO Consultant",
        "Employer / Client: Westlake Chemicals",
        "Houston | 2020 – Present",
        "Stack: SAP FI",
        "",
        "• Configured FI and supported UAT with stakeholders.",
        "• Implemented GL processes and led workshops.",
        "• Designed reconciliation procedures and tested integrations.",
        "• Supported cutover and hypercare.",
        "• Migrated chart of accounts with documentation.",
        "• Partnered with business owners on compliance evidence.",
        "• Integrated interfaces with adjacent modules.",
        "• Led status reporting to PMO.",
      ],
    },
  ],
  meta: {
    jobTitle: "Senior Clinical Data Manager",
    skillFingerprint: "",
    progressiveNotes: [],
    atsScore: 0,
    psychScore: 0,
    tailorMode: "strict",
  },
};

const boost = boostPackTowardAts100({
  structured,
  jd,
  jobTitle: "Senior Clinical Data Manager",
  masterText: master,
  recentProjectCount: 2,
  honestyFailed: false,
});

console.log({
  score: boost.ats.score,
  tier: boost.tierReached,
  injected: boost.injected.length,
  missing: boost.ats.missingKeywords.slice(0, 8),
  notes: boost.notes,
  shipOk: boost.ats.score >= 95,
});

if (boost.ats.score < 95) {
  console.error("FAIL: expected ATS ≥ 95 after graph");
  process.exit(1);
}
console.log("PASS: ship floor cleared");
