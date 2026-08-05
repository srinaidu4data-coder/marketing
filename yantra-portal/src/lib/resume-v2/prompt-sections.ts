/**
 * Prompt Lab — modular slices of the Bible for creative section testing.
 * Each section can be run alone or composed into a full prompt.
 */

export type PromptSectionId =
  | "precheck"
  | "header"
  | "summary"
  | "skills"
  | "projects"
  | "education"
  | "certs"
  | "honesty"
  | "ats_self"
  | "psych_self"
  | "style"
  | "json_contract"
  | "full_bible";

export type PromptSection = {
  id: PromptSectionId;
  title: string;
  emoji: string;
  blurb: string;
  color: string;
  /** Standalone micro-prompt for section-only tests */
  microPrompt: string;
  /** What JSON (or text) this section test expects */
  expectHint: string;
};

export const PROMPT_LAB_SECTIONS: PromptSection[] = [
  {
    id: "precheck",
    title: "Prechecks",
    emoji: "🔍",
    blurb: "Gatekeeping before writing — name, email, project count, JD presence.",
    color: "bg-slate-100 border-slate-300",
    expectHint: "JSON: { ok, errors[], warnings[], contact, projectCount }",
    microPrompt: `You are a resume precheck auditor. Given MASTER + JD, return JSON only:
{
  "ok": boolean,
  "errors": string[],
  "warnings": string[],
  "contact": { "name": "", "email": "", "phone": "", "linkedin": "" },
  "projectCount": number,
  "jdTitleGuess": string,
  "criticalJdTokens": string[]
}
Rules: extract contact from MASTER only; count distinct employers/projects; never invent email/name.`,
  },
  {
    id: "header",
    title: "Header",
    emoji: "👤",
    blurb: "Job title (AI/JD), name, phone, email, location, LinkedIn.",
    color: "bg-emerald-50 border-emerald-300",
    expectHint: "JSON header object only",
    microPrompt: `Produce ONLY the resume header as JSON:
{ "jobTitle": "", "name": "", "phone": "", "email": "", "location": "", "linkedin": "" }
jobTitle: derive from JD (not restricted to exact wording) — professional title, not a sentence.
name/phone/email/location/linkedin: from MASTER only; empty string if missing. Never invent contact.`,
  },
  {
    id: "summary",
    title: "Summary (free)",
    emoji: "⚡",
    blurb: "8–14 jargon-rich bullets typical — free count, primacy on JD fit.",
    color: "bg-violet-50 border-violet-300",
    expectHint: "JSON: { bullets: string[] }",
    microPrompt: `Write PROFESSIONAL SUMMARY as JSON: { "bullets": [ 8–14 high-value strings typical ] }
Voice: consulting imperative (Delivered/Architected…), no I/me, no name/email in bullets.
Jargon-rich, JD-aligned; primacy: strongest fit first 3. Free count — quality over quota.`,
  },
  {
    id: "skills",
    title: "Tech Skills",
    emoji: "🛠️",
    blurb: "You choose format — maximize JD token coverage.",
    color: "bg-sky-50 border-sky-300",
    expectHint: "JSON techSkills (string | array | groups)",
    microPrompt: `Produce techSkills JSON only:
{ "techSkills": /* string OR string[] OR { "Core": [], "Platforms": [], "Methods": [] } */ }
JD-first ordering, expand critical acronyms once, dense high-signal items.
No "JD keywords:" labels. Full freedom on format.`,
  },
  {
    id: "projects",
    title: "Projects (locked roster)",
    emoji: "📁",
    blurb: "Same employers/dates as master; free roles, stack, env, bullet counts.",
    color: "bg-amber-50 border-amber-300",
    expectHint: "JSON projects[] — employers & dates locked",
    microPrompt: `Produce projects JSON only:
{ "projects": [ {
  "role": "", "employerOrClient": "", "location": "", "duration": "",
  "techStack": "", "environment": "", "bullets": [/* free count, dense */]
} ] }
Count MUST match MASTER engagements. employerOrClient + duration LOCKED from MASTER.
role/stack/env/bullets: free JD craft. Tools-first stack/env. Recent denser than early.`,
  },
  {
    id: "education",
    title: "Education",
    emoji: "🎓",
    blurb: "Prefer master — free formatting and order.",
    color: "bg-indigo-50 border-indigo-300",
    expectHint: "JSON education[]",
    microPrompt: `Produce education JSON:
{ "education": [ { "school": "", "degree": "", "year": "", "raw": "" } ] }
Prefer MASTER; normalize format. Empty array if none.`,
  },
  {
    id: "certs",
    title: "Certifications",
    emoji: "🏅",
    blurb: "Prefer master certs; reorder by JD relevance; no fake certs.",
    color: "bg-rose-50 border-rose-300",
    expectHint: "JSON certifications[]",
    microPrompt: `Produce { "certifications": string[] } from MASTER certs only by default.
Reorder JD-relevant first. If MASTER has none, return []. Do not invent certifications.`,
  },
  {
    id: "honesty",
    title: "Honesty Audit",
    emoji: "🛡️",
    blurb: "Scan a draft for free metrics, cosplay, invented employers.",
    color: "bg-red-50 border-red-300",
    expectHint: "JSON audit report",
    microPrompt: `You are an honesty auditor. Given MASTER + DRAFT (or JD context), return JSON:
{
  "pass": boolean,
  "freeMetrics": string[],
  "inventedEmployers": string[],
  "inventedDates": string[],
  "industryCosplay": string[],
  "yearsClaimCount": number,
  "fixes": string[]
}
Flag any number not in MASTER as free metric. Fail if employers/dates not in MASTER.`,
  },
  {
    id: "ats_self",
    title: "ATS Self-Check",
    emoji: "🎯",
    blurb: "Keyword coverage, title match, page-1 density advice.",
    color: "bg-orange-50 border-orange-300",
    expectHint: "JSON ATS self assessment",
    microPrompt: `ATS self-check. Given JD + RESUME DRAFT text (or pack), return JSON:
{
  "estimatedCoveragePct": number,
  "presentKeywords": string[],
  "missingKeywords": string[],
  "titleAlignment": "strong"|"weak"|"none",
  "page1Advice": string[],
  "wouldLikelyBeat95": boolean
}
Be harsh and specific. Prefer exact JD tokens.`,
  },
  {
    id: "psych_self",
    title: "Psych Self-Check",
    emoji: "🧠",
    blurb: "Credibility dimensions: honesty, identity, first screen.",
    color: "bg-fuchsia-50 border-fuchsia-300",
    expectHint: "JSON psych self assessment",
    microPrompt: `Psych/credibility self-check. Return JSON:
{
  "scoreGuess": number,
  "industryHonesty": "pass"|"fail",
  "freeMetrics": "pass"|"fail",
  "employerFidelity": "pass"|"fail",
  "titlePolicy": "pass"|"fail",
  "oneYearsClaim": "pass"|"fail",
  "firstScreen": "pass"|"fail",
  "warnings": string[]
}
Compare draft against MASTER + JD.`,
  },
  {
    id: "style",
    title: "Style Forge",
    emoji: "✨",
    blurb: "Buzzword forge — rewrite 5 weak bullets into elite consulting voice.",
    color: "bg-yellow-50 border-yellow-400",
    expectHint: "JSON: { rewritten: string[5] }",
    microPrompt: `Style forge: Given JD + weak lines (or invent 5 weak lines from MASTER facts), return:
{ "rewritten": [ exactly 5 elite consulting bullets ] }
Power verbs, JD jargon, no invented metrics, scannable parallel structure.`,
  },
  {
    id: "json_contract",
    title: "JSON Contract",
    emoji: "📦",
    blurb: "Validate/repair a pack to exact 12×12 schema.",
    color: "bg-stone-100 border-stone-400",
    expectHint: "Full pack JSON with exact lengths",
    microPrompt: `Repair or produce a full resume pack JSON with HARD rules:
- professionalSummary.bullets length === 12
- every projects[i].bullets length === 12
- projects count matches MASTER
- header.name + header.email required
Return JSON only. No markdown fences.
Keys: header, professionalSummary, techSkills, education, certifications, projects.`,
  },
  {
    id: "full_bible",
    title: "Full Bible",
    emoji: "📖",
    blurb: "Entire mega-prompt — end-to-end pack generation.",
    color: "bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-400",
    expectHint: "Full ResumePackV2 JSON",
    microPrompt: "", // filled from BIBLE_PROMPT at runtime
  },
];

export function getSection(id: PromptSectionId): PromptSection {
  return (
    PROMPT_LAB_SECTIONS.find((s) => s.id === id) || PROMPT_LAB_SECTIONS[0]!
  );
}
