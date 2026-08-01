import fs from "fs";
const path = process.argv[2] || ".env.vercel.pull";
const t = fs.readFileSync(path, "utf8");
const safeShow = new Set([
  "EMAIL_DRY_RUN",
  "EMAIL_FROM",
  "NEXTAUTH_URL",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "VERCEL_URL",
]);
for (const line of t.split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const k = m[1];
  let v = m[2];
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (safeShow.has(k)) console.log(`${k}=${v}`);
  else console.log(`${k}=${v ? `[set len=${v.length}]` : "[empty]"}`);
}
