# Single database policy

**One Postgres. One Admin roster. Everywhere.**

| Surface | Database |
|---------|----------|
| Admin UI (roleforge-tau.vercel.app) | Vercel Production `DATABASE_URL` |
| Local `npm run dev` | **Same** `DATABASE_URL` |
| Scripts (serialize, reparse, probes) | **Same** `DATABASE_URL` |

## Why

`file:./dev.db` was a **second** candidate list. That caused:

- Local: `srinaidu582@gmail.com`
- Admin: `srinaidusfdc@gmail.com`

Those are different rows in different databases — not “two views of one person.”

## Setup (local)

1. Vercel → Project **roleforge** → Settings → Environment Variables  
2. Copy **Production** `DATABASE_URL` and `DIRECT_URL`  
3. Put them in `yantra-portal/.env.local` (gitignored):

```env
DATABASE_URL="postgresql://…"
DIRECT_URL="postgresql://…"
```

4. Generate client:

```bash
npm run db:generate
```

5. Confirm:

```bash
npm run db:check
```

You should see the same candidates as Admin.

## Forbidden

- `DATABASE_URL=file:./dev.db` for normal work  
- Maintaining a separate “local” roster  
- Expecting scripts on sqlite to match Admin

Emergency offline clone only:

```bash
ALLOW_SQLITE_CLONE=1 DATABASE_URL="file:./dev.db" …
```

That path is unsupported for real data.
