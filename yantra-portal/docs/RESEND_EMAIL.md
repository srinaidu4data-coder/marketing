# Resend email (Role Forge / Yantra-compatible)

## Can we copy keys from Yantra login?

**No.** Resend API keys live only in **server environment variables** (Vercel → Project → Settings → Environment Variables). They are never returned to the browser after login.

## Env vars (same layout as live Yantra)

| Variable | Required | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | Yes for real mail | Resend secret (`re_…`) |
| `EMAIL_FROM` | Yes for production | `Name <user@verified-domain.com>` |
| `EMAIL_REPLY_TO` | No | Default reply-to; else employee email |
| `EMAIL_CC` | No | Always-CC (comma-separated) |
| `EMAIL_DRY_RUN` | No | `true` = log only, no Resend API call |

Aliases accepted: `RESEND_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`, `RESEND_CC`, `RESEND_DRY_RUN`.

## How to copy from Yantra production

1. Open [Vercel Dashboard](https://vercel.com) → project **yantra-mvp-gray** (or your Yantra project).
2. **Settings → Environment Variables**.
3. Copy `RESEND_API_KEY`, `EMAIL_FROM`, and any `EMAIL_*` / `RESEND_*` vars.
4. Paste into local `yantra-portal/.env` (or host env for Role Forge deploy).
5. Restart the app (`npm run build && npm start`).

Alternatively create a new key at [resend.com/api-keys](https://resend.com/api-keys) and a verified domain at [resend.com/domains](https://resend.com/domains).

## Where Role Forge uses it

- `sendChain` → `sendWithResend()` with:
  - **To:** chain `vendorEmail`
  - **From:** `EMAIL_FROM`
  - **Reply-To:** employee email (or `EMAIL_REPLY_TO`)
  - **Attachments:** DOCX / PDF when generated
- Audit: `chain.email_sent` stores `to`, `from`, `resendId`, `emailMode`
- UI: **Admin → Settings** (status) and **Admin → Email Activity** (log)

## Modes

| Mode | When | Vendor inbox |
|------|------|--------------|
| `simulated` | No API key | No |
| `dry_run` | Key set + `EMAIL_DRY_RUN=true` | No |
| `resend` | Key set, dry run off | Yes (if domain verified) |

## Verify correct address

1. Create chain with known **Vendor email**.
2. Send all.
3. Open **Admin → Email Activity** — check **To** column matches.
4. In Resend dashboard → Emails — confirm delivery / bounce.
