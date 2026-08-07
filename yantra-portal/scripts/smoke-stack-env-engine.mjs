/**
 * Smoke: StackEnv engine kills clone stamps across a long career.
 * Run: node scripts/smoke-stack-env-engine.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Use tsx if available via dynamic import of compiled path — inline minimal port
// We import via next-less path by evaluating the TS with a small inline clone of the logic test.

// Prefer running through npx tsx when present
import { spawnSync } from "child_process";

const r = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "tsx",
    path.join(__dirname, "smoke-stack-env-engine.ts"),
  ],
  { cwd: root, encoding: "utf8", shell: true }
);
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
