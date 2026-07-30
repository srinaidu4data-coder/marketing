/**
 * Pull header contact fields from master resume text.
 * Role title still comes from JD; everything else prefers master.
 */

export type MasterContact = {
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
  /** Extra header lines (e.g. citizenship) kept short */
  extras: string[];
};

const NOISE_LINE =
  /^(professional summary|summary|experience|education|skills|technical|projects|certifications|work history)/i;

export function extractContactFromMaster(
  master: string,
  fallbackEmail?: string | null
): MasterContact {
  const lines = (master || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Focus on header block (before first major section)
  let headerEnd = lines.length;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    if (NOISE_LINE.test(lines[i]) && lines[i].length < 40) {
      headerEnd = i;
      break;
    }
  }
  const header = lines.slice(0, Math.max(headerEnd, 8)).join("\n");
  const blob = header || master.slice(0, 1200);

  const emailMatch = blob.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );
  // e.g. +1 (469) 555-0199 · 469-555-0199 · +91 98765 43210
  const phoneMatch = blob.match(
    /(?:\+?\d{1,3}[\s.-]*)?(?:\(\d{2,5}\)[\s.-]*|\d{2,5}[\s.-]+)?\d{3}[\s.-]*\d{3,4}(?:[\s.-]*\d{3,4})?(?:\s*(?:ext|x)\.?\s*\d+)?/i
  );
  let phone: string | null = null;
  if (phoneMatch) {
    const raw = phoneMatch[0].trim();
    const digits = raw.replace(/\D/g, "");
    // US 10–11 digits or international 10–15; reject short year-like matches
    if (digits.length >= 10 && digits.length <= 15 && !/^(19|20)\d{2}$/.test(digits)) {
      phone = raw;
    }
  }

  const linkedinMatch = blob.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_./%-]+/i
  );
  const githubMatch = blob.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_./%-]+/i
  );
  const webMatch = blob.match(
    /(?:https?:\/\/)(?!(?:www\.)?(?:linkedin|github)\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s]*)?/i
  );

  // Location heuristics: City, ST or City, Country on early lines
  let location: string | null = null;
  for (const line of lines.slice(0, 12)) {
    if (/@|linkedin|github|http/i.test(line)) continue;
    if (/^\+?\d/.test(line)) continue;
    if (NOISE_LINE.test(line)) continue;
    // "Dallas, TX" / "Remote | USA" / "Hyderabad, India"
    if (
      /^[A-Za-z .'-]+,\s*[A-Z]{2}\b/.test(line) ||
      /^[A-Za-z .'-]+,\s*[A-Za-z .]{3,}$/.test(line) ||
      /\b(Remote|Hybrid|Onsite)\b.*\b(USA|US|United States|India|UK)\b/i.test(line) ||
      /\b(USA|United States|India|United Kingdom)\b/i.test(line) && line.length < 60
    ) {
      location = line.replace(/\s*[|·•]\s*/g, " · ").trim();
      break;
    }
  }

  const extras: string[] = [];
  for (const line of lines.slice(0, 10)) {
    if (/authorized to work|US Citizen|Green Card|H-1B|willing to relocate/i.test(line)) {
      extras.push(line.slice(0, 80));
    }
  }

  return {
    email: emailMatch?.[0] || fallbackEmail || null,
    phone,
    location,
    linkedin: linkedinMatch?.[0] || null,
    github: githubMatch?.[0] || null,
    website: webMatch?.[0] || null,
    extras: extras.slice(0, 2),
  };
}

/** Single header line for DOCX/PDF/HTML contact strip */
export function formatContactLine(c: MasterContact): string {
  const parts: string[] = [];
  if (c.email) parts.push(c.email);
  if (c.phone) parts.push(c.phone);
  if (c.location) parts.push(c.location);
  if (c.linkedin) parts.push(c.linkedin.replace(/^https?:\/\//i, ""));
  if (c.github) parts.push(c.github.replace(/^https?:\/\//i, ""));
  if (c.website) parts.push(c.website.replace(/^https?:\/\//i, ""));
  for (const e of c.extras) parts.push(e);
  return parts.join("  ·  ");
}
