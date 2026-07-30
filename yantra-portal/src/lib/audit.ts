import { prisma } from "./db";

export const AUDIT_ACTIONS = [
  "ALLOCATION_CLEAR",
  "ALLOCATION_SET",
  "EMAIL_TEMPLATE_PROMOTE",
  "EMAIL_TEMPLATE_ROLLBACK",
  "EMAIL_TEMPLATE_SAVE",
  "PROMPT_PROMOTE",
  "PROMPT_ROLLBACK",
  "PROMPT_SAVE",
  "PROMPT_TEST",
  "auth.login",
  "auth.logout",
  "candidate.create",
  "candidate.delete",
  "candidate.update",
  "employee.create",
  "employee.update",
  "employee.password_reset",
  "employee.soft_delete",
  "employee.restore",
  "settings.update",
  "chain.create",
  "chain.candidate_failed",
  "chain.email_bounced",
  "chain.email_delivered",
  "chain.email_enqueued",
  "chain.email_failed",
  "chain.email_sent",
  "chain.manual_recover",
  "chain.stale_recovered",
  "chain.send_requested",
  "chain.status_changed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number] | string;

export async function audit(
  action: AuditAction,
  userId?: string | null,
  meta?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      action,
      userId: userId || null,
      meta: JSON.stringify(meta || {}),
    },
  });
}
