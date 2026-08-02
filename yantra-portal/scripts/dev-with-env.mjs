/**
 * Start next dev with OPENAI_API_KEY loaded from .env,
 * overriding any Windows/process placeholder like "sk-...".
 */
import { readFileSync } from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const raw = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");

const fromFile = {};
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  fromFile[k] = v;
}

const env = { ...process.env, ...fromFile };
// Force file values for OpenAI so Windows placeholder sk-... cannot win
for (const k of Object.keys(fromFile)) {
  if (/OPENAI|ROLEFORGE_OPENAI/i.test(k)) env[k] = fromFile[k];
}

const key = env.OPENAI_API_KEY || "";
console.log(
  `[dev-with-env] OPENAI_API_KEY len=${key.length} starts=${key.slice(0, 7)}… usable=${key.length >= 20}`
);

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev"],
  { cwd: root, env, stdio: "inherit", shell: true }
);
child.on("exit", (code) => process.exit(code ?? 0));
