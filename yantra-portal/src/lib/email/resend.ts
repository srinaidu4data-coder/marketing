/**
 * Resend email client for Role Forge (Yantra-compatible env layout).
 *
 * Live Yantra keeps secrets server-side (Vercel env). They are NOT available
 * via login/API. Configure:
 *
 *   RESEND_API_KEY=re_xxxxxxxx          ← only missing piece for live mail
 *   EMAIL_FROM="Role Forge <noreply@contact.srsoftllc.com>"
 *   EMAIL_REPLY_TO=optional@domain.com  (optional)
 *   EMAIL_CC=ops@domain.com             (optional always-CC)
 *   EMAIL_BCC_OPS=ops@domain.com        (Yantra alias → BCC)
 *   EMAIL_DRY_RUN=false                 (true = log only, no API call)
 *
 * Aliases: RESEND_KEY, RESEND_FROM, RESEND_FROM_EMAIL, RESEND_REPLY_TO,
 *          RESEND_CC, RESEND_DRY_RUN
 *
 * Without RESEND_API_KEY: simulated mode (audit only, no inbox).
 */

import { readFile } from "fs/promises";
import { PRODUCT_NAME } from "@/lib/brand";
import { resolveUploadPath } from "@/lib/paths";

/** Fallback From if employee email missing (verified domain). */
export const DEFAULT_EMAIL_FROM = `${PRODUCT_NAME} <noreply@srsoftllc.com>`;

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
  /**
   * Override From (e.g. employee Name <email@verified-domain>).
   * Falls back to EMAIL_FROM / DEFAULT_EMAIL_FROM when omitted.
   */
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  tags?: { name: string; value: string }[];
};

