/**
 * Probe production for latest deploy markers.
 */
const hosts = [
  "https://roleforge-tau.vercel.app",
  "https://roleforge.vercel.app",
];

async function head(url) {
  const r = await fetch(url, { method: "HEAD", redirect: "follow" });
  return {
    url,
    status: r.status,
    lastModified: r.headers.get("last-modified"),
    age: r.headers.get("age"),
    cache: r.headers.get("x-vercel-cache"),
    etag: r.headers.get("etag"),
  };
}

async function findPsych(base) {
  const r = await fetch(base + "/login", { redirect: "follow" });
  const html = await r.text();
  const m = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/);
  const buildId = m?.[1] || null;
  const scripts = [...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map(
    (x) => x[0]
  );
  const unique = [...new Set(scripts)].slice(0, 40);
  let foundIn = null;
  for (const s of unique) {
    try {
      const js = await (await fetch(base + s)).text();
      if (
        /Psych|psychScore|chain-packs-table|Full resume preview|Full resume —/.test(
          js
        )
      ) {
        foundIn = s;
        break;
      }
    } catch {
      /* skip */
    }
  }
  return { buildId, scriptCount: unique.length, foundIn };
}

for (const h of hosts) {
  try {
    const hinfo = await head(h);
    console.log("HEAD", JSON.stringify(hinfo));
    const probe = await findPsych(h);
    console.log("PROBE", h, JSON.stringify(probe));
  } catch (e) {
    console.log("ERR", h, e.message);
  }
}
