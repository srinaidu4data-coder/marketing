import {
  applyStackEnvToPlainText,
  plainTextHasCloneStacks,
} from "../src/lib/resume-v2/stack-env/plain-text";

const clone = `NAME
TITLE

PROFESSIONAL EXPERIENCE

Senior Consultant
Employer / Client: Co A
TX | 2022 – Present
Tech Stack: SAP ATTP, EPCIS, GTIN, SSCC, RISE
Environment: Azure, Databricks, Jira, ServiceNow
• bullet one
• bullet two
• bullet three
• bullet four
• bullet five
• bullet six
• bullet seven
• bullet eight

Senior Consultant
Employer / Client: Co B
TX | 2018 – 2021
Tech Stack: SAP ATTP, EPCIS, GTIN, SSCC, RISE
Environment: Azure, Databricks, Jira, ServiceNow
• bullet one
• bullet two
• bullet three
• bullet four
• bullet five
• bullet six
• bullet seven
• bullet eight

Senior Consultant
Employer / Client: Co C
TX | 2005 – 2010
Tech Stack: SAP ATTP, EPCIS, GTIN, SSCC, RISE
Environment: Azure, Databricks, Jira, ServiceNow
• b1
• b2
• b3
• b4
• b5
• b6
• b7
• b8
`;

console.log("isClone", plainTextHasCloneStacks(clone));
const r = applyStackEnvToPlainText(clone, {
  force: true,
  jd: "SAP ATTP EPCIS DSCSA Azure",
});
console.log(
  "changed",
  r.changed,
  "sigs",
  r.report?.uniqueSignatures,
  "maxJ",
  r.report?.maxPairJaccard
);
console.log("STACKS", r.text.match(/^Tech Stack:.*/gim));
console.log("ENVS", r.text.match(/^Environment:.*/gim));
console.log("stillClone", plainTextHasCloneStacks(r.text));
if (plainTextHasCloneStacks(r.text)) process.exit(1);
console.log("SMOKE_PLAIN_OK");
