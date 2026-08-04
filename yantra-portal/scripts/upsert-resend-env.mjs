/**
 * Upsert Role Forge Vercel env for Resend — everything except RESEND_API_KEY.
 *
 * Usage:
 *   node scripts/upsert-resend-env.mjs
 *   node scripts/upsert-resend-env.mjs --with-key re_xxxxx   # optional later
 */
import fs from "fs";
import path from "path";
import os from "os";

function loadToken() {
  const candidates = [
    path.join(process.env.APPDATA || "", "xdg.data/com.vercel.cli/auth.json"),
    path.join(process.env.APPDATA || "", "com.vercel.cli/Data/auth.json"),
    path.join(os.homedir(), ".local/share/com.vercel.cli/auth.json"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const a = JSON.parse(fs.readFileSync(p, "utf8"));
      if (a.token || a.accessToken) return a.token || a.accessToken;
    } catch {
      /* next */
    }
  }
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  throw new Error("No Vercel token — run npx vercel login");
}

const token = loadToken();
const teamId = "team_CAoUe5JL61nN9hKqbw8LUYCP";
const projectId = "prj_CBiLBUVkfpvMTkJZjPvVBLGTcn1g";

/** Non-secret values ready for live mail once key is added */
const READY_ENV = {
  EMAIL_FROM: "Role Forge <noreply@contact.srsoftllc.com>",
  EMAIL_DRY_RUN: "false",
  // Yantra aliases kept for parity / future features
  RESEND_FROM_EMAIL: "noreply@contact.srsoftllc.com",
  // Optional ops — leave empty string to skip? Better omit empty.
};

const optionalFromArg = process.argv.includes("--with-key");
let withKey = null;
if (optionalFromArg) {
  const i = process.argv.indexOf("--with-key");
  withKey = process.argv[i + 1];
  if (!withKey || !withKey.startsWith("re_")) {
    console.error("--with-key requires a Resend key starting with re_");
    process.exit(1);
  }
}

async function api(method, urlPath, body) {
  const url = `https://api.vercel.com${urlPath}${
    urlPath.includes("?") ? "&" : "?"
  }teamId=${teamId}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, data };
}

const list = await api("GET", `/v9/projects/${projectId}/env`);
if (!list.ok) {
  console.error("list env failed", list.status, list.data);
  process.exit(1);
}

const byKey = new Map();
for (const e of list.data.envs || []) {
  const arr = byKey.get(e.key) || [];
  arr.push(e);
  byKey.set(e.key, arr);
}

async function upsert(key, value, targets = ["production", "preview", "development"]) {
  const existing = byKey.get(key) || [];
  // Sensitive vars cannot change type via PATCH — delete all rows then recreate
  for (const e of existing) {
    await api("DELETE", `/v9/projects/${projectId}/env/${e.id}`);
  }
  const r = await api("POST", `/v10/projects/${projectId}/env`, {
    key,
    value,
    type: "encrypted",
    target: targets,
  });
  console.log(
    r.ok ? (existing.length ? "REPLACED" : "CREATED") : "FAIL",
    key,
    r.ok ? "" : JSON.stringify(r.data?.error || r.data)
  );
  return r.ok;
}

console.log("Upserting Resend-ready env (no secret key unless --with-key)…\n");

for (const [k, v] of Object.entries(READY_ENV)) {
  await upsert(k, v);
}

if (withKey) {
  await upsert("RESEND_API_KEY", withKey);
  console.log("\nRESEND_API_KEY set — redeploy production to go live.");
} else {
  console.log(`
────────────────────────────────────────────────────────
Ready for RESEND_API_KEY

Vercel project: roleforge
Set next (one of):

  1) Dashboard → roleforge → Settings → Environment Variables
     RESEND_API_KEY = re_…   (Production + Preview)

  2) CLI:
     node scripts/upsert-resend-env.mjs --with-key re_YOUR_KEY

  3) Then redeploy:
     git push / Vercel Redeploy

EMAIL_FROM  = Role Forge <noreply@contact.srsoftllc.com>
EMAIL_DRY_RUN = false
Domain      = contact.srsoftllc.com  (same as Yantra — must be verified in Resend)
────────────────────────────────────────────────────────
`);
}
