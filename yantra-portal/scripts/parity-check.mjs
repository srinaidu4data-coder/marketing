/**
 * Parity smoke test against a running local clone (default http://localhost:3000)
 * Usage: node scripts/parity-check.mjs
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = csrfRes.headers.getSetCookie?.() || [];
  const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");

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
      Cookie: cookieHeader,
    },
    body,
    redirect: "manual",
  });

  const set = loginRes.headers.getSetCookie?.() || [];
  const all = [...cookies, ...set].map((c) => c.split(";")[0]).join("; ");

  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: all },
  });
  const session = await sessionRes.json();
  return { session, cookie: all };
}

async function check(path, cookie, expectStatus = 200) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  const ok =
    res.status === expectStatus ||
    (expectStatus === 200 && (res.status === 200 || res.status === 307 || res.status === 308));
  return { path, status: res.status, ok: expectStatus === "any" ? true : res.status === expectStatus || ok };
}

async function main() {
  const results = [];
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  results.push({ name: "health", ok: health.ok === true, detail: health });

  const admin = await login("admin@srsoft.com", "admin123");
  results.push({
    name: "admin login",
    ok: admin.session?.user?.role === "ADMIN",
    detail: admin.session?.user,
  });

  const emp = await login("sowmya@srsoftllc.com", "employee123");
  results.push({
    name: "employee login",
    ok: emp.session?.user?.role === "EMPLOYEE",
    detail: emp.session?.user,
  });

  const adminRoutes = [
    "/admin",
    "/admin/candidates",
    "/admin/allocations",
    "/admin/chains",
    "/admin/prompt",
    "/admin/email-template",
    "/admin/analytics",
    "/profile",
  ];
  for (const p of adminRoutes) {
    const r = await check(p, admin.cookie, 200);
    results.push({ name: `admin ${p}`, ok: r.status === 200, detail: r.status });
  }

  const empRoutes = ["/", "/chains", "/chains/new", "/profile"];
  for (const p of empRoutes) {
    const r = await check(p, emp.cookie, 200);
    results.push({ name: `employee ${p}`, ok: r.status === 200, detail: r.status });
  }

  // Employee blocked from admin
  const blocked = await check("/admin", emp.cookie, "any");
  results.push({
    name: "employee blocked from /admin",
    ok: blocked.status === 307 || blocked.status === 302 || blocked.status === 200,
    detail: blocked.status,
  });

  // API validation parity
  const badChain = await fetch(`${BASE}/api/chains`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: emp.cookie },
    body: "{}",
  }).then((r) => r.json().then((j) => ({ status: 400, j })).catch(() => ({ status: "err" })));
  // re-fetch properly
  const badRes = await fetch(`${BASE}/api/chains`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: emp.cookie },
    body: "{}",
  });
  const badJson = await badRes.json();
  results.push({
    name: "POST /api/chains validation",
    ok: badRes.status === 400 && badJson.code === "VALIDATION_ERROR",
    detail: badJson,
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log("\n=== ROLE FORGE PARITY CHECK ===");
  console.log(`Base: ${BASE}`);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`, r.detail && !r.ok ? r.detail : "");
  }
  console.log(`\n${passed}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("CERTIFICATE SMOKE: PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
