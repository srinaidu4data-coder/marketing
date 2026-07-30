/**
 * Vercel / production build:
 * - If DATABASE_URL is postgres → use schema.postgres.prisma + db push
 * - Else → sqlite schema (local / preview without DB)
 */
import { execSync } from "child_process";

const url = process.env.DATABASE_URL || "";
const isPg = /^postgres(ql)?:\/\//i.test(url);

function run(cmd, env = process.env) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", env });
}

if (isPg) {
  console.log("Using PostgreSQL schema for Vercel build");
  // Prisma requires DIRECT_URL when declared in schema — fall back to DATABASE_URL
  const env = {
    ...process.env,
    DIRECT_URL:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL.replace("-pooler", "").replace(
        /[?&]pgbouncer=true/g,
        ""
      ),
  };
  run("npx prisma generate --schema=prisma/schema.postgres.prisma", env);
  try {
    // Prefer direct (non-pooler) connection for migrations
    run(
      "npx prisma db push --schema=prisma/schema.postgres.prisma --accept-data-loss",
      env
    );
  } catch (e) {
    console.warn("prisma db push failed (continuing build):", e?.message || e);
  }
} else {
  console.log("Using SQLite schema");
  run("npx prisma generate");
}

run("npx next build");
