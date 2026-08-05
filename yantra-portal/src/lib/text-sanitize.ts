/**
 * Text sanitization for storage and display.
 * Postgres rejects U+0000 in UTF-8 text (error 22021).
 * Used by master upload, pack persist, and candidate fields.
 */

/**
 * Strip NUL and other C0 controls (except tab/LF/CR) so strings are safe
 * for Postgres text/json and for most UTF-8 file writes.
 */
export function sanitizePostgresText(input: string): string {
  if (!input) return input;
  return input
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Normalize email for lookup/storage (lowercase, trim). */
export function normalizeEmail(email: string): string {
  return String(email || "")
    .toLowerCase()
    .trim();
}

/** Keep digits, +, spaces, dashes, parens — strip junk. Max 32 chars. */
export function normalizePhone(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[^\d+()\-.\s]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 32);
}
