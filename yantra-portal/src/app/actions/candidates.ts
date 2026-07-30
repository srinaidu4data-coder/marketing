"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { RESUME_LAYOUTS } from "@/lib/resume/templates";
import { getSystemConfig } from "@/lib/system-settings";
import { extractMasterText } from "@/lib/resume/extract-master";
import { masterUploadDir } from "@/lib/paths";

const LAYOUT_IDS = new Set(RESUME_LAYOUTS.map((l) => l.id));

export type ReplaceResumeResult =
  | {
      ok: true;
      extracted: boolean;
      chars: number;
      fileName: string;
      warning?: string;
    }
  | { ok: false; error: string };

async function persistMasterFile(file: File): Promise<{
  masterResumeText: string;
  masterResumePath: string;
  extracted: boolean;
  warning?: string;
}> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  const extracted = await extractMasterText(file.name, buf);
  const dir = masterUploadDir();
  let masterResumePath = `uploads/masters/memory_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  try {
    await mkdir(dir, { recursive: true });
    const safe = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const full = path.join(dir, safe);
    await writeFile(full, buf);
    masterResumePath = process.env.VERCEL
      ? full // absolute /tmp path on serverless
      : `uploads/masters/${safe}`;
  } catch (e) {
    console.warn("master file disk write skipped; text still stored in DB", e);
  }

  return {
    masterResumeText: extracted.text,
    masterResumePath,
    extracted: extracted.extracted,
    warning: extracted.warning,
  };
}

export async function createCandidate(formData: FormData) {
  const admin = await requireAdmin();
  const defaults = await getSystemConfig();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const layoutId = String(formData.get("layoutId") || defaults.defaultLayoutId || "ats_classic");
  const exportFormat = String(
    formData.get("exportFormat") || defaults.defaultExportFormat || "DOCX"
  );
  const file = formData.get("resume") as File | null;

  if (!name || !email) return;

  let masterResumeText = "";
  let masterResumePath: string | null = null;

  if (file && file.size > 0) {
    const saved = await persistMasterFile(file);
    masterResumeText = saved.masterResumeText;
    masterResumePath = saved.masterResumePath;
  }

  const c = await prisma.candidate.create({
    data: {
      name,
      email,
      masterResumeText,
      masterResumePath,
      layoutId: LAYOUT_IDS.has(layoutId as never) ? layoutId : "ats_classic",
      exportFormat: exportFormat === "DOCX_PDF" ? "DOCX_PDF" : "DOCX",
    },
  });
  await audit("candidate.create", admin.id, {
    candidateId: c.id,
    name,
    email,
    layoutId: c.layoutId,
    exportFormat: c.exportFormat,
  });
  revalidatePath("/admin/candidates");
}

export async function updateCandidate(candidateId: string, formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const layoutId = String(formData.get("layoutId") || "ats_classic");
  const exportFormat = String(formData.get("exportFormat") || "DOCX");
  if (!name || !email) return;

  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      name,
      email,
      layoutId: LAYOUT_IDS.has(layoutId as never) ? layoutId : "ats_classic",
      exportFormat: exportFormat === "DOCX_PDF" ? "DOCX_PDF" : "DOCX",
    },
  });
  await audit("candidate.update", admin.id, {
    candidateId,
    name,
    email,
    layoutId,
    exportFormat,
  });
  revalidatePath(`/admin/candidates/${candidateId}`);
  revalidatePath("/admin/candidates");
}

export async function replaceMasterResume(
  candidateId: string,
  formData: FormData
): Promise<ReplaceResumeResult> {
  try {
    const admin = await requireAdmin();
    const file = formData.get("resume");

    if (!file || !(file instanceof File)) {
      return { ok: false, error: "No file received. Choose a resume and try again." };
    }
    if (file.size === 0) {
      return { ok: false, error: "The selected file is empty." };
    }

    const exists = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    if (!exists) {
      return { ok: false, error: "Candidate not found." };
    }

    const saved = await persistMasterFile(file);

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        masterResumeText: saved.masterResumeText,
        masterResumePath: saved.masterResumePath,
      },
    });

    await audit("candidate.update", admin.id, {
      candidateId,
      action: "replace_resume",
      fileName: file.name,
      size: file.size,
      extracted: saved.extracted,
      chars: saved.masterResumeText.length,
    });

    revalidatePath(`/admin/candidates/${candidateId}`);
    revalidatePath("/admin/candidates");

    return {
      ok: true,
      extracted: saved.extracted,
      chars: saved.masterResumeText.length,
      fileName: file.name,
      warning: saved.warning,
    };
  } catch (e) {
    console.error("replaceMasterResume failed", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error replacing resume.",
    };
  }
}

export async function deleteCandidate(candidateId: string) {
  const admin = await requireAdmin();
  await prisma.vendorSubmission.deleteMany({ where: { candidateId } });
  await prisma.chainCandidate.deleteMany({ where: { candidateId } });
  await prisma.allocation.deleteMany({ where: { candidateId } });
  await prisma.candidate.delete({ where: { id: candidateId } });
  await audit("candidate.delete", admin.id, { candidateId });
  revalidatePath("/admin/candidates");
  revalidatePath("/admin/allocations");
}
