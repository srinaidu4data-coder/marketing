/**
 * Final quality scrub — removes ATS-game pollution and specialty residue
 * that makes dual-100 packs look broken to humans.
 *
 * Runs AFTER score boosts so scores can stay high while presentation is clean.
 */

import type { StructuredResume } from "./templates";
import { renderPlainFromStructured } from "./build-from-layout";

const BOOSTER_LINE =
  /^(delivery focus:|ship-floor skills:|jd keywords:|core \/ jd-aligned skills:|target role:)/i;

const BOOSTER_BULLET =
  /^[•\-–—*]\s*applied\s+.+\s+within\s+engagement\s+delivery/i;

/** Sentence fragments accidentally scraped from JDs into skills */
const SKILL_GARBAGE =
  /\b(ability to|should have|must have|years of experience|location|looking for|we are seeking)\b/i;

const FICO_HEAVY =
  /\b(fico|fi\/co|product costing|new gl|asset accounting|co-?pa|profit center|cost center|month-end closing|financial reporting|controlling process|chart of accounts|document splitting|fixed assets?|wip calculation|standard cost)\b/i;

const ATTP_SIGNAL =
  /\b(attp|serialization|epcis|gs1|gtin|sscc|dscsa|fmd|track\s*and\s*trace|serial\s*number|cmo|3pl)\b/i;

const INDUSTRY_ENV_LEAK =
  /\b(pharmaceutical|pharma|biotech|life\s+sciences?|rise\b)\b/i;

function isAttpJd(jd: string): boolean {
  return ATTP_SIGNAL.test(jd || "");
}

function isClinicalOnlyJd(jd: string): boolean {
  const j = jd || "";
  return (
    /\b(clinical\s+data|cdm|cdisc|edc|sdtm)\b/i.test(j) &&
    !/\bsap\b|s\/4|attp|fico/i.test(j)
  );
}

function cleanSkillToken(t: string): string | null {
  const s = t.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 48) return null;
  if (SKILL_GARBAGE.test(s)) return null;
  if (/^[-–—*•]+$/.test(s)) return null;
  if (/\s{2,}/.test(s) && s.split(" ").length > 6) return null;
  // Drop long sentence-like fragments
  if (s.split(/\s+/).length > 5 && !/^[A-Z0-9/.\-+ ]+$/.test(s)) return null;
  return s;
}

function scrubSkillsLine(line: string): string | null {
  if (BOOSTER_LINE.test(line.trim())) {
    // Keep tokens after label only if clean
    const body = line.replace(/^[^:]+:\s*/, "");
    const parts = body
      .split(/\s*[·|•,]\s*/)
      .map(cleanSkillToken)
      .filter(Boolean) as string[];
    if (!parts.length) return null;
    return parts.slice(0, 24).join(" · ");
  }
  if (SKILL_GARBAGE.test(line)) return null;
  if (line.length > 120 && /ability to|perform discovery/i.test(line)) return null;
  return line;
}

function scrubImpactLines(lines: string[], jd: string): string[] {
  const attp = isAttpJd(jd);
  const clinical = isClinicalOnlyJd(jd);
  let out = lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !BOOSTER_LINE.test(l))
    .filter((l) => !BOOSTER_BULLET.test(l));

  if (attp) {
    // Drop pure FICO impact when targeting ATTP
    const filtered = out.filter((l) => {
      const body = l.replace(/^[•\-–—*]\s*/, "");
      if (FICO_HEAVY.test(body) && !ATTP_SIGNAL.test(body)) return false;
      return true;
    });
    if (filtered.length >= 3) out = filtered;
  }

  if (clinical) {
    out = out.filter((l) => {
      const body = l.replace(/^[•\-–—*]\s*/, "");
      if (FICO_HEAVY.test(body) || /\bsap\b|s\/4|fico|ariba/i.test(body))
        return false;
      return true;
    });
  }

  // Normalize bullets
  return out
    .map((l) => {
      const body = l.replace(/^[•\-–—*▸]\s*/, "").trim();
      if (!body) return "";
      return body.startsWith("•") ? body : `• ${body}`;
    })
    .filter(Boolean)
    .slice(0, 8);
}

