/**
 * Assert every layout emits a distinct section structure.
 * Gates:
 *  1. Expected headings match emitted headings
 *  2. Full heading signatures unique across 6 layouts
 *  3. First section heading unique across 6 layouts (RT collision gate)
 *  4. Catalog spines unique
 */
import { progressiveTailor } from "../src/lib/resume/progressive-tailor";
import {
  STRUCTURE_CATALOG,
  getStructureDef,
  firstSectionHeadings,
} from "../src/lib/resume/layout-structures";
import { RESUME_LAYOUTS } from "../src/lib/resume/templates";

const jd = `Job Title: SAP ATTP Functional Consultant
Need SAP ATTP, serialization, GS1, EPCIS, DSCSA, pharmaceutical packaging.`;

const master = `Alex Rivera
SAP Consultant | 12+ years
TECHNICAL SKILLS
SAP ATTP, Serialization, GS1, EPCIS, Track and Trace`;

async function main() {
  const signatures: Record<string, string> = {};
  const firsts: Record<string, string> = {};
  let fails = 0;

  for (const layout of RESUME_LAYOUTS) {
    const r = await progressiveTailor({
      master,
      jd,
      vendorName: "DemoVendor",
      candidateName: "Alex Rivera",
      email: "alex@example.com",
      layoutId: layout.id,
    });
    const headings = r.structured.sections
      .filter((s) => s.heading !== "Progressive Experience Notes")
      .map((s) => s.heading);
    const sig = headings.join(" > ");
    signatures[layout.id] = sig;
    firsts[layout.id] = headings[0] || "(empty)";

    const def = getStructureDef(layout.id);
    const missing = def.expectedHeadings.filter((h) => !headings.includes(h));
    const orderOk =
      def.expectedHeadings.every((h, i) => headings[i] === h) &&
      headings.length === def.expectedHeadings.length;
    const okMissing = missing.length === 0;
    console.log("\n===", layout.id, "===");
    console.log("Structure:", def.structureName);
    console.log("Spine:", def.spine);
    console.log("Feel:", def.feel);
    console.log("Headings:", sig);
    console.log("Expected match:", okMissing ? "PASS" : `MISS ${missing.join(", ")}`);
    console.log("Order exact:", orderOk ? "PASS" : "FAIL (order or extra sections)");
    if (!okMissing || !orderOk) fails++;
  }

  // All signatures unique
  const vals = Object.values(signatures);
  const unique = new Set(vals).size === vals.length;
  console.log("\n=== UNIQUENESS (full signature) ===");
  console.log(unique ? "PASS: all 6 structures differ" : "FAIL: duplicate structures");
  if (!unique) {
    fails++;
    console.log(signatures);
  }

  // First section unique (RT P0 gate)
  const firstVals = Object.values(firsts);
  const firstUnique = new Set(firstVals).size === firstVals.length;
  console.log("\n=== FIRST SECTION UNIQUE ===");
  console.log(
    firstUnique
      ? "PASS: every layout opens on a different heading"
      : "FAIL: two layouts open the same way"
  );
  console.log(firsts);
  if (!firstUnique) fails++;

  // Catalog spine uniqueness
  const spines = STRUCTURE_CATALOG.map((s) => s.spine);
  const spineUnique = new Set(spines).size === spines.length;
  console.log("\n=== CATALOG SPINES UNIQUE ===");
  console.log(spineUnique ? "PASS" : "FAIL");
  if (!spineUnique) fails++;

  // Catalog first-heading uniqueness
  const catFirst = firstSectionHeadings();
  const catFirstUnique = new Set(catFirst).size === catFirst.length;
  console.log("\n=== CATALOG FIRST HEADINGS ===");
  console.log(catFirstUnique ? "PASS" : "FAIL", catFirst.join(" | "));
  if (!catFirstUnique) fails++;

  // Pair collision heuristics (RT P0)
  console.log("\n=== PAIR COLLISION HEURISTICS ===");
  const modern = signatures.modern_minimal || "";
  const ats = signatures.ats_classic || "";
  const exec = signatures.executive_serif || "";
  const cons = signatures.consultant_band || "";
  const modernNotAts =
    !modern.startsWith("Professional Summary") &&
    (modern.startsWith("Pitch") || modern.startsWith("Selected Work"));
  const execNotCons =
    exec.startsWith("Executive Brief") &&
    (cons.startsWith("Profile Summary") || cons.startsWith("Situation Snapshot")) &&
    !cons.includes("Signature Achievements");
  const noSharedChapters =
    !modern.includes("Chapter") &&
    !modern.includes("Earlier Chapters");
  console.log("Modern ≠ ATS order:", modernNotAts ? "PASS" : "FAIL");
  console.log("Executive ≠ Consultant spine:", execNotCons ? "PASS" : "FAIL");
  console.log("Modern has no 'chapter' language:", noSharedChapters ? "PASS" : "FAIL");
  if (!modernNotAts || !execNotCons || !noSharedChapters) fails++;

  console.log("\nCatalog size", STRUCTURE_CATALOG.length);
  if (fails) {
    console.log("\nFAILED CHECKS:", fails);
    process.exit(1);
  }
  console.log("\nALL STRUCTURE CHECKS PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
