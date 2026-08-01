/**
 * JD phrase extraction + honest emergency fill helpers.
 * Tunables (patterns, templates) come from admin Resume Engine Policy.
 */

import { extractJdKeywords, type DomainHint } from "./jd-parse";
import {
  applyEmergencyTemplate,
  DEFAULT_RESUME_ENGINE_POLICY,
  tryRegExp,
  type ResumeEnginePolicy,
} from "./resume-engine-policy";
import type { StructureProject } from "./layout-structures";

/**
 * Critical phrases that appear IN the JD text only.
 * Pattern list is admin-maintained via Resume Engine Policy.
 */
export function criticalJdPhrases(
  jd: string,
  _domain?: DomainHint,
  policy: ResumeEnginePolicy = DEFAULT_RESUME_ENGINE_POLICY
): string[] {
  void _domain;
  const text = jd || "";
  const out: string[] = [];
  const push = (p: string) => {
    const s = (p || "").replace(/\s+/g, " ").trim();
    if (s.length < 2 || s.length > 80) return;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  };

  const sapHits =
    text.match(
      /SAP\s+[A-Za-z0-9/.\-+]{2,28}(?:\s+[A-Za-z0-9/.\-+&]{2,24}){0,5}/gi
    ) || [];
  for (const h of sapHits.slice(0, 12)) push(h);

  for (const source of policy.criticalPhrasePatterns) {
    const re = tryRegExp(source, "gi");
    if (!re) continue;
    re.lastIndex = 0;
    const m = text.match(re);
    if (m?.[0]) push(m[0].replace(/\s+/g, " ").trim());
  }

  for (const k of extractJdKeywords(text, 20)) push(k);

  return out.slice(0, 16);
}

export function cleanMasterBullets(
  masterBullets: string[],
  max = 8
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of masterBullets || []) {
    const b = String(raw)
      .replace(/^[•▸→–\-\*◆›]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (b.length < 28 || b.length > 260) continue;
    if (/@|near-100%|keyword coverage|staffing|80\s*\/\s*hr|role\s*::/i.test(b))
      continue;
    if (/^(professional summary|technical skills|experience)\b/i.test(b))
      continue;
    const k = b.toLowerCase().slice(0, 50);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Soft fill when AI + master sparse. Templates from admin policy.
 * Disabled when policy.emergencyFill is false.
 */
export function domainProofBullets(
  domain: DomainHint | string,
  era: StructureProject["era"],
  client: string,
  jobTitle: string,
  skillBank: string[] = [],
  policy: ResumeEnginePolicy = DEFAULT_RESUME_ENGINE_POLICY
): string[] {
  if (!policy.emergencyFill) return [];

  const c = (client || "the client").trim();
  const role = (jobTitle || "Consultant").trim();
  const skills = skillBank.filter((s) => s && s.length > 1).slice(0, 6);
  const vars = {
    role,
    client: c,
    skills: skills.slice(0, 3).join(", ") || role,
    s0: skills[0] || role,
    s1: skills[1] || skills[0] || "core process areas",
    s2: skills[2] || skills[1] || "integration touchpoints",
  };

  const key =
    era === "recent" ? "recent" : era === "early" ? "early" : "mid";
  let tmpls = policy.emergencyBullets[key] || [];

  // Clinical / non-SAP domains: strip SAP go-live ritual templates (cutover/hypercare)
  const d = String(domain || "").toLowerCase();
  if (d === "clinical-dm" || d.includes("clinical")) {
    tmpls = tmpls.filter(
      (t) => !/\b(cutover|hypercare|SIT\/UAT evidence packs|configuration trackers)\b/i.test(t)
    );
    // Transferable density fillers (honest, not clinical ownership claims)
    const transferable = [
      "Supported {role}-aligned delivery for {client}, emphasizing data quality, documentation, and stakeholder coordination around {s0}.",
      "Partnered with business and technical owners on process clarity, validation evidence, and release readiness at {client}.",
      "Built test evidence and issue logs for {s0}-related scenarios supporting {client} workstreams.",
      "Maintained clear status cadence, defect notes, and handoff materials for {client}.",
      "Facilitated workshops and walkthroughs covering {skills} with {client} stakeholders.",
      "Validated end-to-end scenarios spanning {s0} and {s1}, capturing defects and retest proof for {client}.",
      "Produced functional notes and evidence packs aligned to {role} delivery expectations on {client}.",
      "Collaborated across teams to resolve data and process issues affecting {client} timelines.",
      "Documented open questions, owners, and closure criteria used in {client} steering updates.",
      "Reinforced delivery discipline (notes, retests, status inputs) under {role} scope for {client}.",
    ];
    tmpls = [...tmpls, ...transferable];
  }

  return tmpls
    .map((t) => applyEmergencyTemplate(t, vars))
    .filter(Boolean)
    .filter((b) => {
      if (d === "clinical-dm" || d.includes("clinical")) {
        return !/\b(cutover|hypercare|RICEFW|blueprinting)\b/i.test(b);
      }
      return true;
    });
}

export function hasCriticalJdCoverage(
  text: string,
  phrases: string[],
  minRatio = 0.5
): boolean {
  if (!phrases.length) return true;
  let hit = 0;
  for (const p of phrases) {
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(text)) hit++;
  }
  return hit / phrases.length >= minRatio;
}
