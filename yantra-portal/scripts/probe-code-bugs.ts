/**
 * Probe known false-positive / render bugs in ship-ready + honesty.
 */
import { buildStructuredFromLayout, renderPlainFromStructured } from "../src/lib/resume/build-from-layout";
import { inspectPackShipReady } from "../src/lib/resume/pack-ship-ready";
import { packHasIndustryCosplay } from "../src/lib/resume/resume-honesty";
import { serializeMasterProfile, parseMasterProfile } from "../src/lib/resume/master-profile";

const sapMaster = `
Sri Naidu
Executive Summary:
SAP professional with 25 years ERP.
Collabera IT Services, Dallas, TX SEP 2021 – Current
Role: Senior SAP FICO Architect
Responsibilities:
• Configured GL and asset accounting for enterprise clients.
• Led workshops and UAT for finance workstreams.
`;

const profile = parseMasterProfile(sapMaster);
const profileJson = serializeMasterProfile(profile);

const structured = buildStructuredFromLayout({
  candidateName: "Sri Naidu",
  headline: "Senior Clinical Data Manager",
  contactLine: "a@b.com",
  summaryLines: [
    "Sri is positioned as a Senior Clinical Data Manager with approximately 27+ years of progressive professional experience, drawing on transferable strengths.",
  ],
  skills: [
    "Core: Pharmaceutical  ·  Data  ·  Clinical Data Management  ·  CDISC  ·  EDC",
  ],
  impactLines: ["Delivered data quality improvements with clear metrics."],
  methodologyLines: ["Stakeholder-driven delivery."],
  projects: [
    {
      title: "Senior Clinical Data Manager",
      client: "Collabera IT Services, Dallas, TX",
      location: "Dallas, TX",
      startYear: 2021,
      endYear: "Present",
      era: "recent",
      skills: ["EDC"],
      bullets: Array.from(
        { length: 8 },
        (_, i) =>
          `Delivered workstream ${i} with documentation, validation, and stakeholder updates for Collabera.`
      ),
    },
  ],
  educationLines: [],
  jobTitle: "Senior Clinical Data Manager",
  domain: "clinical-dm",
  yearsHint: 27,
  layoutId: "ats_classic",
  vendorName: "V",
});

const text = renderPlainFromStructured(structured);
console.log("=== TEXT HEAD ===");
console.log(text.slice(0, 900));
console.log("\n=== COSPLAY ON FULL TEXT ===");
console.log(packHasIndustryCosplay(text, sapMaster));
console.log("\n=== SHIP READY ===");
const ship = inspectPackShipReady({
  text,
  masterText: sapMaster,
  masterProfileJson: profileJson,
});
console.log(JSON.stringify(ship, null, 2));

// Bullet char dump
const blocks = text.split(/Employer\s*\/\s*Client:\s*/i).slice(1);
console.log("\nblocks", blocks.length);
if (blocks[0]) {
  const lines = blocks[0].split("\n").slice(0, 15);
  for (const l of lines) {
    console.log(JSON.stringify(l), "codes", [...l.slice(0, 3)].map((c) => c.charCodeAt(0)));
  }
}
