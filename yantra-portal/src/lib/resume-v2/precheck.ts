/**
 * Hard prechecks before any LLM call.
 * Prompt may add more self-checks; these never invent content.
 */

export type PrecheckResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  contact: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
  };
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
  for (const l of lines.slice(0, 8)) {
    if (EMAIL_RE.test(l)) continue;
    if (PHONE_RE.test(l) && l.length < 40) continue;
    if (/summary|skills|experience|education|objective/i.test(l)) continue;
    if (l.length >= 3 && l.length <= 60 && /[A-Za-z]/.test(l)) {
      // Prefer lines that look like a person name
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){0,3}$/.test(l)) return l;
      if (!/[|•@]/.test(l) && (l.match(/[A-Za-z]/g) || []).length > 4) {
        return l.split(/[|,–—]/)[0]!.trim();
      }
    }
  }
  return "";
}

export function precheckGenerate(opts: {
  prompt: string;
  masterText: string;
  jd: string;
  minPromptChars?: number;
  minMasterChars?: number;
}): PrecheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prompt = (opts.prompt || "").trim();
  const masterText = (opts.masterText || "").trim();
  const jd = (opts.jd || "").trim();
  const minPrompt = opts.minPromptChars ?? 200;
  const minMaster = opts.minMasterChars ?? 200;

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

  const email = masterText.match(EMAIL_RE)?.[0] || "";
  const phone = masterText.match(PHONE_RE)?.[0] || "";
  const linkedin = masterText.match(LINKEDIN_RE)?.[0] || "";
  const name = firstLineName(masterText);

  if (!name) {
    errors.push("Could not extract candidate name from master resume.");
  }
  if (!email) {
    errors.push("Could not extract email from master resume.");
  }
  if (!phone) {
    warnings.push("No phone number found in master — header phone may be empty.");
  }

  // Rough project/employer block count for guidance
  const employerHits = (
    masterText.match(
      /(?:employer|client|company|project)\s*[:/]|20\d{2}\s*[-–—]\s*(?:20\d{2}|present)/gi
    ) || []
  ).length;
  const projectHints = Math.max(1, Math.min(12, Math.ceil(employerHits / 2) || 1));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    contact: {
      name,
      email,
      phone,
      location: "",
      linkedin,
    },
    masterText,
    projectHints,
  };
}
