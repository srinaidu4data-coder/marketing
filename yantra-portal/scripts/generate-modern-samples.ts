/**
 * Generate modern layout samples for review validation.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { progressiveTailor } from "../src/lib/resume/progressive-tailor";
import { renderDocxBuffer } from "../src/lib/resume/render-docx";
import { renderPdfBuffer } from "../src/lib/resume/render-pdf";
import { RESUME_LAYOUTS } from "../src/lib/resume/templates";

const jd = `Job Title: SAP ATTP Techno-Functional Consultant
Need SAP ATTP Track and Trace, serialization, GS1, EPCIS, DSCSA. Pharma life sciences.`;

const master = `Sri
SAP Consultant | 12+ years
TECHNICAL SKILLS
SAP ATTP, Serialization, GS1, EPCIS, Track and Trace, Integration`;

async function main() {
  const outDir = join(process.cwd(), "scripts", "modern-samples");
  mkdirSync(outDir, { recursive: true });
  const report: Record<string, unknown>[] = [];

  for (const layout of RESUME_LAYOUTS) {
    const tailored = await progressiveTailor({
      master,
      jd,
      vendorName: "DemoVendor",
      candidateName: "Sri Sample",
      email: "sri@example.com",
      layoutId: layout.id,
    });
    const docx = await renderDocxBuffer(tailored.structured);
    const pdf = await renderPdfBuffer(tailored.structured);
    writeFileSync(join(outDir, `${layout.id}.docx`), docx);
    writeFileSync(join(outDir, `${layout.id}.pdf`), pdf);
    report.push({
      layout: layout.id,
      name: layout.name,
      accent: layout.style.accent,
      headerBand: layout.style.headerBand,
      leftRail: layout.style.leftRail,
      docxBytes: docx.length,
      pdfBytes: pdf.length,
      ats: tailored.ats.score,
      projects: 5,
    });
    console.log("OK", layout.id, docx.length, pdf.length);
  }
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log("Wrote samples to", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