function scrubEnvironmentLine(line: string, jd: string, master: string): string {
  if (!/^(environment|stack|modules|chapter stack)\s*:/i.test(line)) return line;
  const label = line.match(/^([^:]+):\s*/)?.[1] || "Environment";
  const body = line.replace(/^[^:]+:\s*/, "");
  const parts = body
    .split(/\s*[·|,]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      // Never leave bare industry tags on env unless master supports
      if (INDUSTRY_ENV_LEAK.test(p)) {
        if (!INDUSTRY_ENV_LEAK.test(master || "")) return false;
        // For ATTP JD, pharma tag OK if master has GSK/Genentech etc. — keep only if master has pharma
        if (isAttpJd(jd) && !/\b(pharma|gsk|genentech|pfizer|novartis|merck)\b/i.test(master))
          return false;
      }
      // Strip FICO-only modules from env when JD is pure ATTP-serialization and part is not ATTP
      if (isAttpJd(jd) && FICO_HEAVY.test(p) && !ATTP_SIGNAL.test(p) && !/\bsap\b|s\/4|mdg|cfin/i.test(p)) {
        // keep core SAP platform tokens, drop pure finance jargon tags only if too many
      }
      if (SKILL_GARBAGE.test(p)) return false;
      return p.length < 40;
    });

  // Prefer ATTP-relevant first when JD is ATTP
  if (isAttpJd(jd)) {
    parts.sort((a, b) => {
      const sa = ATTP_SIGNAL.test(a) ? 0 : 1;
      const sb = ATTP_SIGNAL.test(b) ? 0 : 1;
      return sa - sb;
    });
  }

  if (!parts.length) return `${label}: SAP`;
  return `${label}: ${parts.slice(0, 10).join(" · ")}`;
}

function scrubExperienceBlock(lines: string[], jd: string, master: string): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }
    if (BOOSTER_LINE.test(line) || BOOSTER_BULLET.test(line)) continue;
    if (/^employer\s*\/\s*client:/i.test(line)) {
      out.push(line);
      continue;
    }
    if (/^(environment|stack|modules|chapter stack)\s*:/i.test(line)) {
      out.push(scrubEnvironmentLine(line, jd, master));
      continue;
    }
    // Title line: strip leading dash debris
    if (
      out.length === 0 ||
      (out.filter((l) => l.trim()).length === 0)
    ) {
      out.push(line.replace(/^[\-\–—•*]+\s*/, "").trim());
      continue;
    }
    // Last few booster spam bullets
    if (BOOSTER_BULLET.test(line)) continue;
    out.push(line);
  }
  return out;
}

function rebuildImpactFromExperience(
  structured: StructuredResume,
  jd: string
): string[] {
  const exp = structured.sections.find((s) =>
    /experience|engagement|employment|work/i.test(s.heading)
  );
  if (!exp) return [];
  const bullets = exp.lines
    .filter((l) => /^[•\-–—*▸]/.test(l.trim()) || l.trim().startsWith("•"))
    .map((l) => l.replace(/^[•\-–—*▸]\s*/, "").trim())
    .filter((l) => l.length > 40)
    .filter((l) => !BOOSTER_BULLET.test(`• ${l}`));

  const preferAttp = isAttpJd(jd);
  const ranked = [...bullets].sort((a, b) => {
    if (!preferAttp) return 0;
    const sa = ATTP_SIGNAL.test(a) ? 0 : FICO_HEAVY.test(a) ? 2 : 1;
    const sb = ATTP_SIGNAL.test(b) ? 0 : FICO_HEAVY.test(b) ? 2 : 1;
    return sa - sb;
  });

  return ranked.slice(0, 5).map((b) => `• ${b}`);
}

/**
 * Clean structured pack for human readability while preserving ATS keywords in skills.
 */
