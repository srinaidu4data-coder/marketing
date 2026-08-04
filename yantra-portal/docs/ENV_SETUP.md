# Role Forge — Environment setup checklist

## Production status (Vercel project `roleforge`)

| Variable | Required | Purpose | Status |
|----------|----------|---------|--------|
| `DATABASE_URL` | Yes | Neon Postgres | Set |
| `DIRECT_URL` | Yes | Neon direct (migrations) | Set |
| `NEXTAUTH_URL` | Yes | Public site URL | Set → `https://roleforge-tau.vercel.app` |
| `NEXTAUTH_SECRET` | Yes | Session signing | Set |
| `OPENAI_API_KEY` | Yes | AI resumes | Set |
| `OPENAI_MODEL` | Recommended | Default `gpt-4o-mini` | Set |
| `OPENAI_BASE_URL` | Recommended | `https://api.openai.com/v1` | Set |
| `EMAIL_FROM` | Yes for real mail | `Role Forge <noreply@contact.srsoftllc.com>` | **Ready** (Yantra domain) |
| `EMAIL_DRY_RUN` | Yes | `false` for real delivery | **Ready** (`false`) |
| `RESEND_FROM_EMAIL` | Optional | Bare-from alias | Ready |
| **`RESEND_API_KEY`** | **Yes for real mail** | `re_…` from Resend / Yantra | **WAITING — add when you have it** |
| `EMAIL_REPLY_TO` | Optional | Default reply-to | Optional |
| `EMAIL_CC` | Optional | Always CC | Optional |
| `EMAIL_BCC_OPS` | Optional | Yantra ops BCC | Optional |

## Add Resend API key only (when ready)

Everything else is already configured. When you have the key:

### Option A — Vercel Dashboard

1. [Vercel](https://vercel.com) → **roleforge** → **Settings → Environment Variables**
2. Add:
   ```text
   RESEND_API_KEY=re_xxxxxxxx
   ```
   Targets: **Production** (+ Preview if you want)
3. **Redeploy** production

### Option B — CLI (from `yantra-portal`)

```bash
node scripts/upsert-resend-env.mjs --with-key re_YOUR_KEY
```

Then redeploy (push or Vercel Redeploy).

### Where to get the key

- Copy from **Yantra** Vercel project env (`RESEND_API_KEY`), **or**
- [resend.com/api-keys](https://resend.com/api-keys) on the same account that verified `contact.srsoftllc.com`

## Already set for you

```text
EMAIL_FROM=Role Forge <noreply@contact.srsoftllc.com>
RESEND_FROM_EMAIL=noreply@contact.srsoftllc.com
EMAIL_DRY_RUN=false
```

Domain **`contact.srsoftllc.com`** is the same verified domain Yantra uses.

## Verify after key + redeploy

1. **Admin → Settings** → Resend mode should be **`resend`** (not `simulated` / `dry_run`)
2. Chain → **Send to vendor** → vendor inbox receives mail
3. **Admin → Email activity** → Resend id present
4. [Resend dashboard](https://resend.com/emails) → delivery status

## Modes

| Mode | Meaning |
|------|---------|
| `resend` | Real email (key set, dry-run off) |
| `dry_run` | Key present but `EMAIL_DRY_RUN=true` |
| `simulated` | No `RESEND_API_KEY` — app marks sent, **no inbox delivery** |

## Local `.env`

```bash
cp .env.example .env
# Uncomment and paste RESEND_API_KEY when you have it
```
