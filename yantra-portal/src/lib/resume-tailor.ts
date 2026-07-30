/**
 * Resume tailoring facade — delegates to Progressive Tailor v2.
 * Kept for backward-compatible imports across actions.
 */

import { prisma } from "./db";
import { progressiveTailor } from "./resume/progressive-tailor";
import type { ResumeLayoutId } from "./resume/templates";

export { renderEmailTemplate } from "./resume/email-render";

export async function tailorResume(opts: {
  master: string;
  jd: string;
  vendorName: string;
  candidateName: string;
  employeeId?: string;
  isTestMode?: boolean;
  layoutId?: string | null;
  email?: string;
}) {
  const active = await prisma.promptVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  // Progressive tailor is the primary engine (layout + ATS + temporal rules)
  const result = await progressiveTailor({
    master: opts.master,
    jd: opts.jd,
    vendorName: opts.vendorName,
    candidateName: opts.candidateName,
    layoutId: (opts.layoutId as ResumeLayoutId) || "ats_classic",
    email: opts.email,
  });

  // Optional: if LLM key present, we still use progressive structure as base;
  // prompt is retained for admin test surface / future hybrid.
  void active;

  await prisma.apiUsageLog.create({
    data: {
      employeeId: opts.employeeId || null,
      operation: opts.isTestMode ? "prompt_test" : "resume_tailor_v2",
      tokensIn: Math.ceil((opts.master.length + opts.jd.length) / 4),
      tokensOut: Math.ceil(result.text.length / 4),
      costUsd: 0.002,
      isTestMode: !!opts.isTestMode,
    },
  });

  return result;
}

/** Plain-text only helper for callers that expect a string */
export async function tailorResumeText(opts: {
  master: string;
  jd: string;
  vendorName: string;
  candidateName: string;
  employeeId?: string;
  isTestMode?: boolean;
  layoutId?: string | null;
  email?: string;
}) {
  const r = await tailorResume(opts);
  return r.text;
}