/** Build Resend "Display Name <email>" From for the sending employee. */
export function formatEmployeeFrom(opts: {
  name?: string | null;
  email?: string | null;
  fallback?: string;
}): string {
  const email = (opts.email || "").trim();
  const name = (opts.name || "").trim();
  const fallback = (opts.fallback || DEFAULT_EMAIL_FROM).trim();
  if (!email || !email.includes("@")) return fallback;
  if (name) {
    // Escape quotes in display name for safety
    const safe = name.replace(/"/g, "");
    return `${safe} <${email}>`;
  }
  return email;
}

export type SendEmailResult =
  | { ok: true; id: string; mode: "resend" | "dry_run" | "simulated" }
  | { ok: false; error: string; mode: "resend" | "dry_run" | "simulated" };

export type ResendRuntimeConfig = {
  configured: boolean;
  apiKeyPresent: boolean;
  from: string;
  replyToDefault: string | null;
  ccDefault: string[];
  bccDefault: string[];
  dryRun: boolean;
  mode: "resend" | "dry_run" | "simulated";
  /** True when key present, dry-run off, and From is not the Resend sandbox. */
  liveReady: boolean;
  readiness: {
    hasApiKey: boolean;
    dryRunOff: boolean;
    fromConfigured: boolean;
    fromUsesVerifiedDomainHint: boolean;
  };
};

function splitAddrs(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractEmailDomain(from: string): string | null {
  const m = from.match(/@([\w.-]+)/);
  return m ? m[1].toLowerCase() : null;
}

/** Yantra-compatible env resolution */
export function getResendConfig(): ResendRuntimeConfig {
  const apiKey = (
    process.env.RESEND_API_KEY ||
    process.env.RESEND_KEY ||
    ""
  ).trim();

  const from =
    (
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      ""
    ).trim() || DEFAULT_EMAIL_FROM;

  // Bare address → wrap with product display name for Resend
  const fromNormalized =
    from.includes("<") || !from.includes("@")
      ? from
      : `${PRODUCT_NAME} <${from}>`;

  const replyToDefault =
    (process.env.EMAIL_REPLY_TO || process.env.RESEND_REPLY_TO || "").trim() ||
    null;

  const ccRaw = (process.env.EMAIL_CC || process.env.RESEND_CC || "").trim();
  const ccDefault = ccRaw ? splitAddrs(ccRaw) : [];

  // Yantra EMAIL_BCC_OPS + optional EMAIL_BCC
  const bccRaw = (
    process.env.EMAIL_BCC_OPS ||
    process.env.EMAIL_BCC ||
    process.env.RESEND_BCC ||
    ""
  ).trim();
  const bccDefault = bccRaw ? splitAddrs(bccRaw) : [];

  const dryRun =
    process.env.EMAIL_DRY_RUN === "1" ||
    process.env.EMAIL_DRY_RUN === "true" ||
    process.env.RESEND_DRY_RUN === "1" ||
    process.env.RESEND_DRY_RUN === "true";

  const apiKeyPresent = Boolean(apiKey);
  let mode: ResendRuntimeConfig["mode"] = "simulated";
  if (apiKeyPresent && dryRun) mode = "dry_run";
  else if (apiKeyPresent) mode = "resend";

  const domain = extractEmailDomain(fromNormalized);
  const fromUsesVerifiedDomainHint = Boolean(
    domain &&
      domain !== "resend.dev" &&
      !domain.endsWith(".resend.dev")
  );
  const fromConfigured = Boolean(fromNormalized && fromNormalized.includes("@"));
  const dryRunOff = !dryRun;
  const liveReady =
    apiKeyPresent && dryRunOff && fromConfigured && fromUsesVerifiedDomainHint;

  return {
    configured: apiKeyPresent,
    apiKeyPresent,
    from: fromNormalized,
    replyToDefault,
    ccDefault,
    bccDefault,
    dryRun,
    mode,
    liveReady,
    readiness: {
      hasApiKey: apiKeyPresent,
      dryRunOff,
      fromConfigured,
      fromUsesVerifiedDomainHint,
    },
  };
}

function getApiKey(): string | null {
  const key = (
    process.env.RESEND_API_KEY ||
    process.env.RESEND_KEY ||
    ""
  ).trim();
  return key || null;
}

/** Load chain resume files as Resend attachments (DOCX/PDF/TXT). */
export async function loadChainAttachments(opts: {
  docxPath?: string | null;
  pdfPath?: string | null;
  textPath?: string | null;
  baseName: string;
  /** When disk files missing (Vercel /tmp), rebuild DOCX from this */
  tailoredResumeText?: string | null;
  candidateName?: string;
  jobTitle?: string | null;
  skillFingerprint?: string | null;
  layoutId?: string | null;
}): Promise<EmailAttachment[]> {
  const out: EmailAttachment[] = [];
  const tryRead = async (
    rel: string | null | undefined,
    filename: string,
    contentType: string
  ) => {
    if (!rel) return;
    try {
      const content = await readFile(resolveUploadPath(rel));
      out.push({ filename, content, contentType });
    } catch (e) {
      console.warn(`[email] attachment missing ${rel}`, e);
    }
  };

  const { packFileBaseName } = await import("@/lib/resume/pack-filename");
  const safe =
    packFileBaseName({
      candidateName: opts.candidateName || opts.baseName || "Candidate",
      jobTitle: opts.jobTitle,
      skillFingerprint: opts.skillFingerprint,
    }) ||
    opts.baseName.replace(/[^a-zA-Z0-9._-]/g, "_") ||
    "Resume";

  await tryRead(
    opts.docxPath,
    `${safe}.docx`,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  await tryRead(opts.pdfPath, `${safe}.pdf`, "application/pdf");

  // Vercel: generation files often gone after cold start — rebuild DOCX (+ PDF) from DB text
  const hasDocx = out.some((a) => a.filename.endsWith(".docx"));
  const hasPdf = out.some((a) => a.filename.endsWith(".pdf"));
  if (opts.tailoredResumeText && opts.tailoredResumeText.length > 80) {
    if (!hasDocx) {
      try {
        const { renderDocxFromPlainText } = await import(
          "@/lib/resume/render-docx"
        );
        const buf = await renderDocxFromPlainText({
          candidateName: opts.candidateName || safe,
          jobTitle: opts.jobTitle || undefined,
          text: opts.tailoredResumeText,
          layoutId: opts.layoutId,
        });
        out.unshift({
          filename: `${safe}.docx`,
          content: buf,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      } catch (e) {
        console.warn("[email] rebuild DOCX from text failed", e);
      }
    }
    if (!hasPdf) {
      try {
        const { renderPdfFromPlainText } = await import(
          "@/lib/resume/render-pdf"
        );
        const buf = await renderPdfFromPlainText({
          candidateName: opts.candidateName || safe,
          jobTitle: opts.jobTitle || undefined,
          text: opts.tailoredResumeText,
        });
        out.push({
          filename: `${safe}.pdf`,
          content: buf,
          contentType: "application/pdf",
        });
      } catch (e) {
        console.warn("[email] rebuild PDF from text failed", e);
      }
    }
  }

  if (!out.length && opts.textPath) {
    await tryRead(opts.textPath, `${safe}.txt`, "text/plain");
  } else if (!out.length && opts.tailoredResumeText) {
    out.push({
      filename: `${safe}.txt`,
      content: Buffer.from(opts.tailoredResumeText, "utf8"),
      contentType: "text/plain; charset=utf-8",
    });
  }
  return out;
}

/**
 * Send one email via Resend HTTP API (same contract as official SDK).
 * https://resend.com/docs/api-reference/emails/send
 */
export async function sendWithResend(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const cfg = getResendConfig();
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: `Invalid recipient: ${input.to}`, mode: cfg.mode };
  }

  const from = (input.from || cfg.from).trim() || cfg.from;
  const replyTo = input.replyTo || cfg.replyToDefault || undefined;
  const cc = [...(cfg.ccDefault || []), ...(input.cc || [])].filter(Boolean);
  const bcc = [...(cfg.bccDefault || []), ...(input.bcc || [])].filter(Boolean);
  const uniqueCc = Array.from(new Set(cc.map((c) => c.toLowerCase()))).filter(
    (c) => c !== to
  );
  const uniqueBcc = Array.from(new Set(bcc.map((c) => c.toLowerCase()))).filter(
    (c) => c !== to && !uniqueCc.includes(c)
  );

  // No API key → simulated success (legacy clone behavior)
  if (!cfg.apiKeyPresent) {
    console.info(
      `[email:simulated] to=${to} from=${from} cc=${uniqueCc.join(",")} subject=${input.subject.slice(0, 80)} (add RESEND_API_KEY for live delivery)`
    );
    return { ok: true, id: `sim_${Date.now()}`, mode: "simulated" };
  }

  if (cfg.dryRun) {
    console.info(
      `[email:dry_run] to=${to} from=${from} cc=${uniqueCc.join(",")} subject=${input.subject.slice(0, 80)} attachments=${input.attachments?.length || 0}`
    );
    return { ok: true, id: `dry_${Date.now()}`, mode: "dry_run" };
  }

  const apiKey = getApiKey()!;
  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject: input.subject,
    text: input.text,
  };
  if (input.html) payload.html = input.html;
  if (replyTo) payload.reply_to = replyTo;
  if (uniqueCc.length) payload.cc = uniqueCc;
  if (uniqueBcc.length) payload.bcc = uniqueBcc;
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
      const err = data.message || data.name || `Resend HTTP ${res.status}`;
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
