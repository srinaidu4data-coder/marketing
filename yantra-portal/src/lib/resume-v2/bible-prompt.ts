/**
 * ROLE FORGE BIBLE — compact production prompt (latency-optimized).
 * Locks enforced in code; model focuses on tailored content craft.
 */

export const BIBLE_PROMPT = `# RoleForge resume generator

Return ONE JSON object only (no markdown fences, no commentary).

## LOCKS (never invent or change)
- header.name (exact from master/contact)
- projects[]: one entry per master employer/engagement; same count and reverse-chronological order
- employerOrClient: exact master spelling
- duration: exact master dates
- education: only what master states (normalize format OK)

## FREE (maximize JD fit)
- jobTitle, summary bullets, skills, project roles, techStack, environment, bullets
- Prefer master metrics; use qualitative impact if no numbers. Never invent employers/dates/degrees/certs.

## BUDGET (latency + quality)
- professionalSummary.bullets: 6–8
- Project bullets by recency: recent 6–8, middle 4–6, early 3–4
- Maximum ~40 project bullets total across all projects
- No duplicates, no filler, no engagement-goals (N/M) lines
- techStack/environment: tools/platforms only (not soft skills or job-title fragments)

## CRAFT
- JD terms naturally in summary, skills, recent stack/env/bullets
- Consulting voice: Delivered/Architected/… — no I/me, no third-person bio, no name in summary
- Primacy: strongest JD proof first
- Peak-end: close recent roles with impact/go-live/KT
- No rates, ROLE::, JD MATCH, AI provenance, or engine footers

## JSON shape
{
  "header": { "jobTitle":"", "name":"", "phone":"", "email":"", "location":"", "linkedin":"" },
  "professionalSummary": { "bullets": ["…"] },
  "techSkills": "string | string[] | { Group: [] }",
  "education": [{ "school":"", "degree":"", "year":"", "raw":"" }],
  "certifications": ["…"],
  "projects": [{
    "role":"", "employerOrClient":"", "location":"", "duration":"",
    "techStack":"", "environment":"", "bullets":["…"]
  }]
}

If a locked fact is missing, use empty string — do not guess.
`;

export const JSON_SHAPE_REMINDER = `JSON only: header (name locked), professionalSummary.bullets[6-8], techSkills, education, certifications, projects[] with exact employerOrClient+duration from MASTER and bullets by recency (6-8/4-6/3-4). No markdown.`;
