/**
 * Smoke: StackEnv engine must diversify cloned stacks across eras.
 * node --import tsx scripts/smoke-stack-env-engine.ts
 * or: npx tsx scripts/smoke-stack-env-engine.ts
 */
import { runStackEnvEngine } from "../src/lib/resume-v2/stack-env/engine";
import {
  DEFAULT_STACK_ENV_BANK,
  bankStats,
} from "../src/lib/resume-v2/stack-env/default-bank";
import type { ResumePackV2 } from "../src/lib/resume-v2/pack-schema";

const CLONE =
  "SAP ATTP, EPCIS, GTIN, SSCC, DSCSA, RISE, S/4HANA, Boomi";
const CLONE_ENV = "Azure, Databricks, Jira, ServiceNow, RISE";

const pack: ResumePackV2 = {
  header: {
    name: "Test User",
    jobTitle: "Serialization Consultant",
    email: "t@example.com",
    phone: "",
    location: "TX",
    linkedin: "",
  },
  professionalSummary: {
    bullets: Array.from({ length: 6 }, (_, i) => `Summary bullet ${i + 1}`),
  },
  techSkills: CLONE,
  education: [],
  certifications: [],
  projects: [
    {
      role: "Senior Serialization Consultant",
      employerOrClient: "Pharma Co A",
      location: "NJ",
      duration: "2022 – Present",
      techStack: CLONE,
      environment: CLONE_ENV,
      bullets: Array.from({ length: 8 }, (_, i) => `Bullet A${i}`),
    },
    {
      role: "Senior Serialization Consultant",
      employerOrClient: "Pharma Co B",
      location: "NJ",
      duration: "2018 – 2021",
      techStack: CLONE,
      environment: CLONE_ENV,
      bullets: Array.from({ length: 8 }, (_, i) => `Bullet B${i}`),
    },
    {
      role: "Senior Serialization Consultant",
      employerOrClient: "Retailer C",
      location: "TX",
      duration: "2014 – 2017",
      techStack: CLONE,
      environment: CLONE_ENV,
      bullets: Array.from({ length: 8 }, (_, i) => `Bullet C${i}`),
    },
    {
      role: "Senior Serialization Consultant",
      employerOrClient: "Bank D",
      location: "NY",
      duration: "2008 – 2013",
      techStack: CLONE,
      environment: CLONE_ENV,
      bullets: Array.from({ length: 8 }, (_, i) => `Bullet D${i}`),
    },
    {
      role: "Senior Serialization Consultant",
      employerOrClient: "Factory E",
      location: "OH",
      duration: "2001 – 2007",
      techStack: CLONE,
      environment: CLONE_ENV,
      bullets: Array.from({ length: 8 }, (_, i) => `Bullet E${i}`),
    },
  ],
};

const jd = `
Need SAP ATTP serialization expert with EPCIS, GTIN, SSCC, DSCSA compliance.
Azure, Databricks preferred. Agile delivery.
`;

const stats = bankStats(DEFAULT_STACK_ENV_BANK);
console.log("BANK", stats);

const { pack: out, report } = runStackEnvEngine(pack, {
  jd,
  masterText: "Factory E 2001 ECC FICO Excel\nBank D 2008 PeopleSoft HCM",
  bank: DEFAULT_STACK_ENV_BANK,
});

console.log("PASSED", report.passed);
console.log(
  "CHECKS",
  report.checks.map((c) => `${c.id}:${c.ok ? "ok" : "FAIL"} (${c.detail})`).join(" | ")
);
console.log("maxJ", report.maxPairJaccard.toFixed(3), "sigs", report.uniqueSignatures);

for (let i = 0; i < out.projects.length; i++) {
  const p = out.projects[i]!;
  console.log(
    `[${i}] ${p.duration}\n  stack: ${p.techStack}\n  env:   ${p.environment}`
  );
}

// Assertions
const sigs = new Set(
  out.projects.map(
    (p) =>
      `${(p.techStack || "").toLowerCase()}|${(p.environment || "").toLowerCase()}`
  )
);
if (sigs.size < out.projects.length) {
  console.error("FAIL: duplicate signatures", sigs.size, out.projects.length);
  process.exit(1);
}
if (report.maxPairJaccard > 0.55) {
  console.error("FAIL: max Jaccard too high", report.maxPairJaccard);
  process.exit(1);
}
// Early career must not keep full ATTP clone
const early = out.projects[out.projects.length - 1]!;
if (/\bATTP\b/i.test(early.techStack) && /\bEPCIS\b/i.test(early.techStack)) {
  console.error("FAIL: early career still has ATTP+EPCIS", early.techStack);
  process.exit(1);
}
// Stack vs env disjoint at phrase level
const nk = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
for (const p of out.projects) {
  const sPhrases = (p.techStack || "").split(",").map((x) => nk(x));
  const ePhrases = (p.environment || "").split(",").map((x) => nk(x));
  for (const e of ePhrases) {
    if (!e) continue;
    if (sPhrases.includes(e)) {
      console.error("FAIL: phrase overlap", p.employerOrClient, e);
      process.exit(1);
    }
  }
}

console.log("SMOKE_OK skills=", JSON.stringify(out.techSkills).slice(0, 200));
process.exit(0);
