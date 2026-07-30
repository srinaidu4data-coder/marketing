# One Structure Per Layout (Understandable Guide)

Every layout uses a **different content skeleton** — not only colors.  
Automated check: `npx tsx scripts/validate-layout-structures.ts` → **all 6 unique**.

## The six spines (must not collapse into each other)

| Layout | Structure name | Section order (what you see) | Reading spine | Feel | Literature (short) |
|--------|----------------|------------------------------|---------------|------|--------------------|
| **ATS Classic** | Canonical Linear Checklist | Professional Summary → Core Competencies → Professional Experience → Education | Claim → Skills → All roles → Close | Corporate, predictable | Schema match + fluency; HR taxonomy |
| **Executive Serif** | Minto Pyramid Brief | Executive Brief → Signature Achievements → Leadership Engagements → Board-Level Competencies → Credentials | **Answer first** → support → detail | Leadership memo | Minto pyramid; construal abstract→concrete |
| **Technical Dense** | Stack-First Modular Spec | Capability Matrix → Systems & Integration Surface → Delivery Metrics → Deep-Dive Engagements → Engineering Practices | Matrix → interfaces → metrics → dives | Engineer / high-SNR | Cognitive load; modular systems; RFP matrix |
| **Timeline Progressive** | Narrative Growth Arc | Career Arc → Chapter Timeline → Skill Evolution → Defining Milestones → Foundation | Story → chrono chapters → peaks | Growth story | McAdams narrative identity; peak-end |
| **Modern Minimal** | Proof-First Sparse One-Pager | **Selected Work** → Keywords → Pitch → Prior Roles → Footnotes | **Work first**; pitch is one line | Airy product sheet | F-pattern; thin-slicing; one-pager |
| **Consultant Band** | SCQA Case-Led Proposal | Situation Snapshot → **Case Portfolio** → Outcome Ledger → Method & Toolkit → Commercial Next Step | Situation → **cases** → method → CTA | Consulting sales pack | McKinsey SCQA; case before claim |

## Why these feel different (not reskins)

| Pair | What would feel the same | How we break it |
|------|--------------------------|-----------------|
| Modern vs ATS | Both open with summary then skills then jobs | Modern opens with **Selected Work**; pitch is a **single line** after keywords; no multi-sentence summary block |
| Executive vs Consultant | Both “claim → proof → portfolio” | Executive = **answer-first pyramid**. Consultant = **SCQA + cases second**, commercial CTA last — cases lead the body, not the abstract brief |
| Timeline vs Modern | Shared “chapters” language | Only Timeline uses **Chapter Timeline / Foundation / Career Arc**. Modern uses **Prior Roles / Footnotes** |
| Tech vs all | Prose summary opens | Tech has **no summary** — Capability Matrix opens with `PRIMARY ::` / `DOMAIN ::` syntax |

## How to read the difference in 5 seconds

Open Preview for two layouts side by side. Compare **section titles only**:

| Layout | First heading must be |
|--------|------------------------|
| Classic | Professional Summary |
| Executive | Executive Brief |
| Tech | Capability Matrix |
| Timeline | Career Arc |
| Minimal | Selected Work |
| Band | Situation Snapshot |

If first headings match across layouts, structures failed.

## Code

- Structures: `src/lib/resume/layout-structures.ts`
- Visual DNA: `src/lib/resume/layout-themes.ts`
- Wired in: `progressiveTailor` → `buildSectionsForLayout(layoutId)`
- UI labels: `layout-picker.tsx` Structure + Aura lines
- Validate: `npx tsx scripts/validate-layout-structures.ts`
