import { createRequire } from "module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Use tsx via dynamic path - simpler: spawn isn't needed if we compile logic inline
// Call through child process with tsx file
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";

const tmp = "scripts/_tmp_verify_resume.ts";
writeFileSync(
  tmp,
  `
import { progressiveTailor, MIN_BULLETS_PER_PROJECT, TARGET_PROJECT_COUNT } from "../src/lib/resume/progressive-tailor";

async function main() {
  const r = await progressiveTailor({
    master: "Jane Doe\\nSAP Consultant | 12+ years\\nTECHNICAL SKILLS\\nSAP S/4HANA, FICO, GL, AP, AR, Asset Accounting, Controlling, MM, Integration",
    jd: "Job Title: SAP S/4HANA FICO Functional Consultant\\nNeed S/4HANA FICO with GL AP AR Asset Accounting, month-end close, integrations, SAP Activate.",
    vendorName: "DemoVendor",
    candidateName: "Jane Doe",
    email: "jane@example.com",
    layoutId: "ats_classic",
  });
  const exp = r.structured.sections.find((s) => s.heading === "Professional Experience")!;
  const counts: number[] = [];
  let bi = 0;
  for (const line of exp.lines) {
    if (/Era:/i.test(line)) {
      if (bi) counts.push(bi);
      bi = 0;
    }
    if (/^[•▸→–\\-]/.test(line.trim())) bi++;
  }
  if (bi) counts.push(bi);
  const lines = r.text.split(/\\n/).length;
  console.log(JSON.stringify({
    MIN_BULLETS_PER_PROJECT,
    TARGET_PROJECT_COUNT,
    bulletsPerProject: counts,
    allGte12: counts.every((c) => c >= 12),
    allGte16: counts.every((c) => c >= 16),
    projectCount: counts.length,
    totalLines: lines,
    approxPages: Math.round((lines / 45) * 10) / 10,
    ats: r.ats.score,
    ready: r.ats.ready,
  }, null, 2));
}
main();
`
);

const res = spawnSync("npx.cmd", ["tsx", tmp], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: true,
});
console.log(res.stdout);
console.error(res.stderr);
try {
  unlinkSync(tmp);
} catch {}
process.exit(res.status || 0);
