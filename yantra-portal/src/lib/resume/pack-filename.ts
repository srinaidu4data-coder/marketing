/**
 * Download / email attachment naming: CandidateName_SkillOrTitle.ext
 */

function sanitizeSegment(raw: string, max = 72): string {
  return (raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\w\s.+-]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, max)
    .replace(/_+$/g, "");
}

/**
 * Prefer job title (human skill / role). Fall back to skillFingerprint title
 * portion (`clinical data manager::attp|…` → clinical data manager).
 */
export function packSkillLabel(opts: {
  jobTitle?: string | null;
  skillFingerprint?: string | null;
}): string {
  const title = (opts.jobTitle || "").trim();
  if (title) return title;
  const fp = (opts.skillFingerprint || "").trim();
  if (!fp) return "";
  const head = fp.split("::")[0]?.trim() || fp;
  return head;
}

/** Base filename without extension, e.g. Sri_Naidu_Senior_SAP_Functional_Consultant */
export function packFileBaseName(opts: {
  candidateName: string;
  jobTitle?: string | null;
  skillFingerprint?: string | null;
}): string {
  const name = sanitizeSegment(opts.candidateName, 48) || "Candidate";
  const skill = sanitizeSegment(packSkillLabel(opts), 72);
  return skill ? `${name}_${skill}` : `${name}_Resume`;
}

export function packDownloadFilename(
  opts: {
    candidateName: string;
    jobTitle?: string | null;
    skillFingerprint?: string | null;
  },
  ext: string
): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  return `${packFileBaseName(opts)}.${e}`;
}
