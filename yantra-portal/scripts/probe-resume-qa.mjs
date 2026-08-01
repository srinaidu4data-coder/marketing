import { qaAndRepairResume, isIdentityLeakLine } from "../src/lib/resume/resume-qa.ts";

// Reproduce the bug from the screenshot: header identity leaked under Summary twice
const bad = {
  candidateName: "Sri Naidu",
  headline: "SAP ABAP Consultant – Leasing / Revenue Accounting & Reporting (RAR)",
  contactLine: "srinaidu582@gmail.com",
  layoutId: "technical_dense",
  sections: [
    {
      heading: "Professional Summary",
      lines: [
        "SAP ABAP Consultant – Leasing / Revenue Accounting & Reporting (RAR)",
        "srinaidu582@gmail.com  |  Remote (US)  |  SAP Certified – S/4HANA Financials",
        "PROFESSIONAL SUMMARY",
        "Dedicated SAP ABAP Consultant with 25 years of experience in finance and enterprise data, specializing in the Leasing and Revenue Accounting & Reporting (RAR) modules.",
      ],
    },
    {
      heading: "Professional Summary",
      lines: [
        "Second summary block that should merge.",
      ],
    },
    {
      heading: "Professional Experience",
      lines: [
        "SAP ABAP Consultant – Leasing / RAR",
        "Employer / Client: SR SOFT LLC",
        "Remote  |  2024 – Present",
        "• Built RAR enhancements",
      ],
    },
  ],
  meta: {
    atsScore: 0,
    skillFingerprint: "x",
    jobTitle: "SAP ABAP Consultant – Leasing / Revenue Accounting & Reporting (RAR)",
    progressiveNotes: [],
  },
};

console.log(
  "leak title?",
  isIdentityLeakLine(bad.sections[0].lines[0], {
    candidateName: bad.candidateName,
    headline: bad.headline,
    jobTitle: bad.meta.jobTitle,
  })
);
console.log(
  "leak email?",
  isIdentityLeakLine(bad.sections[0].lines[1], {
    candidateName: bad.candidateName,
    headline: bad.headline,
    jobTitle: bad.meta.jobTitle,
  })
);

const qa = qaAndRepairResume(bad);
console.log("OK", qa.ok);
console.log("ISSUES", qa.issues);
console.log("SECTIONS", qa.fixed.sections.map((s) => ({ h: s.heading, n: s.lines.length, lines: s.lines })));
const summaryCount = qa.fixed.sections.filter((s) =>
  /summary/i.test(s.heading)
).length;
console.log("SUMMARY_SECTION_COUNT", summaryCount);
const hasEmailInSummary = qa.fixed.sections
  .filter((s) => /summary/i.test(s.heading))
  .some((s) => s.lines.some((l) => /@/.test(l)));
console.log("EMAIL_IN_SUMMARY", hasEmailInSummary);
