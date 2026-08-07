/**
 * Push ADMIN_PROMPT_SEED into ACTIVE promptVersion (bootstrap / reset).
 * Usage: node scripts/_sync-bible-active.mjs
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "../src/lib/resume-v2/admin-prompt-seed.ts");
const src = fs.readFileSync(seedPath, "utf8");
const m = src.match(
  /export const ADMIN_PROMPT_SEED = `([\s\S]*?)`;\s*$/m
);
if (!m) {
  // fallback multiline
  const m2 = src.match(/export const ADMIN_PROMPT_SEED = `([\s\S]*?)`;/);
  if (!m2) {
    console.error("Could not extract ADMIN_PROMPT_SEED");
    process.exit(1);
  }
  var content = m2[1];
} else {
  var content = m[1];
}
content = content
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
await prisma.$disconnect();
