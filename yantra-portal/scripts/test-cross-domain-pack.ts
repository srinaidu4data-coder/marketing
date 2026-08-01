/**
 * Hard test: master (SAP HANA/FICO) + JD (Clinical Data Manager) — little in common.
 * Runs admin-sequenced engines (AI first, progressive-rules backup) and writes DOCX+TXT.
 *
 * Usage (from yantra-portal):
 *   npx tsx scripts/test-cross-domain-pack.ts
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { extractMasterText } from "../src/lib/resume/extract-master";
import { tailorResume } from "../src/lib/resume-tailor";
import { renderDocxBuffer } from "../src/lib/resume/render-docx";
import { renderPdfBuffer } from "../src/lib/resume/render-pdf";

const MARKETING = path.resolve(__dirname, "..", "..");
const MASTER_PATH = path.join(MARKETING, "Sri Naidu_SAP HANA.docx");
const JD_PATH = path.join(MARKETING, "jd.txt");
const OUT_DIR = path.join(MARKETING, "test-output");

/** Load .env / .env.local / .env.txt without dotenv package */
async function loadEnvFile() {
  const files = [".env", ".env.local", ".env.txt"];
  for (const f of files) {
    try {
      const envPath = path.join(__dirname, "..", f);
      const raw = (await readFile(envPath, "utf8")).replace(/^\uFEFF/, "");
      for (const line of raw.split(/\r?\n/)) {
        let t = line.trim();
        if (!t || t.startsWith("#")) continue;
        if (t.startsWith("export ")) t = t.slice(7).trim();
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
        // Later files override earlier only if non-empty
        if (v) process.env[k] = v;
        else if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      /* optional file */
    }
  }
}

async function main() {
  await loadEnvFile();
  console.log("=== Cross-domain resume test ===");
  console.log("Master:", MASTER_PATH);
  console.log("JD:    ", JD_PATH);
  console.log(
    "OPENAI configured len:",
    (process.env.OPENAI_API_KEY || "").length
  );

  const jd = (await readFile(JD_PATH, "utf8")).trim();
  const masterBuf = await readFile(MASTER_PATH);
  const extracted = await extractMasterText("Sri Naidu_SAP HANA.docx", masterBuf);
  if (!extracted.extracted || extracted.text.length < 100) {
    throw new Error(
      `Master extract failed: extracted=${extracted.extracted} len=${extracted.text.length}`
    );
  }
  console.log(
    `Master text: ${extracted.text.length} chars (${extracted.format})`
  );
  console.log(`JD text:     ${jd.length} chars`);
  console.log(
    "Overlap note: SAP HANA master vs Clinical Data Manager JD — intentional stress test."
  );

  const nameMatch =
    extracted.text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$/m) ||
    extracted.text.match(/Sri\s+Naidu/i);
  const candidateName = nameMatch
    ? nameMatch[1] || "Sri Naidu"
    : "Sri Naidu";

  const { parseMasterProfile, serializeMasterProfile } = await import(
    "../src/lib/resume/master-profile"
  );
  const profile = parseMasterProfile(extracted.text);
  console.log(
    `Structured profile: ${profile.engagements.length} engagement(s)`,
    profile.engagements.map((e) => e.client).join(" | ")
  );
  if (profile.warnings.length) console.log("Profile warnings:", profile.warnings);

  const result = await tailorResume({
    master: extracted.text,
    masterProfileJson: serializeMasterProfile(profile),
    jd,
    vendorName: "Clinical Staffing Vendor",
    candidateName,
    email: "sri.naidu@example.com",
    layoutId: "ats_classic",
    isTestMode: true,
    // Explicit: AI first, rules backup (same as admin default)
    engineSequence: ["ai-tailor", "progressive-rules"],
    onStep: (id, st) => {
      if (st === "done" || st === "error") console.log(`  step ${id}: ${st}`);
    },
  });

  await mkdir(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = `SriNaidu_Clinical_Data_Manager_${result.engine}_${stamp}`;

  const txtPath = path.join(OUT_DIR, `${base}.txt`);
  await writeFile(txtPath, result.text, "utf8");

  const docxPath = path.join(OUT_DIR, `${base}.docx`);
  const docx = await renderDocxBuffer(result.structured);
  await writeFile(docxPath, docx);

  let pdfPath = "";
  try {
    const pdf = await renderPdfBuffer(result.structured);
    pdfPath = path.join(OUT_DIR, `${base}.pdf`);
    await writeFile(pdfPath, pdf);
  } catch (e) {
    console.warn("PDF skip:", e instanceof Error ? e.message : e);
  }

  const { validateMasterProfile, validatePackAgainstMaster, formatValidationReport } =
    await import("../src/lib/resume/master-pack-validate");
  const uploadVal = validateMasterProfile(profile);
  const packVal =
    result.packValidation ||
    validatePackAgainstMaster({
      masterProfileJson: serializeMasterProfile(profile),
      tailoredText: result.text,
      expectedYears: uploadVal.careerSpanYears,
    });

  console.log("\n=== RESULT ===");
  console.log("Engine used:   ", result.engine);
  console.log("Engines tried: ", JSON.stringify(result.enginesTried, null, 2));
  console.log("Used LLM:      ", result.usedLlm);
  console.log("Model:         ", result.model);
  console.log("ATS score:     ", result.ats?.score);
  console.log("Rules gate:    ", result.rulesGate?.pass ?? "n/a");
  console.log("Headline:      ", result.structured.headline);
  console.log("Projects:      ", result.structured.meta?.progressiveNotes?.join(" · "));
  console.log("\n=== UPLOAD GROUND TRUTH ===");
  console.log(formatValidationReport(uploadVal, "Master upload"));
  console.log("\n=== PACK VS MASTER (post-generation) ===");
  console.log(formatValidationReport(packVal, "Tailored pack"));
  console.log("\nDeliverables:");
  console.log(" ", txtPath);
  console.log(" ", docxPath);
  if (pdfPath) console.log(" ", pdfPath);

  // Also copy to marketing root for easy find
  const rootDocx = path.join(MARKETING, "OUTPUT_SriNaidu_Clinical_Data_Manager.docx");
  const rootTxt = path.join(MARKETING, "OUTPUT_SriNaidu_Clinical_Data_Manager.txt");
  await writeFile(rootDocx, docx);
  await writeFile(rootTxt, result.text, "utf8");
  console.log("\nAlso written:");
  console.log(" ", rootDocx);
  console.log(" ", rootTxt);
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
