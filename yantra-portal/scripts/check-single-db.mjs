/**
 * Fail if DATABASE_URL is a local SQLite clone (second Admin universe).
 */
const url = (process.env.DATABASE_URL || "").trim();
const isPg = /^postgres(ql)?:\/\//i.test(url);
const isFile = /^file:/i.test(url);

if (isFile || !isPg) {
  console.error(
    "[single-db] REJECTED:",
    isFile ? "file:./dev.db (local clone)" : "missing/non-postgres DATABASE_URL"
  );
  console.error(
    "[single-db] Use the same postgresql:// URL as Vercel Production so Admin data is one place."
  );
  process.exit(process.env.ALLOW_SQLITE_CLONE === "1" ? 0 : 1);
}

const host = (url.match(/@([^/?]+)/) || [])[1] || "(host)";
console.log("[single-db] OK postgres host:", host);