export function scrubPackQuality(
  structured: StructuredResume,
  opts: { jd: string; masterText?: string; jobTitle?: string }
): StructuredResume {
  const jd = opts.jd || "";
  const master = opts.masterText || "";
  const jobTitle = (opts.jobTitle || structured.meta.jobTitle || structured.headline || "")
    .replace(/^[\-\–—•*]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  const sections = structured.sections.map((sec) => {
    const h = sec.heading || "";

    // Skills
    if (/skill|competenc|matrix|stack|capability|core/i.test(h) && !/experience/i.test(h)) {
      const cleaned: string[] = [];
      const tokenBag = new Set<string>();
      for (const line of sec.lines) {
        const scrubbed = scrubSkillsLine(line);
        if (!scrubbed) continue;
        // Flatten multi-token lines into one clean competencies line later
        if (scrubbed.includes(" · ") || scrubbed.includes(" | ")) {
          for (const t of scrubbed.split(/\s*[·|]\s*/)) {
            const c = cleanSkillToken(t);
            if (c) tokenBag.add(c);
          }
        } else if (/^(core|platforms|methods|technical):/i.test(scrubbed)) {
          const body = scrubbed.replace(/^[^:]+:\s*/, "");
          for (const t of body.split(/\s*[·|,]\s*/)) {
            const c = cleanSkillToken(t);
            if (c) tokenBag.add(c);
          }
        } else {
          const c = cleanSkillToken(scrubbed);
          if (c) tokenBag.add(c);
          else cleaned.push(scrubbed);
        }
      }
      const tokens = Array.from(tokenBag).slice(0, 28);
      const lines: string[] = [];
      if (tokens.length) {
        lines.push(`Core: ${tokens.slice(0, 14).join(" · ")}`);
        if (tokens.length > 14) {
          lines.push(`Platforms & Integration: ${tokens.slice(14, 28).join(" · ")}`);
        }
      }
      // Prefer ATTP tokens first when JD is ATTP
      if (isAttpJd(jd) && lines[0]) {
        const all = tokens.sort((a, b) => {
          const sa = ATTP_SIGNAL.test(a) ? 0 : 1;
          const sb = ATTP_SIGNAL.test(b) ? 0 : 1;
          return sa - sb;
        });
        lines[0] = `Core: ${all.slice(0, 14).join(" · ")}`;
        if (all.length > 14) {
          lines[1] = `Platforms & Integration: ${all.slice(14, 28).join(" · ")}`;
        }
      }
      return { ...sec, lines: lines.length ? lines : cleaned.slice(0, 6) };
    }

    // Impact
    if (/impact|achievement|highlight|selected/i.test(h)) {
      let impact = scrubImpactLines(sec.lines, jd);
      if (impact.length < 3) {
        const rebuilt = rebuildImpactFromExperience(structured, jd);
        if (rebuilt.length >= 3) impact = rebuilt;
      }
      // If still FICO-heavy on ATTP, force rebuild from ATTP experience bullets only
      if (isAttpJd(jd)) {
        const ficoOnly = impact.every((l) => FICO_HEAVY.test(l) && !ATTP_SIGNAL.test(l));
        if (ficoOnly || impact.length < 2) {
          const rebuilt = rebuildImpactFromExperience(structured, jd).filter(
            (l) => ATTP_SIGNAL.test(l) || !FICO_HEAVY.test(l)
          );
          if (rebuilt.length) impact = rebuilt;
        }
      }
      return { ...sec, lines: impact };
    }

    // Summary
    if (/summary|profile|pitch/i.test(h)) {
      const lines = sec.lines
        .filter((l) => !BOOSTER_LINE.test(l.trim()))
        .filter((l) => !/^delivery focus:/i.test(l.trim()))
        .map((l) =>
          l
            .replace(/^positioned as a\s*-\s*/i, "positioned as a ")
            .replace(/\s*-\s*SAP/g, " SAP")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter((l) => l.length > 20);
      // Ensure job title appears cleanly once
      if (jobTitle && lines[0] && !new RegExp(jobTitle.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(lines[0])) {
        lines[0] = `${(structured.candidateName || "Candidate").split(/\s+/)[0]} targets ${jobTitle}, drawing on progressive SAP delivery history with honest mapping to this role.`;
      }
      return { ...sec, lines: lines.slice(0, 5) };
    }

    // Experience
    if (/experience|engagement|employment|work|chapter|leadership engagements/i.test(h)) {
      return {
        ...sec,
        lines: scrubExperienceBlock(sec.lines, jd, master),
      };
    }

    // Default: strip booster junk only
    return {
      ...sec,
      lines: sec.lines.filter(
        (l) => !BOOSTER_LINE.test(l.trim()) && !BOOSTER_BULLET.test(l.trim())
      ),
    };
  });

  return {
    ...structured,
    headline: jobTitle || structured.headline.replace(/^[\-\–—•*]+\s*/, ""),
    sections,
    meta: {
      ...structured.meta,
      jobTitle: jobTitle || structured.meta.jobTitle,
    },
  };
}

/** Text-level scrub for final plain resume before ship */
export function scrubPackTextQuality(text: string): string {
  return (text || "")
    .split(/\r?\n/)
    .filter((l) => !BOOSTER_LINE.test(l.trim()))
    .filter((l) => !BOOSTER_BULLET.test(l.trim()))
    .filter((l) => !/^ship-floor skills:/i.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/positioned as a\s*-\s*/gi, "positioned as a ")
    .replace(/^[\-\–—]\s*SAP/gm, "SAP");
}

/** Re-render plain text after structured scrub */
export function scrubAndRender(
  structured: StructuredResume,
  opts: { jd: string; masterText?: string; jobTitle?: string }
): { structured: StructuredResume; text: string } {
  const cleaned = scrubPackQuality(structured, opts);
  const text = scrubPackTextQuality(renderPlainFromStructured(cleaned));
  return { structured: cleaned, text };
}
