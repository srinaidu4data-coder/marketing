/**
 * Characterization / pure-function suite (no Jest).
 * Exit 0 only if every assertion passes.
 *
 * Run: node scripts/characterization/run.mjs
 * Or:  npm run test:smoke
 */
import { createRequire } from "module";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

const result = spawnSync(
  process.execPath,
  [tsx, path.join(root, "scripts/characterization/suite.ts")],
  { cwd: root, encoding: "utf8", env: process.env }
);

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status === null ? 1 : result.status);
