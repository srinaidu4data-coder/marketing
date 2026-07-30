/**
 * Live demo of Role Forge Resume Engine v2
 * Run: node scripts/demo.mjs
 * Requires: next start on :3000 and seeded DB
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = (csrfRes.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]);
  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: "/",
    json: "true",
  });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies.join("; "),
    },
    body,
    redirect: "manual",
  });
  const set = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]);
  const all = [...cookies, ...set].join("; ");
  const session = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: all },
  }).then((r) => r.json());
  return { session, cookie: all };
}

function hr(title) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

async function main() {
  hr("1. HEALTH");
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log(health);

  hr("2. ADMIN LOGIN");
  const admin = await login("admin@srsoft.com", "admin123");
  console.log(admin.session.user);

  hr("3. EMPLOYEE LOGIN (Sowmya)");
  const emp = await login("sowmya@srsoftllc.com", "employee123");
  console.log(emp.session.user);

  hr("4. CANDIDATE LAYOUTS (diverse — not one format)");
  const candidates = await prisma.candidate.findMany({
    take: 8,
    orderBy: { name: "asc" },
    select: { name: true, layoutId: true, exportFormat: true },
  });
  console.table(candidates);

  const pool = await prisma.allocation.findMany({
    where: { employee: { email: "sowmya@srsoftllc.com" } },
    include: { candidate: true },
    take: 2,
  });
  if (pool.length < 2) throw new Error("Need at least 2 allocated candidates for demo");
  const picks = pool.map((a) => a.candidate);
  console.log(
    "Using for chain:",
    picks.map((c) => `${c.name} [${c.layoutId}]`)
  );

  hr("5. GENERATE CHAIN — SAP S/4HANA FICO JD");
  const jd = `Job Title: SAP S/4HANA FICO Functional Consultant
Looking for SAP FICO consultant with S/4HANA, GL, AP, AR, Asset Accounting.
Must have month-end close, integrations, and stakeholder management.
6-month C2C contract, remote US. Experience with SAP Activate preferred.`;

  const createRes = await fetch(`${BASE}/api/chains`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: emp.cookie,
    },
    body: JSON.stringify({
      rawJobText: jd,
      vendorName: "DemoVendor",
      vendorEmail: "demo.vendor@example.com",
      candidateIds: picks.map((c) => c.id),
      employeeNote: "Demo submission from Role Forge walkthrough",
    }),
  });
  const created = await createRes.json();
  console.log("HTTP", createRes.status, created);
  if (!created.id) {
    console.error("Chain create failed");
    process.exit(1);
  }
  const chainId = created.id;

  hr("6. RESULTS — layout + ATS + files + preview");
  const chain = await prisma.chain.findUnique({
    where: { id: chainId },
    include: { candidates: { include: { candidate: true } } },
  });
  console.log(`Vendor: ${chain.vendorName} <${chain.vendorEmail}>  Status: ${chain.status}`);

  for (const cc of chain.candidates) {
    console.log("\n---");
    console.log(`Candidate : ${cc.candidate.name}`);
    console.log(`Layout    : ${cc.layoutId}`);
    console.log(`Job title : ${cc.jobTitle}`);
    console.log(
      `ATS score : ${cc.atsScore}/100 ${cc.atsReady ? "✅ READY (≥95)" : "⚠ REVIEW"}`
    );
    console.log(`DOCX      : ${cc.docxPath ? "yes" : "no"}`);
    console.log(`PDF       : ${cc.pdfPath ? "yes" : "no"}`);
    console.log(`Fingerprint: ${cc.skillFingerprint.slice(0, 90)}…`);
    console.log("Preview:\n" + cc.tailoredResumeText.slice(0, 700));
  }

  // Save one preview file for user
  if (chain.candidates[0]) {
    const out = `demo-preview-${chain.candidates[0].candidate.name.replace(/\s+/g, "_")}.txt`;
    writeFileSync(out, chain.candidates[0].tailoredResumeText);
    console.log(`\nSaved full resume preview → ${out}`);
  }

  hr("7. SEND — write vendor submission ledger");
  for (const cc of chain.candidates) {
    await prisma.chainCandidate.update({
      where: { id: cc.id },
      data: { sendStatus: "SENT" },
    });
    await prisma.vendorSubmission.create({
      data: {
        candidateId: cc.candidateId,
        vendorEmail: chain.vendorEmail.toLowerCase(),
        vendorName: chain.vendorName,
        jobTitle: cc.jobTitle || "SAP S/4HANA FICO",
        skillFingerprint: cc.skillFingerprint || "fico",
        chainId: chain.id,
        employeeId: chain.employeeId,
      },
    });
  }
  await prisma.chain.update({ where: { id: chainId }, data: { status: "SENT" } });
  console.log(`Marked SENT + ledger rows for ${chain.candidates.length} candidates`);

  hr("8. HARD BLOCK — same vendor, DIFFERENT skill (ABAP/BTP)");
  const jdAbap = `Job Title: SAP ABAP / BTP Developer
Need ABAP developer with RAP, CDS views, OData, and SAP BTP experience.
S/4HANA extensions, Fiori elements. 12 months C2C.`;

  const blockRes = await fetch(`${BASE}/api/chains`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: emp.cookie,
    },
    body: JSON.stringify({
      rawJobText: jdAbap,
      vendorName: "DemoVendor",
      vendorEmail: "demo.vendor@example.com",
      candidateIds: picks.map((c) => c.id),
    }),
  });
  const blocked = await blockRes.json();
  console.log("HTTP", blockRes.status);
  console.log(JSON.stringify(blocked, null, 2));
  if (blockRes.status === 409 && blocked.error === "VENDOR_SKILL_CONFLICT") {
    console.log("\n✅ HARD BLOCK worked — vendor would not get multi-skill resumes for same people");
  } else {
    console.log("\n⚠ Expected 409 VENDOR_SKILL_CONFLICT");
  }

  hr("9. SAME skill re-submit to same vendor (should be ALLOWED)");
  const sameRes = await fetch(`${BASE}/api/chains`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: emp.cookie,
    },
    body: JSON.stringify({
      rawJobText: jd,
      vendorName: "DemoVendor",
      vendorEmail: "demo.vendor@example.com",
      candidateIds: [picks[0].id],
    }),
  });
  const same = await sameRes.json();
  console.log("HTTP", sameRes.status, same);
  if (same.id) {
    console.log("✅ Same-skill resubmit allowed (new chain", same.id + ")");
  }

  hr("DEMO COMPLETE — open UI");
  console.log(`
Browser walkthrough:
  1. http://localhost:3000/login
  2. Admin  admin@srsoft.com / admin123  → Candidates (see layouts)
  3. Employee  sowmya@srsoftllc.com / employee123
  4. Your Chains → open chain ${chainId}
  5. See ATS scores, layouts, DOCX downloads
  6. Try New Chain to demo.vendor@example.com with ABAP JD → block popup
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
