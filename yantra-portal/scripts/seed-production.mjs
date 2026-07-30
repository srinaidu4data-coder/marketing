/**
 * One-shot seed for production after first deploy.
 * Usage (with DATABASE_URL set to Postgres):
 *   npx tsx prisma/seed.ts
 *
 * Or via Vercel CLI:
 *   vercel env pull .env.production.local
 *   # set DATABASE_URL
 *   npm run db:seed:pg
 */
console.log("Use: DATABASE_URL=<postgres> npx tsx prisma/seed.ts");
console.log("Ensure prisma schema matches Postgres (schema.postgres.prisma generated client).");
