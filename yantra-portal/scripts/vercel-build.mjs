/**
 * Production / local build — SINGLE DATABASE policy.
 * Always PostgreSQL (same as Vercel Admin). SQLite clone is not supported.
 */
import { execSync } from "child_process";

const url = (process.env.DATABASE_URL || "").trim();
const isPg = /^postgres(ql)?:\/\//i.test(url);

function run(cmd, env = process.env) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", env });
}

if (!isPg) {
  console.error(`
══════════════════════════════════════════════════════════════
 SINGLE DATABASE POLICY
 DATABASE_URL must be postgresql://… (same as Vercel Production).
 file:./dev.db is not allowed — it creates a second Admin roster.

 Set in Vercel env (already) and in local .env / .env.local:
   DATABASE_URL=postgresql://…
   DIRECT_URL=postgresql://…   (non-pooler / Neon direct)

 Copy from: Vercel → Project → Settings → Environment Variables
══════════════════════════════════════════════════════════════
`);
  if (process.env.ALLOW_SQLITE_CLONE === "1") {
    console.warn("ALLOW_SQLITE_CLONE=1 — generating sqlite client (not for real Admin data)");
    run("npx prisma generate --schema=prisma/schema.sqlite.prisma");
    run("npx next build");
    process.exit(0);
  }
  process.exit(1);
}

console.log("Using single PostgreSQL schema (Admin = production = local)");
const env = {
  ...process.env,
  DIRECT_URL:
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL.replace("-pooler", "").replace(
      /[?&]pgbouncer=true/g,
      ""
    ),
};

run("npx prisma generate --schema=prisma/schema.prisma", env);
try {
  run("npx prisma db push --schema=prisma/schema.prisma --accept-data-loss", env);
} catch (e) {
  console.warn("prisma db push failed (continuing build):", e?.message || e);
}

run("npx next build");
