/**
 * Ensure all jobs from master resume appear on tailored output.
 */
import { readFile } from "fs/promises";
import mammoth from "mammoth";
import {
  parseJobsFromMasterText,
  progressiveTailor,
} from "../src/lib/resume/progressive-tailor";

async function main() {
  const path =
    "uploads/masters/1785383803298_SriNaidu_Finance_Data_Analytics_Consulting_Lead_Resume.docx";
  const buf = await readFile(path);
  const { value: master } = await mammoth.extractRawText({ buffer: buf });

  const jobs = parseJobsFromMasterText(master);
  console.log("Parsed jobs:", jobs.length);
  for (const j of jobs) {
    console.log(
      ` - ${j.client} | ${j.startYear}-${j.endYear} | ${j.title.slice(0, 50)} | bullets=${j.bullets.length}`
    );
  }

  const expected = [
    "SR SOFT",
    "Westlake",
    "BP Oil",
    "GSK",
    "Genentech",
    "NOL",
    "Starwood",
    "Home Depot",
    "eBay",
    "Aera",
  ];

  let fails = 0;
  if (jobs.length < 8) {
    console.log("FAIL expected ≥8 jobs from master, got", jobs.length);
    fails++;
  }

  const r = await progressiveTailor({
    master,
    jd: "Job Title: SAP FICO Consultant\nS/4HANA Finance FICO GL AP AR Power BI",
    vendorName: "Demo",
    candidateName: "Sri Naidu",
    layoutId: "ats_classic",
    email: "srinaidu582@gmail.com",
  });

  const exp = r.structured.sections.find((s) =>
    /experience|engagement|work|portfolio|chapter/i.test(s.heading)
  );
  const body = (exp?.lines || []).join("\n");
  console.log("\nExperience section lines:", exp?.lines.length);
  for (const name of expected) {
    const ok = new RegExp(name, "i").test(body);
    console.log(ok ? "PASS" : "FAIL", "includes employer", name);
    if (!ok) fails++;
  }

  if (fails) {
    console.log("\nFAILED", fails);
    process.exit(1);
  }
  console.log("\nALL MASTER PROJECT CHECKS PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
