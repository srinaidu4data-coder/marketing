# Resend email (Role Forge / Yantra-compatible)

## Status

| Item | Ready? |
|------|--------|
| From address + domain | Yes — `Role Forge <noreply@contact.srsoftllc.com>` |
| Dry-run off | Yes — `EMAIL_DRY_RUN=false` |
| BCC / CC / reply-to support in code | Yes (Yantra-compatible) |
| Word + PDF attachments | Yes (rebuild from DB text if disk gone) |
| **`RESEND_API_KEY` on Vercel** | **No — add when available** |

Until the key is set, sends stay in **`simulated`** mode (audit log only).

## Can we copy keys from Yantra login?

**No.** Resend API keys live only in **server environment variables** (Vercel → Project → Settings → Environment Variables). They are never returned to the browser after login.

## Env vars

| Variable | Required | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | **Yes for real mail** | Resend secret (`re_…`) |
| `EMAIL_FROM` | Yes | `Role Forge <noreply@contact.srsoftllc.com>` |
| `RESEND_FROM_EMAIL` | No | Bare-from alias (Yantra) |
| `EMAIL_REPLY_TO` | No | Default reply-to; else employee email |
| `EMAIL_CC` | No | Always-CC (comma-separated) |
| `EMAIL_BCC_OPS` | No | Yantra ops BCC |
| `EMAIL_DRY_RUN` | No | `true` = log only; **use `false` for live** |

Aliases: `RESEND_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`, `RESEND_CC`, `RESEND_BCC`, `RESEND_DRY_RUN`.

## One-step when key arrives

```bash
# From yantra-portal
node scripts/upsert-resend-env.mjs --with-key re_YOUR_KEY
# then redeploy production
```

Or paste `RESEND_API_KEY` in Vercel dashboard and redeploy.

## How Role Forge uses Resend

- `sendChain` → `sendWithResend()` with:
  - **To:** chain `vendorEmail`
  - **From:** employee `Name <employee@…>` (fallback `EMAIL_FROM` if missing)
  - **CC:** candidate email (plus optional env `EMAIL_CC`)
  - **Reply-To:** employee email (or `EMAIL_REPLY_TO`)
  - **BCC:** optional env `EMAIL_BCC_OPS`
  - **Attachments:** DOCX + PDF (rebuilt from pack text if needed)

Employee addresses must use a domain verified in Resend (e.g. `@srsoftllc.com`).
- Audit: `chain.email_sent` stores `to`, `from`, `resendId`, `emailMode`
- UI: chain detail delivery strip, **Admin → Settings**, **Admin → Email Activity**

## Modes

| Mode | When | Vendor inbox |
|------|------|--------------|
| `simulated` | No API key | No |
| `dry_run` | Key set + `EMAIL_DRY_RUN=true` | No |
| `resend` | Key set, dry run off | Yes (if domain verified) |
