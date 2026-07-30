/**
 * Probe live Yantra for Resend-related strings in pages / JS bundles.
 */
const BASE = "https://yantra-mvp-gray.vercel.app";

async function login() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = csrfRes.headers.getSetCookie?.() || [];
  // Node fetch may not expose set-cookie the same way; use cookie jar manually
  const jar = new Map();
  const takeCookies = (res) => {
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  takeCookies(csrfRes);
  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      csrfToken,
      email: "admin@srsoft.com",
      password: "admin123",
      json: "true",
      callbackUrl: `${BASE}/admin`,
    }),
    redirect: "manual",
  });
  takeCookies(loginRes);
  return cookieHeader();
}

async function main() {
  const cookie = await login();
  console.log("cookie length", cookie.length);

  const pages = [
    "/admin/settings",
    "/admin/email-template",
    "/admin/queues",
    "/admin",
  ];
  const re =
    /RESEND[A-Z0-9_]*|EMAIL_[A-Z0-9_]+|from@[a-z0-9.-]+|@resend\.dev|resend\.com|api\.resend/gi;

  for (const p of pages) {
    const res = await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } });
    const text = await res.text();
    const hits = [...text.matchAll(re)].map((m) => m[0]);
    console.log(p, res.status, "hits", [...new Set(hits)]);
    const scripts = [...text.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map(
      (m) => m[0]
    );
    const unique = [...new Set(scripts)];
    console.log("  scripts", unique.length);
    for (const js of unique.slice(0, 80)) {
      try {
        const jr = await fetch(`${BASE}${js}`);
        const body = await jr.text();
        if (/resend|RESEND|EMAIL_FROM|@resend/i.test(body)) {
          console.log("  JS HIT", js);
          const snips = [...body.matchAll(/.{0,50}(?:resend|RESEND_API|EMAIL_FROM|@resend)[^"'`\s]*.{0,50}/gi)]
            .slice(0, 12)
            .map((m) => m[0].replace(/\s+/g, " "));
          for (const s of snips) console.log("   ", s);
        }
      } catch (e) {
        /* ignore */
      }
    }
  }

  // API probes
  for (const p of [
    "/api/settings",
    "/api/email",
    "/api/resend",
    "/api/config",
    "/api/admin/email",
    "/api/send",
  ]) {
    const res = await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } });
    const t = await res.text();
    console.log("API", p, res.status, t.slice(0, 120).replace(/\s+/g, " "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
