/**
 * Smoke: 1999–2003 BA must NOT get FastAPI / K8s / GKE / Kafka / Grafana.
 */
import {
  runStackEnvEngine,
  endYearFromDuration,
  passesHardEraBan,
  eraBucket,
} from "../src/lib/resume-v2/stack-env/engine";
import { DEFAULT_STACK_ENV_BANK } from "../src/lib/resume-v2/stack-env/default-bank";
import { applyStackEnvToPlainText } from "../src/lib/resume-v2/stack-env/plain-text";
import type { ResumePackV2 } from "../src/lib/resume-v2/pack-schema";

const dur = "Hyderabad, IN | Mar 1999 – Apr 2003";
const y = endYearFromDuration(dur);
console.log("parsed endYear", y, "era", eraBucket(y, { projectIndex: 4 }));
if (y !== 2003) {
  console.error("FAIL: expected endYear 2003, got", y);
  process.exit(1);
}

const pack: ResumePackV2 = {
  header: {
    name: "Test",
    jobTitle: "Business Analyst",
    email: "",
    phone: "",
    location: "Hyderabad, IN",
    linkedin: "",
  },
  professionalSummary: { bullets: Array.from({ length: 6 }, (_, i) => `S${i}`) },
  techSkills: "FastAPI, Python, Kafka",
  education: [],
  certifications: [],
  projects: [
    {
      role: "Senior Consultant",
      employerOrClient: "Recent Co",
      location: "TX",
      duration: "2022 – Present",
      techStack: "SAP ATTP, EPCIS, S/4HANA",
      environment: "Azure, Databricks, Jira",
      bullets: Array.from({ length: 8 }, () => "b"),
    },
    {
      role: "Business Analyst",
      employerOrClient: "New Horizons IT Services Inc.",
      location: "Hyderabad, IN",
      duration: "Mar 1999 – Apr 2003",
      techStack: "FastAPI, Python, Kafka, Grafana, OpenAPI, COBOL, WM, FICO",
      environment: "GKE, Kubernetes, GitHub, SIEM console, Hyper-V, Cloudflare",
      bullets: Array.from({ length: 8 }, () => "b"),
    },
  ],
};

const { pack: out, report } = runStackEnvEngine(pack, {
  jd: "Business Analyst requirements UAT SQL Excel",
  masterText: "New Horizons IT Services Inc. Business Analyst Excel SQL Visio",
  bank: DEFAULT_STACK_ENV_BANK,
});

const early = out.projects[1]!;
console.log("EARLY stack:", early.techStack);
console.log("EARLY env:", early.environment);
console.log("skills groups:", Object.keys(out.techSkills as object));
const skillCount =
  typeof out.techSkills === "object" && out.techSkills && !Array.isArray(out.techSkills)
    ? Object.values(out.techSkills as Record<string, string[]>).flat().length
    : String(out.techSkills).split(/[,;]/).filter(Boolean).length;
console.log("skill token count", skillCount);
console.log("era_honesty", report.checks.find((c) => c.id === "era_honesty"));

const banned =
  /\b(FastAPI|Kafka|Grafana|OpenAPI|GKE|Kubernetes|GitHub|Cloudflare|Hyper-V|SIEM|Databricks|Azure|ATTP)\b/i;
if (banned.test(early.techStack) || banned.test(early.environment)) {
  console.error("FAIL: modern tokens on 1999–2003 project");
  process.exit(1);
}
if (!passesHardEraBan("FastAPI", 2003)) {
  /* ok */
} else {
  console.error("FAIL: hard ban should reject FastAPI for 2003");
  process.exit(1);
}
if (skillCount < 30) {
  console.error("FAIL: want ≥30 skill tokens, got", skillCount);
  process.exit(1);
}

// Plain text path
const plain = `Business Analyst
Employer / Client: New Horizons IT Services Inc.
Hyderabad, IN | Mar 1999 – Apr 2003
Tech Stack: FastAPI, Python, Kafka, Grafana, OpenAPI, COBOL, WM, FICO
Environment: GKE, Kubernetes, GitHub, SIEM console, Hyper-V, Cloudflare
• b1
• b2
• b3
• b4
• b5
• b6
• b7
• b8
`;
const fixed = applyStackEnvToPlainText(plain, {
  force: true,
  jd: "Business Analyst UAT SQL Excel",
  masterText: "New Horizons Excel SQL Visio",
});
console.log("PLAIN out stacks", fixed.text.match(/^Tech Stack:.*/gim));
console.log("PLAIN out envs", fixed.text.match(/^Environment:.*/gim));
if (banned.test(fixed.text.match(/^Tech Stack:.*/im)?.[0] || "")) {
  console.error("FAIL plain stack still modern");
  process.exit(1);
}
if (banned.test(fixed.text.match(/^Environment:.*/im)?.[0] || "")) {
  console.error("FAIL plain env still modern");
  process.exit(1);
}

console.log("SMOKE_ERA_OK");
