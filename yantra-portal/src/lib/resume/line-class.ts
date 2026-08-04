/** Shared line classifiers for DOCX / PDF / HTML renderers (keep in sync). */

export function stripBullet(line: string) {
  return line.replace(/^[•▸→–\-]\s*/, "").trim();
}

export function isBullet(line: string) {
  return /^[•▸→–\-]/.test(line.trim());
}

/** Dedicated employer/client line — always rendered prominently */
export function isEmployerClientLine(line: string) {
  return /^(Employer\s*\/\s*Client|Employer|Client|Organization|Company)\s*:/i.test(
    line.trim()
  );
}

export function isJobTitleLine(line: string) {
  const t = line.trim();
  if (!t || isBullet(t)) return false;
  if (isEmployerClientLine(t)) return false;
  if (
    /^(Environment|Tools|Core skills|Delivery skills|Functional|Technical|Stack|PRIMARY|SECONDARY|DOMAIN|TENURE|Modules)\b/i.test(
      t
    )
  )
    return false;
  if (/Era:\s*(RECENT|MID|EARLY)/i.test(t)) return false;
  // Location/date meta (not a title)
  if (/\|\s*\d{4}/.test(t) && /Remote|Onsite|Hybrid|United|Client site|Delivery/i.test(t))
    return false;
  // Title — Client  / Title | Client  / Title - Client
  if (/(?:—|–|\s-\s|\s\|\s)/.test(t) && t.length < 160) return true;
  // Case portfolio headers
  if (/^Case\s*·/i.test(t)) return true;
  // Role-only title when employer is on the next line
  if (
    /\b(Consultant|Developer|Lead|Analyst|Architect|Engineer|Manager|Specialist|Director)\b/i.test(
      t
    ) &&
    t.length < 110 &&
    !t.includes(":") &&
    !/\|\s*\d{4}/.test(t)
  )
    return true;
  return false;
}

export function isMetaLine(line: string) {
  const t = line.trim();
  if (isEmployerClientLine(t)) return false;
  // Location / date lines only — NOT summary sentences starting with "Delivery footprint"
  if (/Era:\s*(RECENT|MID|EARLY)/i.test(t)) return true;
  if (/\|\s*\d{4}/.test(t) && /Remote|Onsite|Hybrid|United|Client site|Delivery center/i.test(t))
    return true;
  if (
    /^(Remote|Onsite|Hybrid|United States|Client site|Delivery center)\b/i.test(t) &&
    (/\d{4}/.test(t) || /\|/.test(t))
  )
    return true;
  return false;
}

export function isSkillLine(line: string) {
  return /^(Core skills|Tools & platforms|Delivery skills|Functional|Technical|Stack:)/i.test(
    line.trim()
  );
}

export function isEnvToolsLine(line: string) {
  return /^(Environment\s*\/\s*tools|Tools in period|Stack:|Modules:|Program stack:|Chapter stack:|Engagement stack:)/i.test(
    line.trim()
  );
}

/** Hide internal progressive-era debug labels + engine footers from client exports */
export function shouldSkipExportLine(line: string) {
  const t = line.trim();
  if (/Era:\s*(RECENT|MID|EARLY)/i.test(t)) return true;
  // Role Forge AI / deterministic provenance footer — never ship to vendors
  if (/^[—–\-−-]*\s*Role\s*Forge(\s+AI)?\b/i.test(t)) return true;
  if (
    /^Role\s*Forge(\s+AI)?\s*[·|•]/i.test(t) &&
    /(ATS|Psych|Mode|gpt-|Projects)/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** PDF-safe bullet glyph (Helvetica has no ▸) */
export function pdfSafeBullet(preferred: string) {
  if (preferred === "▸" || preferred === "→") return "•";
  return preferred || "•";
}
