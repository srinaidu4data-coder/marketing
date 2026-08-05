/**
 * Hard prechecks before any LLM call.
 * Candidate record contact overrides master-text extraction (PDF masters often
 * bury email/name in ways regex misses).
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
  projectHints: number;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})\b/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)]+/i;

function firstLineName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const l of lines.slice(0, 12)) {
    if (EMAIL_RE.test(l)) continue;
    if (PHONE_RE.test(l) && l.length < 40) continue;
    if (/summary|skills|experience|education|objective|profile/i.test(l))
      continue;
    if (l.length >= 3 && l.length <= 80 && /[A-Za-z]/.test(l)) {
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){0,4}$/.test(l)) return l;
      // "SMITH, Jane" / "Jane SMITH"
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
  /** Prefer candidate DB fields when master OCR/PDF text is messy */
  contactOverride?: Partial<PrecheckContact> | null;
  minPromptChars?: number;
  minMasterChars?: number;
}): PrecheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prompt = (opts.prompt || "").trim();
  const masterText = (opts.masterText || "").trim();
  const jd = (opts.jd || "").trim();
  const minPrompt = opts.minPromptChars ?? 200;
  const minMaster = opts.minMasterChars ?? 120;
  const ov = opts.contactOverride || {};

  if (!prompt || prompt.length < minPrompt) {
    errors.push(
      `ACTIVE prompt is missing or too short (need ≥${minPrompt} chars). Prompt is the only writing source — promote a Bible prompt first.`
    );
  }
  if (!masterText || masterText.length < minMaster) {
    errors.push(
      `Master resume text is missing or too short after parse (need ≥${minMaster} chars). Re-upload DOCX/PDF.`
    );
  }
  if (!jd || jd.length < 40) {
    errors.push("Job description is empty or too short.");
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
    errors.push(
      "Could not resolve candidate name (master text + candidate record)."
    );
  }
  if (!email) {
    // Soft warning if candidate record also lacks email — still allow generate
    // so real staffing packs aren't blocked; header email may be empty.
    warnings.push(
      "No email found in master or candidate record — header email may be blank."
    );
  } else if (!emailFromText && ov.email) {
    warnings.push("Using candidate-record email (not found in master text).");
  }
  if (!phone) {
    warnings.push("No phone number found — header phone may be empty.");
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
    contact: { name, email, phone, location, linkedin },
    masterText,
    projectHints,
  };
}
