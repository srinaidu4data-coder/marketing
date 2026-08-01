import { readFile, stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const files = [".env", ".env.local", ".env.txt", ".env.example"];

for (const f of files) {
  const envPath = path.join(root, f);
  try {
    const st = await stat(envPath);
    const raw = (await readFile(envPath, "utf8")).replace(/^\uFEFF/, "");
    console.log(`\n=== ${f} (mtime ${st.mtime.toISOString()}) ===`);
    let found = false;
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      if (!/OPENAI|ROLEFORGE_OPENAI/i.test(t)) continue;
      found = true;
      const i = t.indexOf("=");
      if (i < 1) {
        console.log("  (malformed line)");
        continue;
      }
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      console.log(
        `  ${k} | len=${v.length} | startsSk=${/^sk[-_]/.test(v)} | empty=${v.length === 0}`
      );
    }
    if (!found) console.log("  (no OPENAI_* keys)");
  } catch {
    console.log(`\n=== ${f} (missing) ===`);
  }
}
