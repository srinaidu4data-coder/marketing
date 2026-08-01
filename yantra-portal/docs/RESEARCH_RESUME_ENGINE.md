# Role Forge Resume Engine — Research Foundations

This document maps **published, established ideas** (psychology, business writing, IR/CS) into product behavior. It does **not** claim we re-read every paper of 25 years; it encodes the highest-leverage, well-replicated principles into generation rules.

## Psychology

| Principle | Classic anchors | Product rule |
|-----------|-----------------|--------------|
| Serial position (primacy/recency) | Murdock 1962; Glanzer & Cunitz 1966 | JD-dense proof in first screen; strongest bullets first in recent roles |
| Peak–end rule | Kahneman et al. | Close roles with impact / hypercare / KT |
| Processing fluency | Reber & Schwarz; Alter & Oppenheimer | Exact JD acronyms; short scannable titles |
| Schema match | Category accessibility tradition | Headline + recent/mid titles = JD job title |
| Dual-process / thin-slice | Kahneman System-1; Ambady & Rosenthal | 6–8s scan must read as fit |
| Cognitive load | Sweller | Chunk skills; blank lines between projects |
| Narrative identity | McAdams | Progressive early → mid → recent ownership |

## Business communication

| Framework | Anchor | Product rule |
|-----------|--------|--------------|
| Minto Pyramid | Barbara Minto | Claim (title/summary) before evidence (projects) |
| SCQA | McKinsey | Consultant layout: situation → proof → cases |
| AIDA / one-pager | Marketing | Title attention → skills interest → impact desire → experience action |

## CS / information retrieval (how ATS ranks)

| Idea | Anchor | Product rule |
|------|--------|--------------|
| Vector space / TF–IDF / cosine | Salton et al. 1975; modern ATS | ≥90% critical JD keyword coverage |
| Embedding similarity | Sentence-BERT (Reimers & Gurevych 2019); resume–JD ranking literature | Multi-pass refine until match gate |
| Parse safety | Workday/Greenhouse heuristics | Single-column linear sections |

## Signaling / integrity

| Idea | Anchor | Product rule |
|------|--------|--------------|
| Costly signals | Spence | Real employers + dates required |
| Cheap-signal ban | Fraud heuristics | No invented metrics, rates, fake certs |

## Classical craft (ethical constraints)

| Idea | Meaning | Product rule |
|------|---------|--------------|
| Satya | Truth | Never invent employers/dates/education |
| Yukti | Skillful means | Same truth, JD language |
| Viveka | Discrimination | Specialized tools on recent/mid only |
| Dharma of craft | Worthy work | Client-submittable without human rewrite |

## Multi-pass pipeline

1. ACTIVE admin prompt + OpenAI → JSON  
2. Layout spine (`buildSectionsForLayout`)  
3. QA repair (duplicate sections, identity leaks)  
4. Match gate (coverage, title, employers, ATS ≥ 95)  
5. Refine passes until gate passes (max 3)  
6. Soft keyword inject into skills if still short  

## Layout non-isomorphism

Each of the six layouts opens with a **different first section** and rhetoric (see `LAYOUT_RHETORIC` in `research-foundations.ts`).
