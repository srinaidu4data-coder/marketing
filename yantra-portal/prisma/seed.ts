import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEFAULT_EMAIL_BODY,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_PROMPT,
} from "../src/lib/constants";
import { layoutForIndex } from "../src/lib/resume/templates";

const prisma = new PrismaClient();

const candidates = [
  { name: "INDU NELLUTLA", email: "inwork.0813@gmail.com" },
  { name: "Sindhu Varma", email: "sindhuvarma0601@gmail.com" },
  { name: "Akshaya Bathina", email: "akshaya6158@gmail.com" },
  { name: "BHARATH GANNI", email: "bharathganni92@gmail.com" },
  { name: "SAMIUDDIN MOHAMMED", email: "Samiuddinmohammed15270@gmail.com" },
  { name: "Phanendra Goud", email: "phanendrap21@gmail.com" },
  { name: "Gurram Krishna Vamsi", email: "gurramkrishnavamsi979@gmail.com" },
  { name: "Tejaswini Sarva", email: "tejaswinipatels98@gmail.com" },
  { name: "Rohit Reddy", email: "rohitreddykesireddy1@gmail.com" },
  { name: "Prudhvi Chowdary", email: "prudhvichowdary.sap@gmail.com" },
  { name: "Lokesh Reddy Veerabhadra", email: "veerabhadralokeshreddy@gmail.com" },
  { name: "Meenakshi Bapanapalli", email: "meenakshibapanapalli@gmail.com" },
  { name: "Tejaswini Shamala", email: "officialconnect.mailbox@gmail.com" },
  { name: "Kadem Sangeeth", email: "kademsangeeth9@gmail.com" },
  { name: "Aparna Thippani", email: "aparna.thippani93@gmail.com" },
  { name: "Divyesh Aannavarapu", email: "divyesh.annavarapu@gmail.com" },
  { name: "Jayanthi Sai Tanay", email: "jayanthisaitanay@gmail.com" },
  { name: "Sri", email: "srinaidu582@gmail.com" },
  { name: "Sudhir", email: "sap.nsudhir@gmail.com" },
  { name: "sample", email: "sap.nsudhir+1@gmail.com" },
];

function masterText(name: string) {
  return `${name}
SAP Consultant | 10+ years

PROFESSIONAL SUMMARY
Experienced SAP consultant with end-to-end implementation and support experience across FI/CO, MM, and SD modules. Delivered greenfield and brownfield S/4HANA programs for US clients on C2C/CTC models.

TECHNICAL SKILLS
SAP S/4HANA, SAP FICO, GL, AP, AR, Asset Accounting, Controlling, MM, SD, OTC, P2P, Integration, LSMW, BAPI, IDoc, Agile, SAP Activate

EXPERIENCE
Senior SAP Consultant — Meridian Manufacturing Group (2019–Present)
- Led full-lifecycle SAP FICO implementations for manufacturing and services clients
- Configured GL, AP, AR, Asset Accounting and month-end close processes
- Partnered with vendors and end clients on requirements, testing, and cutover

SAP Functional Consultant — Northstar Consumer Products (2016–2019)
- Supported AMS tickets, enhancements, and integration defects
- Documented functional specs and trained business users

SAP Associate Consultant — Apex Industrial Services (2014–2016)
- Assisted seniors with configuration, testing, and documentation
`;
}

