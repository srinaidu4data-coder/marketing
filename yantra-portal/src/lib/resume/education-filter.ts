/**
 * Education / certifications for packs.
 *
 * Policy:
 * - Degrees & academic credentials: always keep when present on master (honest).
 * - Certificates / licenses: must be JD-relevant. Prefer a small AI check when
 *   OpenAI is configured; fall back to domain/keyword heuristics offline.
 *
 * Never invent education or certs — only filter master (or master-grounded AI) lines.
 */

import { getOpenAiConfig } from "./openai-config";
import type { DomainHint } from "./jd-parse";

export type EducationLineKind = "degree" | "cert" | "other";

export type EducationFilterResult = {
  /** Lines to put on the pack (degrees first, then relevant certs). */
  lines: string[];
  degrees: string[];
  certsKept: string[];
  certsDropped: { line: string; reason: string }[];
  /** How cert relevance was decided */
  certFilter: "ai" | "heuristic" | "none";
};

const DEGREE_RE =
  /\b(bachelor|bachelors|b\.?\s*s\.?|b\.?\s*a\.?|b\.?\s*e\.?|b\.?\s*tech|master|masters|m\.?\s*s\.?|m\.?\s*a\.?|m\.?\s*b\.?\s*a\.?|m\.?\s*tech|ph\.?\s*d|doctorate|associate(?:'s)?\s+degree|diploma\s+in|university|college|bsc|msc|mba|mca|be\b|btech|mtech)\b/i;

const CERT_RE =
  /\b(certif(?:ied|ication|icate)s?|license[ds]?|licensure|accredited|credential|PMP\b|CSCP|CISSP|AWS\s|Azure\s|Google\s+Cloud|Salesforce|CDMP|CCRP|SOCRA|ACRP|CDISC|SAS\s+Certified|TERP|TS4|C_TS|SAP\s+Certified|OpenSAP)\b/i;

/** SAP-module cert noise often irrelevant to clinical / non-SAP JDs */
const SAP_CERT_RE =
  /\b(SAP\s+Certified|SAP\s+Associate|SAP\s+Professional|TERP|TS4[0-9]|C_TS|S\/4HANA|OpenSAP|SAP\s+Activate|FI\/CO|FICO|SuccessFactors)\b/i;

const CLINICAL_JD_RE =
  /\b(clinical|CDM|CDISC|EDC|SDTM|ADaM|Medidata|Rave|InForm|pharmacovigilance|trial|protocol|CRF|eCRF|SOCRA|ACRP)\b/i;

const SAP_JD_RE =
  /\b(SAP|S\/4HANA|Fiori|ABAP|FICO|EWM|MM\b|SD\b|BTP|SuccessFactors|Ariba|HANA)\b/i;

export function classifyEducationLine(line: string): EducationLineKind {
  const t = (line || "").trim();
  if (!t) return "other";
  // Cert markers win over vague "professional" wording
  if (CERT_RE.test(t) || SAP_CERT_RE.test(t)) return "cert";
  if (DEGREE_RE.test(t)) return "degree";
  // Short lines under a Certifications header are usually certs
  if (/^[•\-–—*]\s*/.test(t) && t.length < 120 && !DEGREE_RE.test(t)) {
    return "cert";
  }
  return "other";
}

function sectionStart(line: string): "education" | "certs" | "stop" | null {
  const t = line.trim();
  if (t.length >= 60) return null;
  if (/^(education|academic(\s+background)?|degrees?)\b/i.test(t)) {
    return "education";
  }
  if (
    /^(certifications?|certificates?|licenses?|licensure|professional\s+credentials?|credentials?)\b/i.test(
      t
    )
  ) {
    return "certs";
  }
  if (
    /^(experience|professional experience|employment|project work|technical skills|skills|summary|professional summary)\b/i.test(
      t
    )
  ) {
    return "stop";
  }
  return null;
}

function cleanLine(line: string): string {
  return line
    .replace(/^[•▸→–\-\*◆›]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull education + certification lines from master (separate sections when present).
 */
export function extractEducationAndCertsFromMaster(master: string): {
  degrees: string[];
  certs: string[];
  all: string[];
} {
  if (!master || master.length < 20) {
    return { degrees: [], certs: [], all: [] };
  }
  const lines = master.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  const degrees: string[] = [];
  const certs: string[] = [];
  const seen = new Set<string>();

  const push = (bucket: "degree" | "cert", raw: string) => {
    const t = cleanLine(raw);
    if (t.length < 4 || t.length > 200) return;
    if (/^https?:\/\//i.test(t) || /@/.test(t)) return;
    const k = t.toLowerCase().slice(0, 80);
    if (seen.has(k)) return;
    seen.add(k);
    if (bucket === "degree") degrees.push(t);
    else certs.push(t);
  };

  let mode: "none" | "education" | "certs" = "none";
  for (const line of lines) {
    if (!line) continue;
    const sec = sectionStart(line);
    if (sec === "stop") {
      mode = "none";
      continue;
    }
    if (sec === "education") {
      mode = "education";
      continue;
    }
    if (sec === "certs") {
      mode = "certs";
      continue;
    }
    if (mode === "none") continue;

    const kind = classifyEducationLine(line);
    if (mode === "education") {
      if (kind === "cert") push("cert", line);
      else if (kind === "degree" || kind === "other") push("degree", line);
    } else if (mode === "certs") {
      if (kind === "degree") push("degree", line);
      else push("cert", line);
    }
    if (degrees.length + certs.length >= 16) break;
  }

  // Fallback: single combined block like extractEducationLinesFromMaster
  if (degrees.length === 0 && certs.length === 0) {
    const flat = extractFlatEducationBlock(master);
    for (const line of flat) {
      const kind = classifyEducationLine(line);
      if (kind === "cert") push("cert", line);
      else push("degree", line);
    }
  }

  return {
    degrees: degrees.slice(0, 8),
    certs: certs.slice(0, 10),
    all: [...degrees.slice(0, 8), ...certs.slice(0, 10)],
  };
}

function extractFlatEducationBlock(master: string): string[] {
  const lines = master.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      /^(education|academic|certifications?|licenses?)\b/i.test(lines[i]) &&
      lines[i].length < 60
    ) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (
      /^(experience|professional|technical skills|skills|summary|employment|project work)\b/i.test(
        line
      ) &&
      line.length < 50
    ) {
      break;
    }
    if (line.length < 4 || line.length > 200) continue;
    if (/^https?:\/\//i.test(line) || /@/.test(line)) continue;
    out.push(cleanLine(line));
    if (out.length >= 10) break;
  }
  return out;
}

/** Master-grounded AI lines (substring must appear on master). */
export function groundAiEducationLines(
  master: string,
  aiLines: string[] | undefined
): string[] {
  const masterLc = (master || "").toLowerCase();
  return (aiLines || [])
    .map((l) => cleanLine(String(l)))
    .filter((t) => {
      if (t.length < 4 || t.length > 200) return false;
      const needle = t.toLowerCase().slice(0, Math.min(48, t.length));
      return masterLc.includes(needle);
    })
    .slice(0, 12);
}

/**
 * Heuristic: drop certs whose domain family clearly conflicts with the JD.
 * Degrees are never passed here.
 */
export function certRelevantHeuristic(opts: {
  cert: string;
  jd: string;
  jobTitle: string;
  domain: DomainHint | string;
}): { ok: boolean; reason: string } {
  const cert = opts.cert || "";
  const jdBlob = `${opts.jobTitle || ""}\n${opts.jd || ""}`;
  const domain = String(opts.domain || "").toLowerCase();
  const clinicalJd =
    CLINICAL_JD_RE.test(jdBlob) ||
    /clinical|cdm|data.?manager/i.test(domain) ||
    domain === "clinical";
  const sapJd = SAP_JD_RE.test(jdBlob) || /^(fico|ewm|mm|sd|abap|basis|rar|attp|sap)/i.test(domain);

  // SAP certs on clinical / non-SAP JDs
  if (SAP_CERT_RE.test(cert) && clinicalJd && !sapJd) {
    return {
      ok: false,
      reason: "SAP certificate not relevant to clinical / non-SAP JD",
    };
  }
  if (SAP_CERT_RE.test(cert) && !sapJd && !/\bsap\b/i.test(jdBlob)) {
    return {
      ok: false,
      reason: "SAP certificate not supported by JD text",
    };
  }

  // Clinical certs on pure SAP module JDs (optional symmetry)
  if (
    /\b(SOCRA|ACRP|CCRP|CDISC|clinical\s+research|GCP)\b/i.test(cert) &&
    sapJd &&
    !clinicalJd
  ) {
    return {
      ok: false,
      reason: "Clinical research cert not relevant to this SAP JD",
    };
  }

  // Token overlap with JD/title (light keep signal)
  const tokens = cert
    .toLowerCase()
    .split(/[^a-z0-9/+]+/)
    .filter((t) => t.length > 3 && !/^(certified|certificate|certification|professional|associate|license)$/.test(t));
  const jdLc = jdBlob.toLowerCase();
  const hits = tokens.filter((t) => jdLc.includes(t)).length;
  if (tokens.length >= 2 && hits === 0 && SAP_CERT_RE.test(cert)) {
    return { ok: false, reason: "No JD token overlap for SAP-family cert" };
  }

  // Default: keep (unknown certs — let AI drop if available)
  return { ok: true, reason: "kept" };
}

/**
 * Small AI JSON call: which master certs are relevant to this JD?
 * Degrees are not sent — always kept by caller.
 */
export async function filterCertsWithAi(opts: {
  certs: string[];
  jd: string;
  jobTitle: string;
  domain: DomainHint | string;
}): Promise<{
  keep: string[];
  dropped: { line: string; reason: string }[];
  usedAi: boolean;
}> {
  const certs = opts.certs.map(cleanLine).filter(Boolean);
  if (!certs.length) {
    return { keep: [], dropped: [], usedAi: false };
  }

  const cfg = getOpenAiConfig();
  if (!cfg.configured) {
    const dropped: { line: string; reason: string }[] = [];
    const keep: string[] = [];
    for (const c of certs) {
      const h = certRelevantHeuristic({
        cert: c,
        jd: opts.jd,
        jobTitle: opts.jobTitle,
        domain: opts.domain,
      });
      if (h.ok) keep.push(c);
      else dropped.push({ line: c, reason: h.reason });
    }
    return { keep, dropped, usedAi: false };
  }

  const numbered = certs.map((c, i) => `${i}: ${c}`).join("\n");
  const system = `You filter resume certifications for a specific job application.
Rules:
- KEEP a certificate only if it is relevant evidence for the job title / JD (same domain, required/preferred skill, or transferable credential the hiring manager would care about).
- DROP certificates from unrelated product stacks (e.g. SAP module certs for a Clinical Data Manager role; clinical research certs for a pure SAP FICO role).
- Degrees are NOT in this list — do not invent degrees.
- When unsure but the cert shares clear keywords with the JD, KEEP.
- Return STRICT JSON only: {"decisions":[{"i":0,"keep":true,"reason":"short"},...]} for every index.`;

  const user = `JOB TITLE: ${opts.jobTitle}
DOMAIN HINT: ${opts.domain}
JD (excerpt):
${(opts.jd || "").slice(0, 6000)}

CERTIFICATES FROM MASTER (filter only — do not rewrite):
${numbered}

Return JSON for every index 0..${certs.length - 1}.`;

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(
        Number(process.env.OPENAI_EDU_TIMEOUT_MS || 45_000)
      ),
    });
    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    let raw = (data.choices?.[0]?.message?.content || "").trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(raw) as {
      decisions?: { i?: number; keep?: boolean; reason?: string }[];
      keep?: number[];
      drop?: number[];
    };

    const keep: string[] = [];
    const dropped: { line: string; reason: string }[] = [];
    const byIndex = new Map<number, { keep: boolean; reason: string }>();

    if (Array.isArray(parsed.decisions)) {
      for (const d of parsed.decisions) {
        if (typeof d.i !== "number") continue;
        byIndex.set(d.i, {
          keep: d.keep !== false,
          reason: String(d.reason || (d.keep === false ? "not relevant" : "kept")),
        });
      }
    } else if (Array.isArray(parsed.keep) || Array.isArray(parsed.drop)) {
      const keepSet = new Set(parsed.keep || []);
      const dropSet = new Set(parsed.drop || []);
      for (let i = 0; i < certs.length; i++) {
        if (dropSet.has(i)) byIndex.set(i, { keep: false, reason: "dropped by AI" });
        else if (keepSet.has(i)) byIndex.set(i, { keep: true, reason: "kept by AI" });
      }
    }

    for (let i = 0; i < certs.length; i++) {
      const d = byIndex.get(i);
      if (d) {
        if (d.keep) keep.push(certs[i]);
        else dropped.push({ line: certs[i], reason: d.reason });
      } else {
        // Missing decision: conservative heuristic
        const h = certRelevantHeuristic({
          cert: certs[i],
          jd: opts.jd,
          jobTitle: opts.jobTitle,
          domain: opts.domain,
        });
        if (h.ok) keep.push(certs[i]);
        else dropped.push({ line: certs[i], reason: h.reason });
      }
    }

    return { keep, dropped, usedAi: true };
  } catch (e) {
    console.warn(
      "[education-filter] AI cert filter failed, using heuristic:",
      e instanceof Error ? e.message : e
    );
    const dropped: { line: string; reason: string }[] = [];
    const keep: string[] = [];
    for (const c of certs) {
      const h = certRelevantHeuristic({
        cert: c,
        jd: opts.jd,
        jobTitle: opts.jobTitle,
        domain: opts.domain,
      });
      if (h.ok) keep.push(c);
      else dropped.push({ line: c, reason: `${h.reason} (AI fallback)` });
    }
    return { keep, dropped, usedAi: false };
  }
}

/**
 * Full pack education block: degrees always kept; certs AI/heuristic filtered.
 */
export async function educationLinesForJd(opts: {
  master: string;
  jd: string;
  jobTitle: string;
  domain: DomainHint | string;
  /** Optional AI-proposed education/cert lines (must still be on master). */
  aiLines?: string[];
  /**
   * Prefer OpenAI cert relevance when configured (default true).
   * Set false only for pure offline unit tests.
   */
  useAi?: boolean;
}): Promise<EducationFilterResult> {
  const master = opts.master || "";
  const extracted = extractEducationAndCertsFromMaster(master);
  const groundedAi = groundAiEducationLines(master, opts.aiLines);

  let degrees = [...extracted.degrees];
  let certs = [...extracted.certs];

  // Merge master-grounded AI lines into the right bucket
  for (const line of groundedAi) {
    const kind = classifyEducationLine(line);
    const k = line.toLowerCase().slice(0, 80);
    if (kind === "cert") {
      if (!certs.some((c) => c.toLowerCase().slice(0, 80) === k)) certs.push(line);
    } else {
      if (!degrees.some((d) => d.toLowerCase().slice(0, 80) === k)) degrees.push(line);
    }
  }

  // If AI only returned a flat list and master parse was empty, classify all
  if (!degrees.length && !certs.length && groundedAi.length) {
    for (const line of groundedAi) {
      if (classifyEducationLine(line) === "cert") certs.push(line);
      else degrees.push(line);
    }
  }

  degrees = degrees.slice(0, 8);
  certs = certs.slice(0, 10);

  if (!certs.length) {
    return {
      lines: degrees,
      degrees,
      certsKept: [],
      certsDropped: [],
      certFilter: "none",
    };
  }

  const wantAi = opts.useAi !== false;
  if (wantAi) {
    const ai = await filterCertsWithAi({
      certs,
      jd: opts.jd,
      jobTitle: opts.jobTitle,
      domain: opts.domain,
    });
    return {
      lines: [...degrees, ...ai.keep].slice(0, 12),
      degrees,
      certsKept: ai.keep,
      certsDropped: ai.dropped,
      certFilter: ai.usedAi ? "ai" : "heuristic",
    };
  }

  const dropped: { line: string; reason: string }[] = [];
  const keep: string[] = [];
  for (const c of certs) {
    const h = certRelevantHeuristic({
      cert: c,
      jd: opts.jd,
      jobTitle: opts.jobTitle,
      domain: opts.domain,
    });
    if (h.ok) keep.push(c);
    else dropped.push({ line: c, reason: h.reason });
  }
  return {
    lines: [...degrees, ...keep].slice(0, 12),
    degrees,
    certsKept: keep,
    certsDropped: dropped,
    certFilter: "heuristic",
  };
}
