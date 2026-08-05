# Granular Live vs Clone Parity Report

**Date:** 2026-07-29  
**Source:** https://roleforge-tau.vercel.app/  
**Clone:** http://localhost:3000  
**Automated proof:** `node scripts/granular-parity.mjs` → **30/30 PASS**

---

## Critical bugs found & fixed

### 1. Allocations (your main report)
| Live | Clone before | Clone after |
|------|--------------|-------------|
| **Checkbox matrix** candidates × employees | Dropdown + Save button (wrong) | **Matching checkbox grid** |
| Instant toggle via `POST /api/allocations` | Server form only | Instant fetch toggle |
| Body: `{ candidateId, employeeId, allocated: bool }` | Wrong/partial schema | **Exact live contract** |
| Multi-employee per candidate allowed | Forced single employee | **Multi-employee OK** |
| Filter search by name/email | None | **Filter search** |
| Stats: candidates, employees, allocations, allocated, unallocated | None | **All stats** |
| Spinner on pending cell | None | **Spinner** |
| aria-label Assign/Unassign Name to/from Employee | None | **Matching aria-labels** |

### 2. Candidate selection on New Chain
| Live | Before | After |
|------|--------|-------|
| Select all / Select none buttons | Missing | **Present** |
| Per-candidate checkboxes | Static defaultChecked only | **Controlled checkboxes** |
| Filter by name/email | Missing | **Present** |
| Dynamic "Generate N resumes" | Weak | **Live count** |
| Placeholder job text | Generic | **Vendor email / job board copy** |

### 3. Missing admin surfaces
| Route | Live | Clone |
|-------|------|-------|
| `/admin/settings` | Yes | **Added** |
| `/admin/queues` | Yes | **Added** |
| Nav: Settings, Queues | Yes | **Added** |

### 4. Login routing
| Live | Before | After |
|------|--------|-------|
| Admin lands console | Often stuck on `/` | **Role-aware redirect to `/admin`** |

---

## Full surface checklist (functionality copied)

### Auth
- [x] Email/password credentials
- [x] CSRF session cookies
- [x] Admin vs Employee roles
- [x] Middleware protection
- [x] Sign out
- [x] Role-based landing

### Admin — Candidates
- [x] List Name / Email / Created / Actions
- [x] Add Candidate (name, email, layout, export, resume file)
- [x] View detail
- [x] Edit name/email
- [x] Layout template picker (6 layouts)
- [x] Export DOCX / DOCX+PDF
- [x] Master resume preview (500 chars)
- [x] Download master
- [x] Replace master
- [x] Delete (danger zone)
- [x] Vendor submission history

### Admin — Allocations (granular)
- [x] Candidate column sticky
- [x] Employee columns (name + email)
- [x] Checkbox per cell
- [x] Optimistic update
- [x] Error per candidate row
- [x] Filter candidates
- [x] Counts bar
- [x] API validation shape

### Admin — Chains
- [x] System-wide table Employee / Vendor / Status / Candidates / Created
- [x] Chain detail Preview / Download / Send / ATS / Layout

### Admin — Prompt
- [x] Locked preamble
- [x] Editable middle + placeholders
- [x] Save as New Version
- [x] Test Mode Run Test
- [x] Version history Diff / Promote / Rollback

### Admin — Email Template
- [x] Subject + Body
- [x] Rendered preview (Jane Smith sample)
- [x] Save / Promote / Rollback / Diff

### Admin — Analytics
- [x] Range filters 7d / Today / Month
- [x] KPIs
- [x] Leaderboard
- [x] Test-mode cost toggle
- [x] Audit catalog coverage

### Admin — Settings / Queues
- [x] Settings hub links
- [x] Queues status table

### Employee
- [x] Home Welcome / Pool / Recent Chains
- [x] Start New Chain CTA
- [x] Your Chains table
- [x] New Chain form full controls
- [x] Chain detail Send all / Preview / TXT DOCX PDF
- [x] Vendor hard-block modal
- [x] Profile read-only

### APIs
- [x] POST /api/allocations `{candidateId,employeeId,allocated}`
- [x] POST /api/chains validation
- [x] GET downloads
- [x] GET /api/health
- [x] NextAuth

---

## How to verify manually (2 min)

1. http://localhost:3000/login → `admin@srsoft.com` / `admin123`
2. **Allocations** → checkbox grid → click cells (instant) → filter box
3. **Employee** `sowmya@srsoftllc.com` / `employee123`
4. **New Chain** → Select none → Select all → uncheck a few → Generate

```bash
node scripts/granular-parity.mjs
```
