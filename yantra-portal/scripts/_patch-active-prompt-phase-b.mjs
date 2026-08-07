/**
 * Append Phase B quality hard rules to Admin ACTIVE prompt (if missing).
 * Usage: node scripts/_patch-active-prompt-phase-b.mjs
 * Uses DATABASE_URL from .env.local / env.
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const MARKER = "QUALITY HARD RULES (Phase B";

const PATCH = `

## QUALITY HARD RULES (Phase B — non-negotiable)
1. techSkills shape ONLY: string OR string[] OR { "Group": string[] }. NEVER [{ "name": "…" }] objects (causes [object Object]).
2. Progressive titles: projects[0] may be full JD-family senior title; early projects Associate/BA/Consultant — NEVER the same senior ATTP title on every row.
3. Unique era-true stacks: techStack + environment MUST differ across projects. NEVER paste RISE/ATTP/DSCSA/EPCIS onto 1999–2012 roles.
4. certifications[]: MASTER only — never invent "Enterprise Platform Certified".
5. Summary: imperative Delivered/Configured… — FORBIDDEN openers Accomplished/Expert in/Proven track/Strong ability.
6. FORBIDDEN filler: partner scorecards, finger-pointing, engagement-goals (N/M).
7. techStack ≥3 nouns; environment ≥2 nouns; zero shared tokens between them per project.
`;

const prisma = new PrismaClient();

async function main() {
  const active = await prisma.promptVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!active) {
    console.log("NO_ACTIVE_PROMPT — run Admin Install seed or create ACTIVE first");
    process.exit(1);
  }
  if (active.content.includes(MARKER)) {
    console.log("ACTIVE already has Phase B rules", active.id, "len", active.content.length);
    return;
  }
  const next = `${active.content.trim()}\n${PATCH}\n`;
  await prisma.promptVersion.update({
    where: { id: active.id },
    data: { content: next },
  });
  console.log("Patched ACTIVE", active.id, "new len", next.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
