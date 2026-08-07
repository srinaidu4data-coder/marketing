import { PrismaClient } from "@prisma/client";

/**
 * SINGLE DATABASE POLICY
 * Admin UI, local dev, and Vercel production MUST share one Postgres URL.
 * SQLite file:./dev.db is a second roster (blocked unless ALLOW_SQLITE_CLONE=1).
 */
export function assertSingleDatabaseUrl(url = process.env.DATABASE_URL): string {
  const u = (url || "").trim();
  const isPg = /^postgres(ql)?:\/\//i.test(u);
  const allowSqlite = process.env.ALLOW_SQLITE_CLONE === "1";
  if (isPg) return u;
  if (allowSqlite && /^file:/i.test(u)) {
    console.warn(
      "[db] ALLOW_SQLITE_CLONE=1 — using local SQLite (NOT Admin data)"
    );
    return u;
  }
  throw new Error(
    "[single-db] DATABASE_URL must be postgresql://… matching Vercel Production. " +
      "file:./dev.db creates a second Admin roster and is blocked. " +
      "Copy DATABASE_URL + DIRECT_URL from Vercel → Project → Settings → Environment Variables into .env.local"
  );
}

// Fail fast at import in all environments (except build-time without env — Next may import during build)
try {
  if (process.env.DATABASE_URL || process.env.NODE_ENV !== "production") {
    assertSingleDatabaseUrl();
  }
} catch (e) {
  // During `next build` without local secrets, log hard error but rethrow only at runtime queries
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.error((e as Error).message);
  } else if (process.env.DATABASE_URL) {
    throw e;
  } else {
    console.error((e as Error).message);
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
