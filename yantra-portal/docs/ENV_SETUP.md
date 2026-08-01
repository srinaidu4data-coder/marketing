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
| `EMAIL_FROM` | Yes for real mail | `Role Forge <you@verified-domain>` | Set (verify value) |
| `EMAIL_DRY_RUN` | Yes | `false` for real delivery | Set to `false` |
| **`RESEND_API_KEY`** | **Yes for real mail** | `re_…` from Resend | **MISSING — add this** |
| `EMAIL_REPLY_TO` | Optional | Default reply-to | Optional |
| `EMAIL_CC` | Optional | Always CC | Optional |

## Add Resend (required for vendor inbox)

1. Open [https://resend.com/api-keys](https://resend.com/api-keys) → create key.
2. Open [https://resend.com/domains](https://resend.com/domains) → add/verify your domain (DNS).
3. In Vercel → **roleforge** → **Settings → Environment Variables**:

```text
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=Role Forge <marketing@YOUR_VERIFIED_DOMAIN.com>
EMAIL_DRY_RUN=false
```

4. Apply to **Production** (and Preview if you want).
5. **Redeploy** production (env changes need a new deploy).

CLI alternative (from `yantra-portal`):

```bash
echo re_YOUR_KEY | npx vercel env add RESEND_API_KEY production
echo "Role Forge <marketing@yourdomain.com>" | npx vercel env add EMAIL_FROM production --force
npx vercel deploy --prod --yes
```

## Local `.env`

```bash
cp .env.example .env
# paste OPENAI_API_KEY, RESEND_API_KEY, EMAIL_FROM, etc.
```

## Verify after deploy

1. Open **Admin → Settings** → Email section should show Resend **configured**.
2. Chain → **Send to vendor** → mode must be **`resend`** (not `simulated` / `dry_run`).
3. **Admin → Email activity** → `to` / `from` / Resend id.
4. Resend dashboard → Emails → delivery status.

## Modes

| Mode | Meaning |
|------|---------|
| `resend` | Real email |
| `dry_run` | Key present but `EMAIL_DRY_RUN=true` |
| `simulated` | No `RESEND_API_KEY` — app marks sent, **no inbox delivery** |
