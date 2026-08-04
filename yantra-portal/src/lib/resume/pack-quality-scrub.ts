/**
 * Final quality scrub — removes ATS-game pollution and specialty residue
 * that makes dual-100 packs look broken to humans.
 *
 * Runs AFTER score boosts so scores can stay high while presentation is clean.
 */

import type { StructuredResume } from "./templates";
import { renderPlainFromStructured } from "./build-from-layout";
import {
  isEnvironmentMetaLine,
  scrubEnvironmentLineText,
} from "./environment-stack";

const BOOSTER_LINE =
  /^(delivery focus:|ship-floor skills:|jd keywords:|jd focus phrases?:|jd focus:|core \/ jd-aligned skills:|target role:)/i;

/** Entire line is JD meta dump — drop; tokens may be recovered if skill-like */
const JD_FOCUS_DUMP_LINE = /^\s*JD\s+focus(\s+phrases?)?\s*:/i;

const BOOSTER_BULLET =
  /^[•\-–—*]\s*applied\s+.+\s+within\s+engagement\s+delivery/i;

/** Sentence fragments accidentally scraped from JDs into skills */
const SKILL_GARBAGE =
  /\b(ability to|should have|must have|years of experience|location|looking for|we are seeking)\b/i;

/** Pure finance / FICO stack — must NOT appear when JD is ATTP/serialization */
const FICO_HEAVY =
  /\b(fico|fi\s*\/?\s*co|fi-co|product costing|new gl|asset accounting|co-?pa|copa|profit center|cost center|month-end|financial reporting|controlling|chart of accounts|document splitting|fixed assets?|wip|standard cost|fp&a|fpa|cfin|central finance|lockbox|vertex|in-house cash|general ledger|accounts payable|accounts receivable|ap\b|ar\b|gl\b)\b/i;

const ATTP_SIGNAL =
  /\b(attp|serialization|epcis|gs1|gtin|sscc|dscsa|fmd|track\s*and\s*trace|serial\s*number|cmo|3pl|boomi|sftp|repository)\b/i;

/** Tokens allowed on ATTP env even if "SAP" appears */
const ATTP_STACK_OK =
  /\b(attp|s\/4|s4hana|hana|epcis|gs1|gtin|sscc|dscsa|mdg|ariba|concur|coupa|boomi|sftp|fiori|cpi|pi\/po|odata|btp|integration)\b/i;

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
  // JD posting crumbs leaked as skill tokens
  if (
    /^(location|position|duration|title|role|job|site|city|state|office|new\s+brunswick|brunswick\s+nj)\b/i.test(
      s
    )
  ) {
    return null;
  }
  if (
    /\b(location|position|duration)\b/i.test(s) &&
    !/\b(SAP|FSCD|ATTP|EPCIS|FICO|HANA|ABAP|API)\b/i.test(s)
  ) {
    return null;
  }
  if (/^\d+\+?\s*(months?|years?)\b/i.test(s)) return null;
  if (/^[-–—*•]+$/.test(s)) return null;
  if (/\s{2,}/.test(s) && s.split(" ").length > 6) return null;
  // Drop long sentence-like fragments
  if (s.split(/\s+/).length > 5 && !/^[A-Z0-9/.\-+ ]+$/.test(s)) return null;
  return s;
}

function scrubSkillsLine(line: string): string | null {
  // Legacy "JD focus phrases: Location · Position · …" — never keep the dump line
  if (JD_FOCUS_DUMP_LINE.test(line.trim())) {
    const body = line.replace(/^[^:]+:\s*/, "");
    const parts = body
      .split(/\s*[·|•,]\s*/)
      .map(cleanSkillToken)
      .filter(Boolean) as string[];
    // Only recover clearly technical tokens; drop geo/meta entirely
    const tech = parts.filter((p) =>
      /SAP|FSCD|ATTP|EPCIS|GS1|DSCSA|HANA|S\/4|FICO|ABAP|API|RAR|IFRS|BW|BTP|CPI|EWM|Agile|Scrum|SQL|ETL|OData|JSON|XML/i.test(
        p
      )
    );
    if (!tech.length) return null;
    return `Core: ${tech.slice(0, 12).join(" · ")}`;
  }
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

/**
 * Environment = tools/platforms only.
 * 1) Drop soft duties / title fragments (shared filter)
 * 2) Domain scrub (ATTP vs FICO, clinical)
 */
function scrubEnvironmentLine(line: string, jd: string, master: string): string {
  if (!isEnvironmentMetaLine(line) && !/^environment\s*:/i.test(line.trim())) {
    return line;
  }
  // Tools-only first pass (kills "facilitating workshops", truncated titles)
  let cleaned = scrubEnvironmentLineText(line, { max: 10 });
  if (!cleaned) {
    return isAttpJd(jd)
      ? "Environment: SAP ATTP · EPCIS · GS1"
      : ""; // drop empty junk lines
  }

  const label = cleaned.match(/^([^:]+):\s*/)?.[1] || "Environment";
  const body = cleaned.replace(/^[^:]+:\s*/, "");
  let parts = body
    .split(/\s*[·|,]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      if (p.length >= 40) return false;
      if (SKILL_GARBAGE.test(p)) return false;
      if (INDUSTRY_ENV_LEAK.test(p) && !INDUSTRY_ENV_LEAK.test(master || "")) {
        return false;
      }

      // ATTP / serialization JD: NEVER leave FICO / pure finance stack
      if (isAttpJd(jd)) {
        if (FICO_HEAVY.test(p)) return false;
        if (/^sap$/i.test(p)) return false;
        if (ATTP_STACK_OK.test(p) || ATTP_SIGNAL.test(p)) return true;
        if (/\b(fico|cfin|copa|mm-fi|sd-fi|asset|ledger)\b/i.test(p)) return false;
        return true;
      }

      if (
        isClinicalOnlyJd(jd) &&
        (FICO_HEAVY.test(p) || /\bsap\b|s\/4|fico/i.test(p))
      ) {
        return false;
      }
      return true;
    });

  if (isAttpJd(jd)) {
    parts.sort((a, b) => {
      const sa = ATTP_SIGNAL.test(a) || ATTP_STACK_OK.test(a) ? 0 : 1;
      const sb = ATTP_SIGNAL.test(b) || ATTP_STACK_OK.test(b) ? 0 : 1;
      return sa - sb;
    });
    if (!parts.some((p) => ATTP_SIGNAL.test(p))) {
      parts = ["SAP ATTP", "EPCIS", "GS1", ...parts];
    }
  }

  if (!parts.length) {
    return isAttpJd(jd)
      ? `${label}: SAP ATTP · EPCIS · GS1`
      : "";
  }
  return `${label}: ${Array.from(new Set(parts)).slice(0, 8).join(" · ")}`;
}

