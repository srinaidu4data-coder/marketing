/**
 * Resend email client for Role Forge (Yantra-compatible env layout).
 *
 * Live Yantra keeps secrets server-side (Vercel env). They are NOT available
 * via login/API. Configure the same variable names here:
 *
 *   RESEND_API_KEY=re_xxxxxxxx
 *   EMAIL_FROM="Role Forge <marketing@your-verified-domain.com>"
 *   EMAIL_REPLY_TO=optional-default-reply@domain.com   (optional)
 *   EMAIL_DRY_RUN=true                                 (optional: log only, no API call)
 *   EMAIL_CC=optional@domain.com                       (optional)
 *
 * Fallback if RESEND_API_KEY is missing: dry audit-only send (legacy clone mode).
 */

import { readFile } from "fs/promises";
import path from "path";
import { PRODUCT_NAME } from "@/lib/brand";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  cc?: string[];
  attachments?: EmailAttachment[];
  tags?: { name: string; value: string }[];
};

export type SendEmailResult =
  | { ok: true; id: string; mode: "resend" | "dry_run" | "simulated" }
  | { ok: false; error: string; mode: "resend" | "dry_run" | "simulated" };

export type ResendRuntimeConfig = {
  configured: boolean;
  apiKeyPresent: boolean;
  from: string;
  replyToDefault: string | null;
  ccDefault: string[];
  dryRun: boolean;
  mode: "resend" | "dry_run" | "simulated";
};

/** Yantra-compatible env resolution */
export function getResendConfig(): ResendRuntimeConfig {
  const apiKey = (process.env.RESEND_API_KEY || process.env.RESEND_KEY || "").trim();
  const from =
    (process.env.EMAIL_FROM || process.env.RESEND_FROM || "").trim() ||
    `${PRODUCT_NAME} <onboarding@resend.dev>`;
  const replyToDefault =
    (process.env.EMAIL_REPLY_TO || process.env.RESEND_REPLY_TO || "").trim() || null;
  const ccRaw = (process.env.EMAIL_CC || process.env.RESEND_CC || "").trim();
  const ccDefault = ccRaw
    ? ccRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const dryRun =
    process.env.EMAIL_DRY_RUN === "1" ||
    process.env.EMAIL_DRY_RUN === "true" ||
    process.env.RESEND_DRY_RUN === "1";

  const apiKeyPresent = Boolean(apiKey);
  let mode: ResendRuntimeConfig["mode"] = "simulated";
  if (apiKeyPresent && dryRun) mode = "dry_run";
  else if (apiKeyPresent) mode = "resend";

  return {
    configured: apiKeyPresent,
    apiKeyPresent,
    from,
    replyToDefault,
    ccDefault,
    dryRun,
    mode,
  };
}

function getApiKey(): string | null {
  const key = (process.env.RESEND_API_KEY || process.env.RESEND_KEY || "").trim();
  return key || null;
}

/** Load chain resume files as Resend attachments (DOCX/PDF/TXT). */
export async function loadChainAttachments(opts: {
  docxPath?: string | null;
  pdfPath?: string | null;
  textPath?: string | null;
  baseName: string;
}): Promise<EmailAttachment[]> {
  const out: EmailAttachment[] = [];
  const tryRead = async (
    rel: string | null | undefined,
    filename: string,
    contentType: string
  ) => {
    if (!rel) return;
    try {
      const full = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
      const content = await readFile(full);
      out.push({ filename, content, contentType });
    } catch (e) {
      console.warn(`[email] attachment missing ${rel}`, e);
    }
  };

  const safe = opts.baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  await tryRead(opts.docxPath, `${safe}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  await tryRead(opts.pdfPath, `${safe}.pdf`, "application/pdf");
  // Prefer binary resume; skip raw txt if docx present
  if (!opts.docxPath && !opts.pdfPath) {
    await tryRead(opts.textPath, `${safe}.txt`, "text/plain");
  }
  return out;
}

/**
 * Send one email via Resend HTTP API (same contract as official SDK).
 * https://resend.com/docs/api-reference/emails/send-email
 */
export async function sendWithResend(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = getResendConfig();
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: `Invalid recipient: ${input.to}`, mode: cfg.mode };
  }

  const replyTo = input.replyTo || cfg.replyToDefault || undefined;
  const cc = [...(cfg.ccDefault || []), ...(input.cc || [])].filter(Boolean);
  const uniqueCc = Array.from(new Set(cc.map((c) => c.toLowerCase()))).filter(
    (c) => c !== to
  );

  // No API key → simulated success (legacy clone behavior)
  if (!cfg.apiKeyPresent) {
    console.info(
      `[email:simulated] to=${to} from=${cfg.from} subject=${input.subject.slice(0, 80)}`
    );
    return { ok: true, id: `sim_${Date.now()}`, mode: "simulated" };
  }

  if (cfg.dryRun) {
    console.info(
      `[email:dry_run] to=${to} from=${cfg.from} subject=${input.subject.slice(0, 80)} attachments=${input.attachments?.length || 0}`
    );
    return { ok: true, id: `dry_${Date.now()}`, mode: "dry_run" };
  }

  const apiKey = getApiKey()!;
  const payload: Record<string, unknown> = {
    from: cfg.from,
    to: [to],
    subject: input.subject,
    text: input.text,
  };
  if (input.html) payload.html = input.html;
  if (replyTo) payload.reply_to = replyTo;
  if (uniqueCc.length) payload.cc = uniqueCc;
  if (input.tags?.length) payload.tags = input.tags;
  if (input.attachments?.length) {
    payload.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
      statusCode?: number;
    };
    if (!res.ok) {
      const err =
        data.message ||
        data.name ||
        `Resend HTTP ${res.status}`;
      console.error("[email:resend] fail", res.status, data);
      return { ok: false, error: err, mode: "resend" };
    }
    return { ok: true, id: data.id || `re_${Date.now()}`, mode: "resend" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email:resend] network error", e);
    return { ok: false, error: msg, mode: "resend" };
  }
}

/** Plain body → simple HTML for better client rendering */
export function textToSimpleHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;white-space:pre-wrap">${esc}</div>`;
}
