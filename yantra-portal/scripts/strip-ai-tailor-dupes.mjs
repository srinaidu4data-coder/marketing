import fs from "fs";

const p = "src/lib/resume/ai-tailor.ts";
let s = fs.readFileSync(p, "utf8");

const a = s.indexOf("function anchorsFromMaster(");
const b = s.indexOf("function buildCoherentSummary(");
if (a < 0 || b < 0) {
  console.error({ a, b });
  process.exit(1);
}
s = s.slice(0, a) + s.slice(b);

const y = s.indexOf("function yearOf(");
const f = s.indexOf("function fillPrompt(");
if (y >= 0 && f > y) s = s.slice(0, y) + s.slice(f);

// drop dead helpers still present
const deadStarts = [
  "function normalizeClient(",
  "function isOffDomainTitle(",
  "function titleForIndex(",
  "function skillCapFor(",
  "function bulletCapFor(",
  "function eraSkillBank(",
  "function pickAiProject(",
  "function parseModules(",
  "function fillBullets(",
  "function isNoisyBullet(",
  "function isMetaStackLine(",
  "function dedupeBullets(",
  "function isOffDomainSkill(",
  "function isOffDomainBullet(",
];

for (const d of deadStarts) {
  let idx = s.indexOf(d);
  while (idx >= 0) {
    // find matching function end: next \nfunction or \nexport or \nasync function at column 0
    const rest = s.slice(idx + 1);
    const m = rest.search(/\n(?:export )?(?:async )?function |\nexport async function /);
    if (m < 0) break;
    s = s.slice(0, idx) + rest.slice(m + 1);
    idx = s.indexOf(d);
  }
}

fs.writeFileSync(p, s);
console.log("lines", s.split("\n").length);
console.log("local buildProjects", s.includes("function buildProjects("));
console.log("import buildProjects", s.includes("buildProjects"));
