/**
 * Smoke: dual psych + ATS + mode router on cosplay vs honest samples.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/smoke-psych-ats.ts
 */
import { resolveTailorMode } from "../src/lib/resume/tailor-mode";
import { scorePsych } from "../src/lib/resume/psych-scorer";
import { scoreResume } from "../src/lib/resume/ats-scorer";
import {
  packHasFreeMetrics,
  packHasIndustryCosplay,
} from "../src/lib/resume/resume-honesty";
import { inspectPackShipReady } from "../src/lib/resume/pack-ship-ready";

const masterSap = `
Sri Naidu
SAP FICO Consultant
TECHNICAL SKILLS
SAP S/4HANA, FICO, GL, AP, AR, Asset Accounting
EXPERIENCE
Role: SAP FICO Lead
Client: Collabera IT Services, Dallas, TX
2021 – Present
• Configured Chart of accounts and MM-FI integration
• Worked on Asset Accounting and month-end close
`;

const jdClinical = `
Senior Clinical Data Manager
Pharmaceutical industry, EDC, CDISC, SDTM, CRF Completion Guidelines
`;

const cosplayPack = `
SRI NAIDU
Senior Clinical Data Manager
sri.naidu@example.com
PROFESSIONAL SUMMARY
Results-driven Clinical Data Manager with approximately 27+ years of experience in the Pharmaceutical industry.
SELECTED IMPACT
• Streamlined clinical data processing, resulting in a 30% reduction in data discrepancies.
PROFESSIONAL EXPERIENCE
Senior Clinical Data Manager
Employer / Client: Collabera IT Services
Dallas, TX | 2021 – Present
• Lead Data Management Plans and CRF Completion Guidelines
• Configured Chart of accounts, account determination for MM-FI
EDUCATION
SAP S4 HANA Certified
`;

async function main() {
  const mode = resolveTailorMode(jdClinical, masterSap);
  console.log("mode", mode);

  const free = packHasFreeMetrics(cosplayPack, masterSap);
  const cosplay = packHasIndustryCosplay(cosplayPack, masterSap);
  console.log("free metrics", free);
  console.log("cosplay", cosplay);

  const psych = scorePsych({
    resumeText: cosplayPack,
    masterText: masterSap,
    jd: jdClinical,
    jobTitle: "Senior Clinical Data Manager",
    mode: mode.mode,
    candidateName: "Sri Naidu",
  });
  const honestyFailed = free.length > 0 || cosplay.length > 0;
  const ats = scoreResume({
    resumeText: cosplayPack,
    jd: jdClinical,
    jobTitle: "Senior Clinical Data Manager",
    honestyFailed: honestyFailed || !psych.ready,
  });
  console.log("psych", psych.score, psych.warnings);
  console.log("ats", ats.score, ats.honestyCapped, ats.ready);

  const ship = inspectPackShipReady({
    text: cosplayPack + "\n• bullet one work\n• bullet two work\n• bullet three work\n• bullet four work\n• bullet five work\n",
    masterText: masterSap,
    jd: jdClinical,
    jobTitle: "Senior Clinical Data Manager",
    candidateName: "Sri Naidu",
    minBullets: 1,
  });
  console.log(
    "ship ok",
    ship.ok,
    "best",
    ship.best,
    "issues",
    ship.issues.map((i) => i.code)
  );

  const ok =
    mode.mode === "strict" || mode.mode === "transfer"
      ? true
      : false;
  // Cosplay must not be BEST
  if (ship.best) {
    console.error("SMOKE FAIL: cosplay pack marked BEST");
    process.exit(1);
  }
  if (ats.score === 100 && honestyFailed) {
    console.error("SMOKE FAIL: ATS 100 under honesty fail");
    process.exit(1);
  }
  if (psych.score === 100) {
    console.error("SMOKE FAIL: psych 100 on cosplay pack");
    process.exit(1);
  }
  console.log("mode ok", ok, mode.mode);
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
