"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import { tailorResume } from "@/lib/resume-tailor";
import type { ResumeEngineId } from "@/lib/system-settings";
import { PROMPT_TEST_SEQUENCES } from "@/lib/prompt-test-matrix";

export async function savePromptVersion(formData: FormData) {
  const admin = await requireAdmin();
  const content = String(formData.get("content") || "");
  if (!content.trim()) return;
  const v = await prisma.promptVersion.create({
    data: { content, status: "DRAFT", tested: false },
  });
  await audit("PROMPT_SAVE", admin.id, { versionId: v.id });
  revalidatePath("/admin/prompt");
}

export async function promotePrompt(versionId: string) {
  const admin = await requireAdmin();
  await prisma.promptVersion.updateMany({
    where: { status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
  await prisma.promptVersion.update({
    where: { id: versionId },
    data: { status: "ACTIVE" },
  });
  await audit("PROMPT_PROMOTE", admin.id, { versionId });
  revalidatePath("/admin/prompt");
}

export async function rollbackPrompt(versionId: string) {
  const admin = await requireAdmin();
  await prisma.promptVersion.updateMany({
    where: { status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
  await prisma.promptVersion.update({
    where: { id: versionId },
    data: { status: "ACTIVE" },
  });
  await audit("PROMPT_ROLLBACK", admin.id, { versionId });
  revalidatePath("/admin/prompt");
}

export type PromptTestResultOk = {
  ok: true;
  tabId: string;
  sequenceLabel: string;
  sequence: ResumeEngineId[];
  engineUsed: string;
  enginesTried: { engine: string; ok: boolean; error?: string }[];
  text: string;
  atsScore: number;
  psychScore: number;
  atsReady: boolean;
  best: boolean;
  layoutId: string;
  jobTitle: string;
  mode?: string;
};

export type PromptTestResult =
  | PromptTestResultOk
  | { ok: false; tabId?: string; sequenceLabel?: string; error: string };

export async function testPrompt(versionId: string, formData: FormData) {
  // Legacy form path — first matrix tab
  const jd = String(formData.get("jobRequirement") || "");
  const master = String(formData.get("masterResume") || "");
  return runPromptTest(
    versionId,
    jd,
    master,
    PROMPT_TEST_SEQUENCES[0]!.sequence,
    PROMPT_TEST_SEQUENCES[0]!.id,
    PROMPT_TEST_SEQUENCES[0]!.label
  );
}

/** Run one engine sequence (used by matrix tabs). */
export async function runPromptTest(
  versionId: string,
  jobRequirement: string,
  masterResume: string,
  engineSequence?: ResumeEngineId[],
  tabId = "custom",
  sequenceLabel = "custom"
): Promise<PromptTestResult> {
  try {
    const admin = await requireAdmin();
    const version = await prisma.promptVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) return { ok: false, tabId, sequenceLabel, error: "Prompt version not found" };

    const prev = await prisma.promptVersion.findFirst({
      where: { status: "ACTIVE" },
    });
    if (prev && prev.id !== versionId) {
      await prisma.promptVersion.update({
        where: { id: prev.id },
        data: { status: "ARCHIVED" },
      });
    }
    await prisma.promptVersion.update({
      where: { id: versionId },
      data: { status: "ACTIVE" },
    });

    const jd =
      jobRequirement.trim() ||
      "SAP FICO consultant with S/4HANA, GL, AP, AR. Hybrid Chicago, 6 months.";
    const master =
      masterResume.trim() ||
      "Jane Smith\nSAP FICO Consultant\n10 years GL/AP/AR/Asset Accounting";

    const firstLine =
      master
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean) || "Jane Smith";
    const candidateName = firstLine.split(/[—–\-|]/)[0].trim() || "Jane Smith";

    const sequence =
      engineSequence && engineSequence.length
        ? engineSequence
        : (["ai-tailor", "progressive-rules"] as ResumeEngineId[]);

    const result = await tailorResume({
      master,
      jd,
      vendorName: "Acme Staffing",
      candidateName,
      employeeId: admin.id,
      isTestMode: true,
      layoutId: "modern_minimal",
      email: "sample@example.com",
      engineSequence: sequence,
    });

    if (prev && prev.id !== versionId) {
      await prisma.promptVersion.update({
        where: { id: versionId },
        data: { status: "DRAFT", tested: true },
      });
      await prisma.promptVersion.update({
        where: { id: prev.id },
        data: { status: "ACTIVE" },
      });
    } else {
      await prisma.promptVersion.update({
        where: { id: versionId },
        data: { tested: true },
      });
    }

    await audit("PROMPT_TEST", admin.id, {
      versionId,
      tabId,
      sequence: sequence.join(","),
      engine: result.engine,
      chars: result.text.length,
      atsScore: result.ats.score,
    });
    revalidatePath("/admin/prompt");

    return {
      ok: true,
      tabId,
      sequenceLabel,
      sequence,
      engineUsed: result.engine,
      enginesTried: result.enginesTried,
      text: result.text,
      atsScore: result.ats.score,
      psychScore: result.psych?.score ?? 0,
      atsReady:
        result.ats.score === 100 && (result.psych?.score ?? 0) === 100,
      best: !!result.best,
      mode: result.modeResult?.mode,
      layoutId: result.structured.layoutId,
      jobTitle: result.structured.meta.jobTitle,
    };
  } catch (e) {
    console.error("runPromptTest failed", e);
    return {
      ok: false,
      tabId,
      sequenceLabel,
      error: e instanceof Error ? e.message : "Test failed unexpectedly",
    };
  }
}

/**
 * Run all four fixed sequences for side-by-side tab comparison.
 * Sequential to avoid overloading the LLM quota.
 */
export async function runPromptTestMatrix(
  versionId: string,
  jobRequirement: string,
  masterResume: string
): Promise<{
  ok: boolean;
  results: PromptTestResult[];
  error?: string;
}> {
  try {
    await requireAdmin();
    const results: PromptTestResult[] = [];
    for (const tab of PROMPT_TEST_SEQUENCES) {
      const one = await runPromptTest(
        versionId,
        jobRequirement,
        masterResume,
        tab.sequence,
        tab.id,
        tab.label
      );
      results.push(one);
    }
    const anyOk = results.some((r) => r.ok);
    return {
      ok: anyOk,
      results,
      error: anyOk
        ? undefined
        : results.find((r) => !r.ok && "error" in r)?.error ||
          "All sequence tests failed",
    };
  } catch (e) {
    return {
      ok: false,
      results: [],
      error: e instanceof Error ? e.message : "Matrix test failed",
    };
  }
}

export async function saveEmailTemplate(type: "SUBJECT" | "BODY", formData: FormData) {
  const admin = await requireAdmin();
  const content = String(formData.get("content") || "");
  if (!content.trim()) return;
  const v = await prisma.emailTemplateVersion.create({
    data: { type, content, status: "DRAFT" },
  });
  await audit("EMAIL_TEMPLATE_SAVE", admin.id, { versionId: v.id, type });
  revalidatePath("/admin/email-template");
}

/** Save a subject/body and immediately make it ACTIVE (for preset picker). */
export async function saveAndActivateEmailTemplate(
  type: "SUBJECT" | "BODY",
  formData: FormData
) {
  const admin = await requireAdmin();
  const content = String(formData.get("content") || "").trim();
  if (!content) return;
  await prisma.emailTemplateVersion.updateMany({
    where: { type, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
  const v = await prisma.emailTemplateVersion.create({
    data: { type, content, status: "ACTIVE" },
  });
  await audit("EMAIL_TEMPLATE_SAVE", admin.id, {
    versionId: v.id,
    type,
    activated: true,
  });
  await audit("EMAIL_TEMPLATE_PROMOTE", admin.id, { versionId: v.id, type });
  revalidatePath("/admin/email-template");
}

export async function promoteEmailTemplate(versionId: string) {
  const admin = await requireAdmin();
  const v = await prisma.emailTemplateVersion.findUnique({ where: { id: versionId } });
  if (!v) return;
  await prisma.emailTemplateVersion.updateMany({
    where: { type: v.type, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
  await prisma.emailTemplateVersion.update({
    where: { id: versionId },
    data: { status: "ACTIVE" },
  });
  await audit("EMAIL_TEMPLATE_PROMOTE", admin.id, { versionId, type: v.type });
  revalidatePath("/admin/email-template");
}

export async function rollbackEmailTemplate(versionId: string) {
  const admin = await requireAdmin();
  const v = await prisma.emailTemplateVersion.findUnique({ where: { id: versionId } });
  if (!v) return;
  await prisma.emailTemplateVersion.updateMany({
    where: { type: v.type, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
  await prisma.emailTemplateVersion.update({
    where: { id: versionId },
    data: { status: "ACTIVE" },
  });
  await audit("EMAIL_TEMPLATE_ROLLBACK", admin.id, { versionId, type: v.type });
  revalidatePath("/admin/email-template");
}
