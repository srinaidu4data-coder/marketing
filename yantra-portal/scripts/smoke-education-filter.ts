/**
 * Smoke: degrees kept; SAP certs dropped on clinical JD (heuristic path).
 * Run: node node_modules/tsx/dist/cli.mjs scripts/smoke-education-filter.ts
 */
import {
  certRelevantHeuristic,
  classifyEducationLine,
  educationLinesForJd,
  extractEducationAndCertsFromMaster,
} from "../src/lib/resume/education-filter";

const master = `
John Doe
EDUCATION
Bachelor of Science in Computer Science, State University
CERTIFICATIONS
SAP Certified Application Associate - Financial Accounting
CDISC SDTM Professional Certificate
`;

const ex = extractEducationAndCertsFromMaster(master);
console.log("extract", ex);

const sapDrop = certRelevantHeuristic({
  cert: "SAP Certified Application Associate - Financial Accounting",
  jd: "Clinical Data Manager. EDC, CDISC, SDTM, Medidata Rave.",
  jobTitle: "Clinical Data Manager",
  domain: "clinical",
});
console.log("SAP on clinical:", sapDrop);

const cdiscKeep = certRelevantHeuristic({
  cert: "CDISC SDTM Professional Certificate",
  jd: "Clinical Data Manager. EDC, CDISC, SDTM.",
  jobTitle: "Clinical Data Manager",
  domain: "clinical",
});
console.log("CDISC on clinical:", cdiscKeep);

async function main() {
  const result = await educationLinesForJd({
    master,
    jd: "Clinical Data Manager role. Medidata Rave, CDISC, SDTM, EDC.",
    jobTitle: "Clinical Data Manager",
    domain: "clinical",
    useAi: false, // offline heuristic only for smoke
  });
  console.log("pack lines:", result.lines);
  console.log("dropped:", result.certsDropped);
  console.log("filter:", result.certFilter);

  const ok =
    result.degrees.some((d) => /bachelor/i.test(d)) &&
    result.certsDropped.some((d) => /SAP/i.test(d.line)) &&
    !result.lines.some((l) => /SAP Certified/i.test(l)) &&
    classifyEducationLine("SAP Certified Associate") === "cert";

  if (!ok) {
    console.error("SMOKE FAIL");
    process.exit(1);
  }
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
