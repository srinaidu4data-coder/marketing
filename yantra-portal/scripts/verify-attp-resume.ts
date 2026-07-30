import { progressiveTailor } from "../src/lib/resume/progressive-tailor";
import { extractJdKeywords, extractJobTitle, detectDomain } from "../src/lib/resume/jd-parse";
import { renderDocxBuffer } from "../src/lib/resume/render-docx";
import { writeFileSync } from "fs";

const jd = `
Job Title: SAP ATTP Techno-Functional Consultant
Location: FOSTER CITY - REMOTE PREFERRED, SOME OCCASIONAL TRAVEL
Duration: Long Term Contract
Interview Mode: Video

Need someone with SAP ATTP Track and Trace experience, serialization, GS1, EPCIS, DSCSA.
Pharma life sciences background preferred. Integration with supply chain systems.
`;

async function main() {
  const title = extractJobTitle(jd);
  const kws = extractJdKeywords(jd);
  const domain = detectDomain(jd, title);
  console.log({ title, domain, kws });

  const noise = kws.filter((k) =>
    /location|foster|remote|travel|duration|contract|interview|someone|preferred|occasional|city/i.test(
      k
    )
  );
  console.log("noise in keywords (should be empty):", noise);

  const r = await progressiveTailor({
    master:
      "Sri\nSAP Consultant | 12+ years\nTECHNICAL SKILLS\nSAP ATTP, Serialization, GS1, EPCIS, Track and Trace, Integration",
    jd,
    vendorName: "IT",
    candidateName: "Sri",
    email: "srinaidu582@gmail.com",
    layoutId: "consultant_band",
  });

  const skillsSec = r.structured.sections.find((s) => s.heading === "Technical Skills");
  console.log("\nTECHNICAL SKILLS:\n", skillsSec?.lines.join("\n"));

  const exp = r.structured.sections.find((s) => s.heading === "Professional Experience")!;
  const counts: number[] = [];
  let bi = 0;
  for (const line of exp.lines) {
    if (/Era:/i.test(line)) {
      if (bi) counts.push(bi);
      bi = 0;
    }
    if (/^[•▸→–\-]/.test(line.trim())) bi++;
  }
  if (bi) counts.push(bi);

  const badPhrases = [
    "FOSTER",
    "REMOTE PREFERRED",
    "Interview Mode",
    "finance/logistics",
    "GL/AP/AR",
    "Enterprise Client (Recent)",
  ];
  const hits = badPhrases.filter((p) => r.text.toUpperCase().includes(p.toUpperCase()));

  console.log({
    bulletsPerProject: counts,
    totalLines: r.text.split("\n").length,
    ats: r.ats.score,
    badPhraseHits: hits,
    preview: r.text.slice(0, 1200),
  });

  const buf = await renderDocxBuffer(r.structured);
  writeFileSync("scripts/sample-sri-attp-fixed.docx", buf);
  console.log("Wrote scripts/sample-sri-attp-fixed.docx", buf.length, "bytes");

  if (noise.length || hits.length || counts.some((c) => c < 12)) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