async function main() {
  await prisma.chainCandidate.deleteMany();
  await prisma.chain.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.apiUsageLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.promptVersion.deleteMany();
  await prisma.emailTemplateVersion.deleteMany();
  await prisma.user.deleteMany();

  const adminHash = await bcrypt.hash("admin123", 10);
  const empHash = await bcrypt.hash("employee123", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@srsoft.com",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });

  const sowmya = await prisma.user.create({
    data: {
      name: "Sowmya",
      email: "sowmya@srsoftllc.com",
      passwordHash: empHash,
      role: "EMPLOYEE",
    },
  });

  const akanksha = await prisma.user.create({
    data: {
      name: "Akanksha",
      email: "akanksha@srsoftllc.com",
      passwordHash: empHash,
      role: "EMPLOYEE",
    },
  });

  const createdCandidates = [];
  let i = 0;
  for (const c of candidates) {
    const row = await prisma.candidate.create({
      data: {
        name: c.name,
        email: c.email,
        masterResumeText: masterText(c.name),
        masterResumePath: `uploads/masters/${c.name.replace(/\s+/g, "_")}.txt`,
        layoutId: layoutForIndex(i),
        exportFormat: i % 3 === 0 ? "DOCX_PDF" : "DOCX",
      },
    });
    createdCandidates.push(row);
    i++;
  }

  // Allocate first 14 to Sowmya (matches live pool size)
  const sowmyaPool = createdCandidates.slice(0, 14);
  for (const c of sowmyaPool) {
    await prisma.allocation.create({
      data: { candidateId: c.id, employeeId: sowmya.id },
    });
  }
  // Allocate a few to Akanksha
  for (const c of createdCandidates.slice(14, 18)) {
    await prisma.allocation.create({
      data: { candidateId: c.id, employeeId: akanksha.id },
    });
  }

  await prisma.promptVersion.create({
    data: { content: DEFAULT_PROMPT, status: "ACTIVE", tested: true },
  });
  await prisma.promptVersion.create({
    data: {
      content: DEFAULT_PROMPT + "\n\n// prior version note: aggressive match mode",
      status: "ARCHIVED",
      tested: true,
    },
  });

  await prisma.emailTemplateVersion.create({
    data: { type: "SUBJECT", content: DEFAULT_EMAIL_SUBJECT, status: "ACTIVE" },
  });
  await prisma.emailTemplateVersion.create({
    data: {
      type: "SUBJECT",
      content: "{{candidate_name}} — {{job_title_or_vendor_line}}",
      status: "ARCHIVED",
    },
  });
  await prisma.emailTemplateVersion.create({
    data: { type: "BODY", content: DEFAULT_EMAIL_BODY, status: "ACTIVE" },
  });
  await prisma.emailTemplateVersion.create({
    data: {
      type: "BODY",
      content: DEFAULT_EMAIL_BODY.replace("our Consultant ", ""),
      status: "ARCHIVED",
    },
  });

  // Sample chains for Sowmya
  const sampleVendors = [
    { name: "itchirag", email: "itchirag80@gmail.com", status: "FAILED" },
    { name: "gopalk", email: "gopalk.t@ipolarityllc.com", status: "SENT" },
    { name: "praveenj", email: "praveenj@livemindz.com", status: "SENT" },
    { name: "palia", email: "palia@gritorasol.com", status: "SENT" },
    { name: "munisowmya", email: "munisowmya@livemindz.com", status: "SENT" },
  ];

  for (const v of sampleVendors) {
    const chain = await prisma.chain.create({
      data: {
        employeeId: sowmya.id,
        vendorName: v.name,
        vendorEmail: v.email,
        rawJobText:
          "Looking for SAP FICO consultant with S/4HANA, GL, AP, AR experience. 6-month C2C contract, remote US.",
        status: v.status,
      },
    });
    const picks = sowmyaPool.slice(0, 2);
    for (const c of picks) {
      await prisma.chainCandidate.create({
        data: {
          chainId: chain.id,
          candidateId: c.id,
          tailoredResumeText: masterText(c.name) + `\n\n[Tailored for ${v.name}]`,
          sendStatus: v.status === "SENT" ? "SENT" : v.status === "FAILED" ? "FAILED" : "PENDING",
        },
      });
    }
  }

  // A READY chain for Akanksha
  const ready = await prisma.chain.create({
    data: {
      employeeId: akanksha.id,
      vendorName: "keerthi",
      vendorEmail: "keerthi@vysystems.com",
      rawJobText: "SAP MM / P2P specialist needed for manufacturing client.",
      status: "READY",
    },
  });
  if (createdCandidates[14]) {
    await prisma.chainCandidate.create({
      data: {
        chainId: ready.id,
        candidateId: createdCandidates[14].id,
        tailoredResumeText: masterText(createdCandidates[14].name),
        sendStatus: "PENDING",
      },
    });
  }

  await prisma.apiUsageLog.createMany({
    data: [
      {
        employeeId: sowmya.id,
        operation: "resume_tailor",
        tokensIn: 1200,
        tokensOut: 800,
        costUsd: 0.01,
      },
      {
        employeeId: sowmya.id,
        operation: "resume_tailor",
        tokensIn: 1100,
        tokensOut: 750,
        costUsd: 0.009,
      },
    ],
  });

  console.log("Seed complete:");
  console.log("  Admin: admin@srsoft.com / admin123");
  console.log("  Employee: sowmya@srsoftllc.com / employee123");
  console.log("  Employee: akanksha@srsoftllc.com / employee123");
  console.log(`  Candidates: ${createdCandidates.length}`);
  console.log(`  Admin id: ${admin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
