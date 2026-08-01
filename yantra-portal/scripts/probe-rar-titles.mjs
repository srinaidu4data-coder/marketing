import { progressiveTailor, parseJobsFromMasterText, alignProjectRoleTitle } from "../src/lib/resume/progressive-tailor.ts";
import { detectDomain, extractJobTitle } from "../src/lib/resume/jd-parse.ts";
import fs from "fs";

const jd = `Job Title: SAP ABAP Consultant – Leasing / RAR
Must have hands-on SAP RAR (Revenue Accounting and Reporting), IFRS 15, ASC 606, lease accounting (FI-LA),
performance obligations, contract liability, BRF+, OData, Fiori, and ABAP enhancements.`;

const title = extractJobTitle(jd);
const domain = detectDomain(jd, title);
console.log("TITLE:", title);
console.log("DOMAIN:", domain);

const masterPath =
  "uploads/chains/154f1f14-fae4-4839-8575-9c2dabc84a02/Sri_Naidu.txt";
const master = fs.readFileSync(masterPath, "utf8");

const parsed = parseJobsFromMasterText(master);
console.log(
  "PARSED:",
  parsed.map((j) => ({ client: j.client, title: j.title, end: j.endYear }))
);

const r = await progressiveTailor({
  master,
  jd,
  vendorName: "TestVendor",
  candidateName: "Sri Naidu",
  layoutId: "ats_classic",
  useLlm: false,
});

const exp = r.structured.sections.find((s) => /experience/i.test(s.heading));
const titles = [];
for (let i = 0; i < (exp?.lines || []).length; i++) {
  const l = exp.lines[i];
  if (/^Employer\s*\/\s*Client:/i.test(l) && i > 0) titles.push(exp.lines[i - 1]);
}
console.log("PROJECT TITLES ON RESUME:", titles);
console.log(
  "FIRST 8 BULLETS:",
  (exp?.lines || []).filter((l) => /^[•▸]/.test(l)).slice(0, 8)
);
const rarHits = (r.text.match(/\bRAR\b|IFRS 15|ASC 606|lease accounting|FI-LA/gi) || [])
  .length;
console.log("RAR HITS:", rarHits, "ATS:", r.ats.score, "LLM:", r.usedLlm);
console.log(
  "FOOTER sample:",
  r.text.split("\n").filter((l) => l.includes("Role Forge")).slice(-1)[0]
);
