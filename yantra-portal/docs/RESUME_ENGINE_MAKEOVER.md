# Role Forge Resume Engine — Complete Makeover Contract

**Status:** Approved direction from product owner (session answers)  
**Date:** 2026-07-30  
**Scope:** End-to-end resume generation (not only bugfixes)

---

## 1. Product goal

Produce **client-submittable SAP C2C resumes** that:

1. Are **AI-generated** (OpenAI + ACTIVE admin prompt).  
2. Are **100% JD-matched** in jargon, modules, and responsibilities — even when the master has **no** RAR/leasing (or other specialty) text.  
3. Still **derive identity and career skeleton from master** (name, contact, employers, dates, education).  
4. Include **every master project**.  
5. Use a **chosen layout** (research-backed, sharp, not boring).  
6. Pass a **rules checklist before show/download**.  
7. Target **4–5 pages** dense technical detail.

---

## 2. Source-of-truth model (AI + Rules + Prompt)

| Layer | Responsibility |
|--------|----------------|
| **Master resume** | Name, contact, location, LinkedIn, employers, dates, education, certs, raw bullets as *facts*. |
| **Job description** | Job title, required skills/modules/jargon, seniority language. |
| **ACTIVE admin prompt** | Policy: tone, section rules, hard bans (no invented employers/dates). |
| **OpenAI** | Generate summary, skills, impact, **rewritten bullets**, modules/environment, layout-adapted rhetoric. Beef up JD specialty even if absent from master. |
| **Rules engine** | Hard structure: all projects, header rules, title rules, pre-delivery gate. Cannot be skipped. |
| **Layout config** | Section order, headings, visual spine, density — configurable (10–12 layouts). |

**Not allowed:** Silent non-AI fallback that ships as a “tailored” resume.

---

## 3. Header rules (locked)

| Field | Source |
|--------|--------|
| Candidate name | Master only |
| Email, phone, location, LinkedIn | Master only |
| **Resume title / headline** | **JD only** (AI may normalize wording to title-like form) |
| Work auth / extras | Master if present |

Never put name/email under Professional Summary.

---

## 4. Project / role title rules (locked)

| Projects | Role title policy |
|----------|-------------------|
| **Most recent 2** | Must match **JD job title** (schema match for recruiters). |
| **All older projects** | **Supportive / relevant** titles — progressive career story, **not** all identical JD title, **not** fabricated-looking. Humanized. Same domain family (e.g. ABAP / Finance / RAR-adjacent) without cloning the exact JD string on every line. |
| Employers + dates | **Exact from master** — never invent, never drop. |
| Order | Reverse chronological — **do not reorder** by relevance. |

---

## 5. Content when master lacks JD specialty (e.g. no RAR)

**Policy: generate 100% JD-aligned responsibilities anyway.**

- AI must populate: summary, skills, modules/environment, impact, and **project bullets** with RAR / leasing / IFRS 15 / etc. when the JD requires them.  
- Do **not** wait for master to mention specialty.  
- Integrity still holds for: employers, dates, education, name, contact.  
- Progressive honesty on **early** roles: lighter ownership language; depth on recent 2.

---

## 6. Pre-show / pre-download rules gate (hard)

Resume is **blocked or marked unready** until checks pass:

1. Engine = OpenAI (footer / meta proves `OPENAI` + model).  
2. Header: name + contact from master; title from JD.  
3. Project count ≥ master project count (every employer present).  
4. Recent 2 project titles ≈ JD title.  
5. Older titles are non-identical-to-JD where possible (humanized progressive).  
6. Critical JD specialty phrases present (e.g. RAR, IFRS 15, leasing when in JD) at required coverage.  
7. No duplicate Professional Summary / identity leak under summary.  
8. No rates, ROLE::, interview chatter.  
9. Layout applied (section spine matches selected layout config).  
10. ATS internal score ≥ threshold (target 95+).  
11. Length target band: ~4–5 pages (bullet density rules).

---

## 7. Layout system (makeover)

### Target

- **10–12 layouts**, research-oriented (psychology, business writing, CS/IR).  
- **Configurable:** section order, headings, optional sections on/off, density, visual theme.  
- Superbly sharp — not boring clones of the same spine.

### Config shape (proposed)

```ts
type LayoutConfig = {
  id: string;
  name: string;
  researchSpine: string;       // e.g. "Minto pyramid", "Capability matrix"
  pagesTarget: "4-5";
  sections: Array<{
    key: "summary" | "skills" | "impact" | "experience" | "education" | "custom";
    heading: string;
    enabled: boolean;
    order: number;
    maxLines?: number;
  }>;
  style: { /* fonts, accent, bullets, header band, etc. */ };
};
```

### Admin

- Layout library + per-candidate layout pick.  
- Future: admin UI to reorder sections / rename headings without code deploy.

### Research spines (examples for 10–12)

1. ATS Classic — HR schema fluency  
2. Executive Serif — Minto answer-first  
3. Technical Dense — capability matrix / RFP  
4. Timeline Progressive — narrative identity  
5. Modern Minimal — high-SNR sparse  
6. Consultant Band — impact portfolio  
7. Pyramid Brief — claim → proof → detail  
8. Skills-First Modular — dual-column *feel* but single-column safe  
9. Peak–End Case — achievements open  
10. Research Compact — abstract → method → results  
11. F-Pattern Scanner — short labels + dense bullets  
12. Board Memo — construal abstract → concrete  

---

## 8. Pipeline (end-to-end)

```
Master extract → Project anchors (all) → JD parse (title, domain, critical phrases)
       → ACTIVE prompt + OpenAI (JSON or structured sections per layout)
       → Map to layout config
       → Rules: titles (2 recent JD; rest supportive), all projects, header
       → JD specialty weave (if AI under-delivered)
       → QA (dupes, leaks)
       → Match gate (hard checklist)
       → Persist + DOCX/PDF render
       → Show/download only if gate PASS (or explicit REVIEW override for admin)
```

---

## 9. Page density (4–5 pages)

- Recent projects: 12–18 bullets each  
- Mid: 8–12  
- Early: 5–8  
- Full summary + skills + impact + all projects + education  
- No empty filler spam; jargon-rich delivery language  

---

## 10. Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **P0** | Design contract freeze (this doc) |
| **P1** | New `LayoutConfig` model + 10–12 configs; renderers consume config |
| **P2** | New AI generation contract (JSON schema per layout sections) |
| **P3** | Rules engine + hard gate before show |
| **P4** | Title policy: 2 recent = JD; rest humanized supportive |
| **P5** | Specialty full-generate when absent from master |
| **P6** | Admin layout config UI (reorder/rename) |
| **P7** | Vercel deploy + regression samples (RAR, ATTP, FICO) |

---

## 11. Success criteria

- New RAR JD chain → every project from master; recent 2 titles = JD; bullets full of RAR/leasing/IFRS even if master silent.  
- Footer: `OPENAI` + model + layout id + `Gate: PASS`.  
- Download never serves pre-AI or non-matching specialty pack when JD requires specialty.  
- 10–12 layouts visually and structurally distinct.  
- 4–5 page DOCX looks sharp, technical, client-ready.

---

## 12. Explicit non-goals (for v1 makeover)

- Inventing employers, dates, degrees.  
- Multi-column HTML that breaks ATS.  
- Shipping deterministic-only resumes as “AI tailored.”
