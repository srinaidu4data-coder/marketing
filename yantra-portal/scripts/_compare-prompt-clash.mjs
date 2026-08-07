/**
 * Compare ACTIVE DB prompt markers (admin SOT only).
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "../src/lib/resume-v2/admin-prompt-seed.ts");
const src = fs.readFileSync(seedPath, "utf8");
const m = src.match(/export const ADMIN_PROMPT_SEED = `([\s\S]*?)`;/);
const seed = m ? m[1] : "";

const prisma = new PrismaClient();
const active = await prisma.promptVersion.findFirst({
  where: { status: "ACTIVE" },
  orderBy: { createdAt: "desc" },
});
const a = active?.content || "";

console.log("ACTIVE id:", active?.id);
console.log("ACTIVE len:", a.length);
console.log("SEED len:", seed.length);
console.log("ACTIVE === SEED:", a.trim() === seed.trim());

const checks = [
  ["recency", /RECENCY JD REWRITE/i],
  ["freeze", /EARLY CAREER FREEZE/i],
  ["no legacy ALL PROJECTS", /ALL PROJECTS MUST BE REWRITTEN/i],
  ["noun tools", /NOUN tools only/i],
  ["zero overlap", /ZERO OVERLAP/i],
];
console.log("\n=== ACTIVE ===");
for (const [label, re] of checks) {
  const hit = re.test(a);
  const want = label !== "no legacy ALL PROJECTS";
  console.log((want ? hit : !hit) ? "ok" : "BAD", label);
}
await prisma.$disconnect();
