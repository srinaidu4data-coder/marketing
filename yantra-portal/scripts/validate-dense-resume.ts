import { progressiveTailor } from "../src/lib/resume/progressive-tailor";
import { RESUME_LAYOUTS } from "../src/lib/resume/templates";

const master = `Sri Naidu
SAP Consultant | 12+ years
EXPERIENCE
Senior SAP Consultant — Acme Pharma LLC (2019–Present)
SAP Functional Consultant — Globex Corp (2014–2019)
TECHNICAL SKILLS
SAP ATTP, Serialization, GS1, EPCIS`;

const jd = `Job Title: SAP ATTP Functional Consultant
Need SAP ATTP, serialization, GS1, EPCIS, DSCSA, track and trace, pharmaceutical packaging,
aggregation, commissioning, SIT, UAT, cutover, hypercare, IDoc, RFC, master data,
rule configuration, compliance, regulatory, warehouse, supply chain`;

async function main() {
  let fails = 0;
  for (const layout of RESUME_LAYOUTS) {
    const r = await progressiveTailor({
      master,
      jd,
      vendorName: "TestVendor",
      candidateName: "Sri Naidu",
      layoutId: layout.id,
      email: "sri@test.com",
    });
    const bullets = r.structured.sections
      .flatMap((s) => s.lines)
      .filter((l) => /^[•▸→◆]/.test(l.trim()) || /^OP-\d+/.test(l.trim())).length;
    const textLen = r.text.length;
    const page1ish = r.structured.sections
      .slice(0, 3)
      .flatMap((s) => s.lines)
      .join("\n").length;
    const okScore = r.ats.score >= 95;
    const okMissing = r.ats.missingKeywords.length <= 3;
    const okDense = bullets >= 40 && textLen > 8000;
    console.log(
      layout.id,
      "ATS",
      r.ats.score,
      "missing",
      r.ats.missingKeywords.length,
      "bullets",
      bullets,
      "chars",
      textLen,
      "page1ish",
      page1ish
    );
    if (!okScore || !okMissing) fails++;
    if (!okDense && layout.id === "ats_classic") fails++;
  }
  if (fails) {
    console.log("FAILS", fails);
    process.exit(1);
  }
  console.log("ALL DENSE RESUME CHECKS PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
