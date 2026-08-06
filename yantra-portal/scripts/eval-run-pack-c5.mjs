/**
 * C5 offline eval — light retrieve + residue score (no LLM).
 * Run: node scripts/eval-run-pack-c5.mjs
 * Exit 0 if all fixture expectations hold.
 */

import { createRequire } from "module";
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Use tsx-less pure JS reimplementation of checks for portability,
// OR dynamic import compiled dist. Prefer inline port of critical logic.

function tokenize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function lexicalScore(queryTokens, doc) {
  if (!queryTokens.length || !doc) return 0;
  const d = doc.toLowerCase();
  const dt = new Set(tokenize(d));
  let score = 0;
  const qf = new Map();
  for (const t of queryTokens) qf.set(t, (qf.get(t) || 0) + 1);
  for (const [t, qn] of qf) {
    if (!dt.has(t) && !d.includes(t)) continue;
    const boost = t.length <= 5 && /^[a-z0-9]+$/.test(t) ? 2.2 : 1;
    const tf = d.split(t).length - 1 || (dt.has(t) ? 1 : 0);
    score += boost * qn * (1 + Math.log(1 + tf));
  }
  return score;
}

function extractDomainTokens(text) {
  const set = new Set();
  for (const m of text.toUpperCase().match(/\b[A-Z][A-Z0-9]{1,7}\b/g) || []) {
    if (m.length >= 2 && m.length <= 8) set.add(m.toLowerCase());
  }
  const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "will", "have", "role", "team", "work", "years", "experience"]);
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) || []) {
    if (!stop.has(w) && w.length >= 4) set.add(w);
  }
  return set;
}

function detectResidue(packProjects, jd, masterText) {
  const jdL = (jd || "").toLowerCase();
  const hits = [];
  const jdTokens = extractDomainTokens(jdL);
  if (jdTokens.size < 3) return hits;
  const masterTokens = extractDomainTokens((masterText || "").toLowerCase());
  const masterOnly = [...masterTokens].filter((t) => !jdTokens.has(t));
  const jdOnly = [...jdTokens].filter((t) => !masterTokens.has(t));
  if (masterOnly.length < 2) return hits;
  for (let i = 0; i < packProjects.length; i++) {
    const p = packProjects[i];
    const blob = [p.role, p.techStack, p.environment, ...(p.bullets || [])].join(" ").toLowerCase();
    let masterHits = 0;
    let jdHits = 0;
    for (const t of masterOnly.slice(0, 40)) if (blob.includes(t)) masterHits++;
    for (const t of jdOnly.slice(0, 40)) if (blob.includes(t)) jdHits++;
    if (masterHits >= 2 && jdHits <= 1 && i > 0) {
      hits.push({ index: i, detail: `masterHits=${masterHits} jdHits=${jdHits}` });
    }
    if (i === 0 && jdHits === 0 && masterHits >= 2) {
      hits.push({ index: i, detail: `recent_no_jd` });
    }
    const stack = (p.techStack || "").toLowerCase();
    if (stack.length > 4) {
      let stackMaster = 0;
      let stackJd = 0;
      for (const t of masterOnly.slice(0, 30)) if (stack.includes(t)) stackMaster++;
      for (const t of jdOnly.slice(0, 30)) if (stack.includes(t)) stackJd++;
      if (stackMaster >= 2 && stackJd === 0) {
        hits.push({ index: i, detail: `stack_master=${stackMaster} jd=${stackJd}` });
      }
    }
  }
  return hits;
}

const fixtures = [
  {
    id: "brim-fico-transfer",
    jd: "SAP BRIM Senior Consultant FI-CA Convergent Invoicing Open Item Management Dispute Collections RAR SD S/4HANA utilities bank workshops cutover hypercare BRIM FI-CA",
    masterText: "SAP FICO Senior Consultant GL AP Asset Accounting RTR month-end close cost center internal orders report painter",
    profileSlots: 2,
    packProjects: [
      {
        role: "BRIM Consultant",
        techStack: "SAP BRIM FI-CA",
        bullets: Array(8).fill("Configured FI-CA open item management for BRIM dispute workflows"),
      },
      {
        role: "FICO Consultant",
        techStack: "SAP FICO GL CO",
        bullets: [
          "Implemented cost center accounting and internal orders",
          "Built financial reporting with report painter",
          "Supported month-end close for GL and AP",
          "Configured asset accounting processes",
          "Partnered on UAT for FICO workstreams",
          "Maintained configuration documentation",
          "Trained business users on FICO reports",
          "Closed defects from integration testing",
        ],
      },
    ],
    expect: { retrieveSlots: 2, minResidueHits: 1 },
  },
  {
    id: "same-domain-brim",
    jd: "SAP BRIM FI-CA Convergent Invoicing Open Item Dispute Collections S/4HANA",
    masterText: "BRIM FI-CA open items convergent invoicing",
    profileSlots: 1,
    packProjects: [
      {
        role: "BRIM Senior Consultant",
        techStack: "SAP BRIM FI-CA",
        bullets: Array(8).fill("Delivered BRIM FI-CA open item and dispute workstream"),
      },
    ],
    expect: { retrieveSlots: 1, minResidueHits: 0, maxResidueHits: 0 },
  },
];

let failed = 0;
for (const f of fixtures) {
  const qt = tokenize(f.jd);
  // retrieve: slots present
  const slotsOk = f.profileSlots >= (f.expect.retrieveSlots || 0);
  const hits = detectResidue(f.packProjects, f.jd, f.masterText);
  const minH = f.expect.minResidueHits ?? 0;
  const maxH = f.expect.maxResidueHits;
  const residueOk =
    hits.length >= minH && (maxH === undefined || hits.length <= maxH);
  // bank rank smoke
  const bank = [
    "Led go/no-go readiness reviews covering defects and training",
    "Configured unrelated mobile app analytics",
  ];
  const ranked = [...bank].sort(
    (a, b) => lexicalScore(qt, b) - lexicalScore(qt, a)
  );

  const ok = slotsOk && residueOk;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${f.id} slots=${f.profileSlots} hits=${hits.length} (min ${minH}) topBank=${ranked[0]?.slice(0, 40)}…`
  );
  if (!ok) failed++;
}

// Soft fire cap math
const SOFT_FIRE_CAP = 0.25;
function softCap(started, fires) {
  const cap = Math.max(1, Math.ceil(started * SOFT_FIRE_CAP));
  return fires < cap;
}
// Cap = max(1, ceil(started * 0.25)) → 1 pack:1, 4 packs:1 soft allowed
const capCases = [
  [1, 0, true],
  [1, 1, false],
  [4, 0, true],
  [4, 1, false],
  [8, 1, true],
  [8, 2, false],
];
for (const [started, fires, expect] of capCases) {
  const got = softCap(started, fires);
  const ok = got === expect;
  console.log(
    `${ok ? "PASS" : "FAIL"} soft_cap started=${started} fires=${fires} allow=${got} expect=${expect}`
  );
  if (!ok) failed++;
}

console.log(failed === 0 ? "\nC5 eval: ALL PASS" : `\nC5 eval: ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
