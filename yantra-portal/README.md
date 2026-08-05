# Role Forge — Marketing Co-Pilot

Production (Vercel project **roleforge**):  
https://roleforge-tau.vercel.app

AI-powered recruitment operations for SAP CTC / C2C staffing (SR SOFT LLC).

## Quick start

```bash
cd yantra-portal
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost:3000

### Demo logins (same as production MVP)

| Role     | Email                    | Password     |
|----------|--------------------------|--------------|
| Admin    | admin@srsoft.com         | admin123     |
| Employee | sowmya@srsoftllc.com     | employee123  |
| Employee | akanksha@srsoftllc.com   | employee123  |

## Feature parity

### Auth
- NextAuth credentials provider
- Role-based routing: ADMIN → `/admin`, EMPLOYEE → `/`
- Session max age 12h
- Sign out

### Admin
- Console home tiles
- Candidates: list, add, view, edit, delete, master resume upload/replace/download/preview
- Allocations: assign candidates to employees
- Chains: system-wide list + detail (preview/download/send)
- Prompt template: locked preamble, editable body, version history, save/promote/rollback/test
- Email template: subject + body, rendered preview, version history, promote/rollback
- Analytics: range filters, KPIs, leaderboard, AI cost, audit catalog coverage
- Profile

### Employee
- Home: welcome, pool, recent chains
- Your Chains list
- Start New Chain (job requirement, vendor, multi-candidate selection → generate tailored resumes)
- Chain detail: preview, download, send all
- Profile

### APIs
- `POST /api/chains` (Zod validation matching live field names)
- `POST /api/allocations`
- `GET /api/health`
- `GET /api/chains/:id/candidates/:ccId/download`
- `GET /api/candidates/:id/download`
- NextAuth `/api/auth/*`

### AI resume tailoring
- Uses active admin prompt template
- Optional OpenAI-compatible API via `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`
- Deterministic local tailor fallback when no key is set
- Usage logged in `ApiUsageLog` for analytics

### Audit
Full `AUDIT_ACTIONS` catalog parity with production analytics surface.

## Certificate

See `CERTIFICATE_OF_COMPLETENESS.md` for the formal parity certificate and verification checklist.

## Stack

- Next.js 14 (App Router)
- TypeScript + Tailwind CSS
- NextAuth.js (credentials)
- Prisma + SQLite
- Zod validation
- Lucide icons
