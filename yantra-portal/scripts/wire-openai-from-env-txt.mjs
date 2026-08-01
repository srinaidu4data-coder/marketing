import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const txtPath = path.join(root, ".env.txt");

let env = await readFile(envPath, "utf8");
const bareLines = (await readFile(txtPath, "utf8"))
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

let key = bareLines.find((l) => /^sk-/.test(l) || /^OPENAI_API_KEY=/i.test(l));
if (!key) {
  console.error("No sk-… key found in .env.txt");
  process.exit(1);
}
if (/^OPENAI_API_KEY=/i.test(key)) {
  key = key.slice(key.indexOf("=") + 1).trim();
}
if (
  (key.startsWith('"') && key.endsWith('"')) ||
  (key.startsWith("'") && key.endsWith("'"))
) {
  key = key.slice(1, -1);
}

if (/^OPENAI_API_KEY=/m.test(env)) {
  env = env.replace(/^OPENAI_API_KEY=.*$/m, `OPENAI_API_KEY=${key}`);
} else {
  env += (env.endsWith("\n") ? "" : "\n") + `OPENAI_API_KEY=${key}\n`;
}

await writeFile(envPath, env, "utf8");
console.log(
  `OPENAI_API_KEY written to .env | len=${key.length} | startsSk=${/^sk-/.test(key)}`
);
