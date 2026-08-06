/**
 * Push BIBLE_PROMPT into ACTIVE promptVersion (local or whatever DATABASE_URL points to).
 * Usage: node scripts/_sync-bible-active.mjs
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
if (!m) {
  console.error("Could not extract BIBLE_PROMPT");
  process.exit(1);
}
const content = m[1]
  .replace(/\\`/g, "`")
  .replace(/\\\$/g, "$")
  .replace(/\\\\/g, "\\");

const prisma = new PrismaClient();
const active = await prisma.promptVersion.findFirst({
  where: { status: "ACTIVE" },
  orderBy: { createdAt: "desc" },
});
if (active) {
  await prisma.promptVersion.update({
    where: { id: active.id },
    data: { content, tested: true },
  });
  console.log("Updated ACTIVE", active.id, "len", content.length);
} else {
  const created = await prisma.promptVersion.create({
    data: { content, status: "ACTIVE", tested: true },
  });
  console.log("Created ACTIVE", created.id, "len", content.length);
}

// Verify pure law
const checks = [
  ["recency", /RECENCY JD REWRITE/i],
  ["freeze", /EARLY CAREER FREEZE/i],
  ["no legacy ALL PROJECTS", /ALL PROJECTS MUST BE REWRITTEN/i],
  ["noun tools", /NOUN tools only/i],
];
for (const [label, re] of checks) {
  const hit = re.test(content);
  const wantHit = label !== "no legacy ALL PROJECTS";
  console.log(
    (wantHit ? hit : !hit) ? "ok" : "BAD",
    label,
    wantHit ? (hit ? "present" : "MISSING") : hit ? "STILL PRESENT" : "absent"
  );
}
await prisma.$disconnect();
