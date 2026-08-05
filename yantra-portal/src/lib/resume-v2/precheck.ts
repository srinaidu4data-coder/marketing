/**
 * Prechecks for prompt-only generation.
 * Soft where possible — never block a real chain because of brittle thresholds.
 * Authoritative contact can come from the candidate record.
 */

export type PrecheckContact = {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
};

export type PrecheckResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  contact: PrecheckContact;
  masterText: string;
  /** Normalized JD ready for the LLM */
  jdText: string;
  projectHints: number;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})\b/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)]+/i;

/** Strip invisible junk; keep real content for length checks */
export function normalizeJdText(raw: string | null | undefined): string {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function normalizeMasterText(raw: string | null | undefined): string {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function firstLineName(text: string): string {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const l of lines.slice(0, 12)) {
    if (EMAIL_RE.test(l)) continue;
    if (PHONE_RE.test(l) && l.length < 40) continue;
    if (/summary|skills|experience|education|objective|profile/i.test(l))
      continue;
    if (l.length >= 3 && l.length <= 80 && /[A-Za-z]/.test(l)) {
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){0,4}$/.test(l)) return l;
      if (/^[A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,4}$/.test(l)) {
        return l.split(/[|,–—]/)[0]!.trim();
      }
      if (!/[|•@:]/.test(l) && (l.match(/[A-Za-z]/g) || []).length > 4) {
        return l.split(/[|,–—]/)[0]!.trim().slice(0, 60);
      }
    }
  }
  return "";
}

export function precheckGenerate(opts: {
  prompt: string;
  masterText: string;
  jd: string;
  contactOverride?: Partial<PrecheckContact> | null;
  /** When true, empty JD is a warning (caller will inject title fallback) */
  allowShortJd?: boolean;
  minPromptChars?: number;
  minMasterChars?: number;
  minJdChars?: number;
}): PrecheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prompt = (opts.prompt || "").trim();
  const masterText = normalizeMasterText(opts.masterText);
  const jdText = normalizeJdText(opts.jd);
  const minPrompt = opts.minPromptChars ?? 80;
  const minMaster = opts.minMasterChars ?? 80;
  const minJd = opts.minJdChars ?? 8;
  const ov = opts.contactOverride || {};

  if (!prompt || prompt.length < minPrompt) {
    // Caller should inject BIBLE — treat as warning so generation can still run
    warnings.push(
      `Prompt short or missing (${prompt.length} chars; prefer ≥${minPrompt}). Bible/default will be used if provided by caller.`
    );
  }
  if (!masterText || masterText.length < minMaster) {
    errors.push(
      `Master resume too short after parse (${masterText.length} chars; need ≥${minMaster}). Re-upload DOCX/PDF with extractable text.`
    );
  }
  if (!jdText || jdText.length < minJd) {
    const msg = `Job description empty or too short (${jdText.length} chars; need ≥${minJd}).`;
    if (opts.allowShortJd) warnings.push(msg);
    else errors.push(msg);
  }

  const emailFromText = masterText.match(EMAIL_RE)?.[0] || "";
  const phoneFromText = masterText.match(PHONE_RE)?.[0] || "";
  const linkedinFromText = masterText.match(LINKEDIN_RE)?.[0] || "";
  const nameFromText = firstLineName(masterText);

  const name = (ov.name || "").trim() || nameFromText;
  const email = (ov.email || "").trim() || emailFromText;
  const phone = (ov.phone || "").trim() || phoneFromText;
  const location = (ov.location || "").trim();
  const linkedin = (ov.linkedin || "").trim() || linkedinFromText;

  if (!name) {
    warnings.push(
      "Could not resolve candidate name from master — using override or 'Candidate'."
    );
  }
  if (!email) {
    warnings.push(
      "No email in master or candidate record — header email may be blank."
    );
  }

  const employerHits = (
    masterText.match(
      /(?:employer|client|company|project)\s*[:/]|20\d{2}\s*[-–—]\s*(?:20\d{2}|present)/gi
    ) || []
  ).length;
  const projectHints = Math.max(
    1,
    Math.min(12, Math.ceil(employerHits / 2) || 1)
  );

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    contact: {
      name: name || (ov.name || "").trim() || "Candidate",
      email,
      phone,
      location,
      linkedin,
    },
    masterText,
    jdText,
    projectHints,
  };
}
