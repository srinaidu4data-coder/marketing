import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const p = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/resume-v2/run-pack.ts"
);
let s = fs.readFileSync(p, "utf8");
const fitStart = s.indexOf("  // ── Fit craft gate");
const forceStart = s.indexOf("  // ── Force if still unusable");
if (fitStart < 0 || forceStart < 0) {
  console.error("markers missing", fitStart, forceStart);
  process.exit(1);
}
const fitBlock = s.slice(fitStart, forceStart);
const withoutFit = s.slice(0, fitStart) + s.slice(forceStart);
const bon = withoutFit.indexOf("  let bonN = 0;");
if (bon < 0) {
  console.error("bon missing");
  process.exit(1);
}
const endBon = withoutFit.indexOf("\n", bon) + 1;
// Avoid double-insert
if (withoutFit.includes("  // ── Fit craft gate")) {
  console.log("already ordered?");
  process.exit(0);
}
const next =
  withoutFit.slice(0, endBon) + "\n" + fitBlock + withoutFit.slice(endBon);
fs.writeFileSync(p, next);
console.log("OK reordered fit loop before soft/bon, bytes", fitBlock.length);
