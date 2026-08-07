# Single database policy (OpenAI + Claude + Grok consensus)

**One Postgres. One Admin roster. Everywhere.**

| Surface | Database |
|---------|----------|
| Admin UI (roleforge-tau.vercel.app) | Vercel Production `DATABASE_URL` |
| Local `npm run dev` | **Same** `DATABASE_URL` |
| Scripts (serialize, reparse, probes) | **Same** `DATABASE_URL` |

## Why two DBs broke us

`file:./dev.db` was a **second** candidate list:

| | Local SQLite | Admin Postgres |
|--|--------------|----------------|
| Sri email | `srinaidu582@gmail.com` | `srinaidusfdc@gmail.com` |
| Deletes | only local | only prod |
| Agents | answered from wrong DB | — |

## Review consensus (fix)

| Lens | Finding | Fix |
|------|---------|-----|
| **OpenAI (ops)** | Dual schema + dual env = guaranteed drift | One `schema.prisma` = Postgres; `predev` + `db:check` refuse sqlite |
| **Claude (safety)** | Silent fallback to sqlite hides errors | `assertSingleDatabaseUrl` hard-fails; no soft “ok anyway” |
| **Grok (product)** | User sees one Admin; tools must match | Scripts/dev use only Admin URL; no “clone universe” |

## Setup (local) — do once

1. Vercel → **roleforge** → Settings → Environment Variables  
2. Copy **Production** `DATABASE_URL` + `DIRECT_URL`  
3. Put in **`yantra-portal/.env.local`** (gitignored):

```env
DATABASE_URL="postgresql://…"
DIRECT_URL="postgresql://…"
```

Or:

```bash
set DATABASE_URL=postgresql://...
set DIRECT_URL=postgresql://...
npm run db:use-admin
```

4. Confirm:

```bash
npm run db:check
npm run db:generate
```

Candidates listed by scripts must match Admin.

## Forbidden

- `DATABASE_URL=file:./dev.db` for normal work  
- Expecting local sqlite to match Admin  
- “Soft” second copy of the roster  

Emergency offline only: `ALLOW_SQLITE_CLONE=1` (unsupported for real data).
