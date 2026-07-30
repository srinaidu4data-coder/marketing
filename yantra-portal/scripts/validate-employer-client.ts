/**
 * Ensure every layout emits Employer / Client on each project.
 */
import { PrismaClient } from "@prisma/client";
import {
  extractEmployersFromMaster,
  progressiveTailor,
} from "../src/lib/resume/progressive-tailor";
import { DEFAULT_PROMPT } from "../src/lib/constants";
import { RESUME_LAYOUTS } from "../src/lib/resume/templates";

const master = `Sri
SAP Consultant | 12+ years

EXPERIENCE
Senior SAP Consultant — Acme Pharma LLC (2019–Present)
- Led ATTP serialization workstreams
SAP Functional Consultant — Globex Corp (2014–2019)
- Supported FICO and integration testing

TECHNICAL SKILLS
SAP ATTP, Serialization, GS1, EPCIS, FICO`;

const jd = `Job Title: SAP ATTP Functional Consultant
Need SAP ATTP, serialization, GS1, EPCIS, DSCSA`;

async function main() {
  let fails = 0;
  const log = (ok: boolean, msg: string) => {
    console.log(ok ? `PASS  ${msg}` : `FAIL  ${msg}`);
    if (!ok) fails++;
  };

  const parsed = extractEmployersFromMaster(master);
  console.log("Parsed employers:", parsed);
  log(parsed.includes("Acme Pharma LLC"), "extracts Acme Pharma LLC");
  log(parsed.includes("Globex Corp"), "extracts Globex Corp");

  for (const layout of RESUME_LAYOUTS) {
    const r = await progressiveTailor({
      master,
      jd,
      vendorName: "DemoVendor",
      candidateName: "Sri",
      layoutId: layout.id,
      email: "sri@example.com",
    });
    const lines = r.structured.sections.flatMap((s) => s.lines);
    const employers = lines.filter((l) => /^Employer\s*\/\s*Client\s*:/i.test(l));
    log(
      employers.length >= 3,
      `${layout.id}: ${employers.length} employer lines (need ≥3)`
    );
    // First two should prefer master names
    const names = employers.map((l) =>
      l.replace(/^Employer\s*\/\s*Client\s*:\s*/i, "").trim()
    );
    log(
      names.some((n) => /Acme Pharma/i.test(n)),
      `${layout.id}: includes Acme Pharma from master`
    );
    log(
      names.every((n) => n.length > 1),
      `${layout.id}: no empty employer names`
    );
    console.log(`   sample: ${employers[0]}`);
  }

  // Sync ACTIVE prompt with DEFAULT_PROMPT (includes Employer/Client hard rule)
  const prisma = new PrismaClient();
  try {
    const active = await prisma.promptVersion.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (active) {
      await prisma.promptVersion.update({
        where: { id: active.id },
        data: { content: DEFAULT_PROMPT },
      });
      console.log("Updated ACTIVE prompt id", active.id.slice(0, 8));
    } else {
      await prisma.promptVersion.create({
        data: { content: DEFAULT_PROMPT, status: "ACTIVE", tested: true },
      });
      console.log("Created ACTIVE prompt");
    }
    log(DEFAULT_PROMPT.includes("Employer / Client:"), "DEFAULT_PROMPT has Employer/Client rule");
    log(
      DEFAULT_PROMPT.includes("HARD RULE — EMPLOYER / CLIENT"),
      "DEFAULT_PROMPT has hard rule block"
    );
  } finally {
    await prisma.$disconnect();
  }

  if (fails) {
    console.log(`\n${fails} CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("\nALL EMPLOYER/CLIENT CHECKS PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
