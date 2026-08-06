/**
 * Compare ACTIVE DB prompt vs code BIBLE_PROMPT for clash markers.
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const biblePath = path.join(__dirname, "../src/lib/resume-v2/bible-prompt.ts");
const src = fs.readFileSync(biblePath, "utf8");
const m = src.match(
  /export const BIBLE_PROMPT = `([\s\S]*?)`;\s*\nexport const JSON_SHAPE/
);
const bible = m ? m[1] : "";

const prisma = new PrismaClient();
const active = await prisma.promptVersion.findFirst({
  where: { status: "ACTIVE" },
  orderBy: { createdAt: "desc" },
});
const a = active?.content || "";

console.log("ACTIVE id:", active?.id);
console.log("ACTIVE len:", a.length, "created:", active?.createdAt?.toISOString?.());
console.log("CODE BIBLE len:", bible.length);

const checks = [
  // Real legacy clashes only (not "every projects[i]" density prose)
  ["CLASH: ALL PROJECTS MUST BE REWRITTEN", /ALL PROJECTS MUST BE REWRITTEN|through projects\[N-1\]/i],
  ["CLASH: entire pack mid+early JD face", /entire pack.*mid and early|mid and early employers.*reads/i],
  ["CLASH: early = junior JD title invent", /early = junior\/associate form of \*\*same JD/i],
  ["OK: recency rewrite 0..2 / i<3", /RECENCY JD REWRITE|JD REWRITE ONLY projects|projects\[0\], projects\[1\], projects\[2\]/i],
  ["OK: early career freeze i≥3", /EARLY CAREER FREEZE/i],
  ["OK: do not invent on freeze", /Do NOT invent role titles|do not invent free fields/i],
  ["OK: never invent certs", /never invent cert/i],
  ["OK: noun tools only", /NOUN tools only/i],
  ["OK: stack != env", /DIFFERENT technical|different technical terms|must list DIFFERENT/i],
  ["OK: phrases not in stack", /never into techStack|never in Tech Stack|Capability phrases belong/i],
  ["OK: era honesty", /era-honest|era-true|ERA HONESTY/i],
  ["OK: ACCUMULATE", /ACCUMULATE/i],
  ["GATE: isPureProductLaw", null], // filled below
];

function isPure(body) {
  const t = (body || "").trim();
  if (t.length < 400) return false;
  const hasRecency =
    /RECENCY JD REWRITE/i.test(t) || /JD REWRITE ONLY projects/i.test(t);
  const hasFreeze = /EARLY CAREER FREEZE/i.test(t);
  const hasNoun =
    /techStack/i.test(t) &&
    (/ACCUMULATE/i.test(t) || /NOUN tools only/i.test(t));
  const legacyClash =
    /ALL PROJECTS MUST BE REWRITTEN/i.test(t) ||
    /through projects\[N-1\]/i.test(t);
  return !legacyClash && hasRecency && hasFreeze && hasNoun;
}

function scan(label, text) {
  console.log("\n=== " + label + " ===");
  for (const [name, re] of checks) {
    if (!re) {
      console.log(isPure(text) ? "HIT " : "miss", name);
      continue;
    }
    console.log(re.test(text) ? "HIT " : "miss", name);
  }
}

scan("ACTIVE DB prompt", a);
scan("CODE BIBLE_PROMPT", bible);

console.log("\n=== RUNTIME resolveSystemPrompt behavior ===");
console.log("ACTIVE is pure product law:", isPure(a));
console.log("CODE Bible is pure product law:", isPure(bible));
console.log(
  "ACTIVE === BIBLE content:",
  a.trim() === bible.trim()
);
console.log(
  "Legacy ACTIVE would be REJECTED by new gate:",
  !isPure(
    "# ROLE FORGE EVERY PROJECT\nALL PROJECTS MUST BE REWRITTEN\ntechStack ACCUMULATE " +
      "x".repeat(500)
  )
);

// Snippets
console.log("\n=== ACTIVE head (400 chars) ===");
console.log(a.slice(0, 400));
console.log("\n=== BIBLE head (400 chars) ===");
console.log(bible.slice(0, 400));

await prisma.$disconnect();