function scrubExperienceBlock(lines: string[], jd: string, master: string): string[] {
  const out: string[] = [];
  let bulletCount = 0;
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
    if (isEnvironmentMetaLine(line) || /^environment\s*:/i.test(line)) {
      const env = scrubEnvironmentLine(line, jd, master);
      if (env) out.push(env);
      continue;
    }
    // Title line
    if (
      !/^[•\-–—*▸]/.test(line) &&
      !/\|\s*\d{4}/.test(line) &&
      line.length < 100 &&
      bulletCount === 0 &&
      !/^(environment|stack)/i.test(line)
    ) {
      // Prefer JD-family titles already set; strip accidental "FICO" if JD is ATTP
      let t = line.replace(/^[\-\–—•*]+\s*/, "").trim();
      if (isAttpJd(jd) && FICO_HEAVY.test(t) && !ATTP_SIGNAL.test(t)) {
        // leave progressive title from code; if title still FICO, force ATTP framing
        t = t.replace(/\bFICO\b/gi, "ATTP").replace(/\bFI\/CO\b/gi, "ATTP");
      }
      out.push(t);
      continue;
    }
    // Bullets: on ATTP JD, drop pure FICO bullets (month-end, CO-PA, etc.)
    if (/^[•\-–—*▸]/.test(line) || line.startsWith("•")) {
      const body = line.replace(/^[•\-–—*▸]\s*/, "");
      if (isAttpJd(jd) && FICO_HEAVY.test(body) && !ATTP_SIGNAL.test(body)) {
        // skip pure finance bullets on ATTP packs
        continue;
      }
      if (isClinicalOnlyJd(jd) && (FICO_HEAVY.test(body) || /\bsap\s+fico\b/i.test(body))) {
        continue;
      }
      bulletCount++;
      out.push(line.startsWith("•") ? line : `• ${body}`);
      continue;
    }
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

    // Summary — always keep dense impersonal block (target 10 lines).
    // Never inject third-person bio ("Name targets…", "positioned as…").
    if (/summary|profile|pitch/i.test(h)) {
      let lines = sec.lines
        .filter((l) => !BOOSTER_LINE.test(l.trim()))
        .filter((l) => !/^delivery focus:/i.test(l.trim()))
        .map((l) =>
          l
            .replace(/\bis positioned as (an?|the)\s+/gi, "")
            .replace(/\bpositioned as (an?|the)\s+/gi, "")
            .replace(/\bI am (an?|the)\s+/gi, "")
            .replace(/\bI'm (an?|the)\s+/gi, "")
            .replace(/\bI have\b/gi, "Holds")
            .replace(/\bI\b/g, "")
            .replace(/\bmy\b/gi, "the")
            .replace(/\s*-\s*SAP/g, " SAP")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(
          (l) =>
            l.length > 28 &&
            !/\bis positioned as\b/i.test(l) &&
            !/without claiming a specialty career/i.test(l)
        );
      // Product rule: keep up to 10 jargon-dense summary lines
      if (jobTitle && lines[0]) {
        const titleRe = new RegExp(
          jobTitle.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        );
        if (!titleRe.test(lines[0]) && !titleRe.test(lines.join(" "))) {
          lines = [
            `${jobTitle} profile with progressive enterprise delivery across design, configuration, integration, and production support.`,
            ...lines,
          ];
        }
      }
      return { ...sec, lines: lines.slice(0, 10) };
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
    .replace(/\bis positioned as (an?|the)\s+/gi, "")
    .replace(/positioned as a\s*-\s*/gi, "")
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
