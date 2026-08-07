import { PrismaClient } from "@prisma/client";

const url = (process.env.DATABASE_URL || "").trim();
const isPg = /^postgres(ql)?:\/\//i.test(url);
const allowSqlite = process.env.ALLOW_SQLITE_CLONE === "1";

if (!isPg && !allowSqlite) {
  // Single-DB policy: Admin / local / Vercel must share one Postgres.
  console.error(
    "[db] DATABASE_URL must be postgresql://… (same as Vercel Production Admin). " +
      "file:./dev.db is a second roster and is blocked. " +
      "Copy DATABASE_URL + DIRECT_URL from Vercel → Settings → Environment Variables."
  );
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
