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

## FREE (maximize JD fit — still must match JD domain)
- jobTitle, summary bullets, skills, **project roles**, techStack, environment, bullets
- Prefer master metrics; qualitative impact if no numbers. Never invent employers/dates/degrees/certs.

## EVERY PROJECT JD REWRITE (mandatory — not only recent)
- For **every** projects[i] (0..n-1): rewrite **role**, techStack, environment, and **all** bullets into the **JD domain language**.
- **FORBIDDEN:** keep master role titles (e.g. FICO/RTR Architect) when JD is another domain (e.g. BRIM / data migration).
- **FORBIDDEN:** only rewrite projects[0] / recent and leave mid/early as master copy.
- header.jobTitle and **every** project.role must read as the target JD role family (same domain).

## ACCUMULATE (multi-pass Fit repair)
- When PRIOR JSON / repair feedback is present: **keep** prior techStack tools, skills, environment tokens, and strong bullets.
- **Add** missing JD keywords and **phrases** (multi-word Fit items) — do not wipe a 5-tool stack down to 2.
- Weave every listed missing PHRASE into stack, environment, summary, or bullets (exact phrasing when honest).

## BUDGET (latency + quality)
- professionalSummary.bullets: 6–8
- **Every** project: **8–12** bullets (never fewer than 8 — ship gate)
- Prefer recent slightly denser; still min 8 on mid/early
- Maximum ~48 project bullets total across all projects
- No duplicates, no filler, no engagement-goals (N/M) lines
- **Every** project MUST include non-empty **techStack** and **environment**
- **techStack / environment = NOUN tools only** (e.g. SAP IBP, S/4HANA, CPI, Jira, ServiceNow, Public Cloud)
- **FORBIDDEN in techStack/environment:** requirement phrases, "hands-on", "expertise", "candidate must", "strong experience", multi-clause prose
- Capability **phrases** belong in **summary and bullets only**, never in Tech Stack

## CRAFT
- JD terms in summary, skills, **every** project role/stack/env/bullets
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
