# Role Forge Resume Engine v2 — Modules & Techniques

## Problem solved
Earlier versions produced **one flat format** for every candidate and did not prevent
sending the **same person under different skills** to the same vendor.

## Modules delivered

### 1. Multi-layout template library (`src/lib/resume/templates.ts`)
Six visually distinct, ATS-safe single-column layouts assigned **on the candidate profile**:

| ID | Name | Personality |
|----|------|-------------|
| `ats_classic` | ATS Classic | Max parser safety |
| `executive_serif` | Executive Serif | Leadership / architect |
| `technical_dense` | Technical Dense | Module-heavy specialists |
| `timeline_progressive` | Timeline Progressive | Career growth story |
| `modern_minimal` | Modern Minimal | Clean US C2C brand |
| `consultant_band` | Consultant Band | Accent header band |

Layouts differ in typography, bullets, dividers, accent colors, skill separators, and header treatment so a multi-candidate pack does **not** look identical.

**Export formats (candidate level):**
- `DOCX` (default)
- `DOCX_PDF` (both)

### 2. Progressive ATS tailor (`src/lib/resume/progressive-tailor.ts`)
Global best-practice synthesis:

1. **Single-column ATS structure** (Workday / Greenhouse / Lever safe)  
2. **JD keyword weaving** without stuffing  
3. **Recency weighting** — last **two** projects get strongest role/responsibility match  
4. **Temporal skill integrity** — tools only appear in eras they belong (e.g. no S/4HANA in 2008 projects)  
5. **Progressive narrative** — early career balanced, not oversold; shows gradual mastery  
6. **Responsibility ↔ role alignment** for JD profile  
7. **Iterative reinforcement** until internal ATS **≥ 95** (up to 3 passes)

### 3. Internal ATS scorer (`src/lib/resume/ats-scorer.ts`)
Score dimensions (sum ≤ 100), ready flag when **≥ 95**:

- Parse safety (20)
- Keyword coverage (25)
- Role match (20)
- Temporal integrity (15)
- Progressive balance (10)
- Recency emphasis (10)

### 4. Vendor hard-block guard (`src/lib/resume/vendor-guard.ts`)
Ledger table `VendorSubmission` records candidate + vendor + skill fingerprint + job title.

**Rule:** If the same candidate was already sent to the same vendor email under a **different** skill/job-title fingerprint → **HARD BLOCK** with modal popup.  
Prevents vendors from holding multiple skill-flavored resumes for one person.

### 5. Renderers
- `render-docx.ts` — real `.docx` via `docx` package  
- `render-pdf.ts` — real `.pdf` via `pdfkit` (when export format is DOCX_PDF)

## UI touchpoints
- Admin → Candidates → create/edit: layout picker + export format  
- Employee → New Chain: shows each candidate’s layout; blocks on conflict  
- Chain detail: ATS score, layout name, TXT/DOCX/PDF downloads  

## Honest limits
- “100% ATS” is **internal** Role Forge scoring ≥ 95, not a third-party Jobscan guarantee.  
- Temporal rules use a curated tech-era map (extendable).  
- Master resumes uploaded as binary DOCX still need text extraction for best results (upload `.txt` or paste-rich masters).  
