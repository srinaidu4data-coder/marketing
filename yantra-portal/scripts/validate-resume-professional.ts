import { progressiveTailor } from "../src/lib/resume/progressive-tailor";

const master = `Sri Naidu
SAP Consultant | 12+ years
Dallas, TX | United States
srinaidu582@gmail.com | +1 (469) 555-0199
linkedin.com/in/srinaidu

EXPERIENCE
Senior SAP Consultant — Acme Pharma LLC (2019–Present)
- Led MDG

TECHNICAL SKILLS
SAP MDG, S/4HANA, ABAP, Fiori`;

const jd = `Job Title: SAP MDG Technical Consultant
Need SAP MDG, S/4HANA, ABAP, Fiori, IDOC.
Rate: $80/hr. Who is available for interview?`;

async function main() {
  const r = await progressiveTailor({
    master,
    jd,
    vendorName: "IT",
    candidateName: "Sri Naidu",
    layoutId: "consultant_band",
    email: "fallback@x.com",
  });
  const text = r.text;
  const checks: [boolean, string][] = [
    [/srinaidu582@gmail\.com/i.test(r.structured.contactLine), "email from master in contact"],
    [/469/.test(r.structured.contactLine), "phone from master in contact"],
    [/Dallas/i.test(r.structured.contactLine), "location from master"],
    [/linkedin\.com\/in\/srinaidu/i.test(r.structured.contactLine), "linkedin from master"],
    [r.structured.headline.includes("MDG"), "role title from JD"],
    [!/SITUATION:|COMPLICATION:|QUESTION:|PREVIEW:/i.test(text), "no SCQA sales chatter"],
    [!/OP-\d+/i.test(text), "no OP-01 labels"],
    [!/\$80|Rate:|Who is available|80\s*\/\s*hr/i.test(text), "no rate/interview noise"],
    [!/near-100%|first-pass recruiter|JD MATCH|JD-aligned|\bROLE\s*::/i.test(text), "no JD/ROLE meta labels"],
    [!/\bSAP\s+S\b(?!\/)/i.test(text), "no broken SAP S token"],
    [r.structured.sections.some((s) => s.heading === "Key Achievements"), "Key Achievements section"],
  ];

  const tech = await progressiveTailor({
    master,
    jd,
    vendorName: "IT",
    candidateName: "Sri Naidu",
    layoutId: "technical_dense",
    email: "srinaidu582@gmail.com",
  });
  const techText = tech.text;
  checks.push(
    [!/JD MATCH|Near-100%|ROLE\s*::|80\s*\/\s*hr|JD-aligned/i.test(techText), "tech layout clean of noise"],
    [!/\bSAP\s+S\b(?!\/4)/i.test(techText), "tech layout no SAP S fragment"]
  );
  let fails = 0;
  for (const [ok, label] of checks) {
    console.log(ok ? "PASS" : "FAIL", label);
    if (!ok) fails++;
  }
  console.log("CONTACT:", r.structured.contactLine);
  console.log("HEADLINE:", r.structured.headline);
  if (fails) process.exit(1);
  console.log("ALL PROFESSIONAL RESUME CHECKS PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
