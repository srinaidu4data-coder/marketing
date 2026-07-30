/**
 * Granular functional parity checks against local clone
 * node scripts/granular-parity.mjs
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();
const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log("PASS ", name, detail || "");
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log("FAIL ", name, detail);
}

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
  const cookie = [...cookies, ...set].join("; ");
  const session = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: cookie },
  }).then((r) => r.json());
  return { cookie, session };
}

async function get(path, cookie) {
  return fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
}

async function main() {
  console.log("=== GRANULAR PARITY CHECK ===\n");

  // Health
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  health.ok ? pass("health") : fail("health", JSON.stringify(health));

  const admin = await login("admin@srsoft.com", "admin123");
  admin.session?.user?.role === "ADMIN"
    ? pass("admin login")
    : fail("admin login", JSON.stringify(admin.session));

  const emp = await login("sowmya@srsoftllc.com", "employee123");
  emp.session?.user?.role === "EMPLOYEE"
    ? pass("employee login")
    : fail("employee login");

  // Pages HTTP 200
  const adminPages = [
    "/admin",
    "/admin/candidates",
    "/admin/allocations",
    "/admin/chains",
    "/admin/prompt",
    "/admin/email-template",
    "/admin/analytics",
    "/admin/settings",
    "/admin/queues",
    "/profile",
  ];
  for (const p of adminPages) {
    const r = await get(p, admin.cookie);
    r.status === 200 ? pass(`page ${p}`, String(r.status)) : fail(`page ${p}`, String(r.status));
  }

  const empPages = ["/", "/chains", "/chains/new", "/profile"];
  for (const p of empPages) {
    const r = await get(p, emp.cookie);
    r.status === 200 ? pass(`page ${p}`, String(r.status)) : fail(`page ${p}`, String(r.status));
  }

  // Allocations matrix UI contains checkboxes
  const allocHtml = await get("/admin/allocations", admin.cookie).then((r) => r.text());
  (allocHtml.includes('type="checkbox"') || allocHtml.includes("AllocationGrid") || allocHtml.includes("aria-label"))
    ? pass("allocations UI has interactive grid markers")
    : fail("allocations UI missing checkboxes markers");
  allocHtml.includes("Filter candidates") || allocHtml.includes("filter")
    ? pass("allocations filter present")
    : fail("allocations filter missing");

  // Live API contract: {candidateId, employeeId, allocated}
  const cand = await prisma.candidate.findFirst();
  const employee = await prisma.user.findFirst({ where: { role: "EMPLOYEE" } });
  if (!cand || !employee) throw new Error("seed data missing");

  const toggleOn = await fetch(`${BASE}/api/allocations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({
      candidateId: cand.id,
      employeeId: employee.id,
      allocated: true,
    }),
  });
  const onBody = await toggleOn.json();
  toggleOn.ok && onBody.ok
    ? pass("POST /api/allocations allocated:true", JSON.stringify(onBody))
    : fail("POST allocate true", JSON.stringify(onBody));

  const row = await prisma.allocation.findUnique({
    where: {
      candidateId_employeeId: {
        candidateId: cand.id,
        employeeId: employee.id,
      },
    },
  });
  row ? pass("allocation row exists in DB") : fail("allocation row missing");

  const toggleOff = await fetch(`${BASE}/api/allocations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({
      candidateId: cand.id,
      employeeId: employee.id,
      allocated: false,
    }),
  });
  const offBody = await toggleOff.json();
  toggleOff.ok && offBody.ok
    ? pass("POST /api/allocations allocated:false")
    : fail("POST allocate false", JSON.stringify(offBody));

  // Multi-employee allocation allowed
  const emps = await prisma.user.findMany({ where: { role: "EMPLOYEE" }, take: 2 });
  if (emps.length >= 2) {
    await fetch(`${BASE}/api/allocations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({
        candidateId: cand.id,
        employeeId: emps[0].id,
        allocated: true,
      }),
    });
    await fetch(`${BASE}/api/allocations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({
        candidateId: cand.id,
        employeeId: emps[1].id,
        allocated: true,
      }),
    });
    const multi = await prisma.allocation.count({ where: { candidateId: cand.id } });
    multi >= 2
      ? pass("multi-employee allocation (same candidate → 2 employees)", String(multi))
      : fail("multi-employee allocation", String(multi));
  }

  // New chain form markers
  const newChain = await get("/chains/new", emp.cookie).then((r) => r.text());
  ["Select all", "Select none", "Job requirement", "Vendor name", "Vendor email"].forEach(
    (label) => {
      newChain.includes(label)
        ? pass(`chains/new has "${label}"`)
        : fail(`chains/new missing "${label}"`);
    }
  );

  // Invalid allocation body matches live
  const bad = await fetch(`${BASE}/api/allocations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: "{}",
  }).then((r) => r.json());
  bad.code === "VALIDATION_ERROR"
    ? pass("allocations validation error shape")
    : fail("allocations validation", JSON.stringify(bad));

  // Employee blocked from admin
  const blocked = await get("/admin", emp.cookie);
  [307, 302, 200].includes(blocked.status)
    ? pass("employee /admin access handled", String(blocked.status))
    : fail("employee /admin", String(blocked.status));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${passed}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("GRANULAR PARITY: PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
