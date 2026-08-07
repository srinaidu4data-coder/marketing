"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import {
  RESUME_LAYOUTS,
  DEFAULT_LAYOUT_ID,
  resolveLayoutId,
} from "@/lib/resume/templates";
import { getSystemConfig } from "@/lib/system-settings";
import {
  extractMasterText,
  sanitizePostgresText,
} from "@/lib/resume/extract-master";
import {
  parseMasterProfile,
  parseStoredMasterProfile,
  serializeMasterProfile,
  type MasterProfile,
} from "@/lib/resume/master-profile";
import {
  validateMasterProfile,
  type MasterValidationReport,
} from "@/lib/resume/master-pack-validate";
import { masterUploadDir } from "@/lib/paths";

const LAYOUT_IDS = new Set(RESUME_LAYOUTS.map((l) => l.id));
function sanitizeLayoutId(raw: string): string {
  const resolved = resolveLayoutId(raw);
  return LAYOUT_IDS.has(resolved as never) ? resolved : DEFAULT_LAYOUT_ID;
}

export type ReplaceResumeResult =
  | {
      ok: true;
      extracted: boolean;
      chars: number;
      fileName: string;
      warning?: string;
      engagementCount?: number;
      profileWarnings?: string[];
      /** Full ground-truth checklist — not just counts */
      validation?: MasterValidationReport;
    }
  | { ok: false; error: string };

async function persistMasterFile(file: File): Promise<{
  masterResumeText: string;
  masterResumePath: string;
  masterProfileJson: string;
  profile: MasterProfile;
  extracted: boolean;
  warning?: string;
}> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  const extracted = await extractMasterText(file.name, buf);
  // Karpathy: parse once at upload → structured ground truth
  // Sanitize again before DB — Postgres rejects U+0000 in text (error 22021).
  const masterResumeText = sanitizePostgresText(extracted.text || "");
  const profile = parseMasterProfile(masterResumeText);
  const masterProfileJson = sanitizePostgresText(serializeMasterProfile(profile));

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
    masterResumeText,
    masterResumePath,
    masterProfileJson,
    profile,
    extracted: extracted.extracted,
    warning: extracted.warning,
  };
}

/**
 * Create roster entry, then continue the flow on the candidate profile.
 * Uses server redirect (not client router) so navigation always works.
 */
export async function createCandidate(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const defaults = await getSystemConfig();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const layoutId = sanitizeLayoutId(
    String(formData.get("layoutId") || defaults.defaultLayoutId || DEFAULT_LAYOUT_ID)
  );
  const exportFormat = String(
    formData.get("exportFormat") || defaults.defaultExportFormat || "DOCX"
  );
  const file = formData.get("resume");

  const safeName = sanitizePostgresText(name);
  const safeEmail = sanitizePostgresText(email);
  if (!safeName || !safeEmail) {
    redirect("/admin/candidates?error=" + encodeURIComponent("Name and email are required."));
  }

  let masterResumeText = "";
  let masterResumePath: string | null = null;
  let masterProfileJson = "{}";
  let engagementCount = 0;

  try {
    if (file instanceof File && file.size > 0) {
      const saved = await persistMasterFile(file);
      masterResumeText = saved.masterResumeText;
      masterResumePath = saved.masterResumePath;
      masterProfileJson = saved.masterProfileJson;
      engagementCount = saved.profile.engagements.length;
    }

    const c = await prisma.candidate.create({
      data: {
        name: safeName,
        email: safeEmail,
        masterResumeText,
        masterResumePath,
        masterProfileJson,
        layoutId,
        exportFormat: exportFormat === "DOCX_PDF" ? "DOCX_PDF" : "DOCX",
      },
    });
    const validation = validateMasterProfile(
      parseStoredMasterProfile(masterProfileJson)
    );

    await audit("candidate.create", admin.id, {
      candidateId: c.id,
      name: safeName,
      email: safeEmail,
      layoutId: c.layoutId,
      exportFormat: c.exportFormat,
      engagementCount,
      validationScore: validation?.score,
      validationFail: validation?.summary.fail,
      validationWarn: validation?.summary.warn,
    });
    revalidatePath("/admin/candidates");
    revalidatePath(`/admin/candidates/${c.id}`);
    revalidatePath("/admin/allocations");
    revalidatePath("/chains/new");

    // Always land on profile — UI shows next step (upload master or start chain)
    redirect(`/admin/candidates/${c.id}?new=1`);
  } catch (e) {
    // redirect() throws a special NEXT_REDIRECT error — rethrow it
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      String((e as { digest?: string }).digest || "").startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    console.error("createCandidate failed", e);
    redirect(
      "/admin/candidates?error=" +
        encodeURIComponent(
          e instanceof Error ? e.message : "Could not create candidate."
        )
    );
  }
}

export async function updateCandidate(candidateId: string, formData: FormData) {
  const admin = await requireAdmin();
  const name = sanitizePostgresText(String(formData.get("name") || "").trim());
  const email = sanitizePostgresText(String(formData.get("email") || "").trim());
  const layoutId = sanitizeLayoutId(
    String(formData.get("layoutId") || DEFAULT_LAYOUT_ID)
  );
  const exportFormat = String(formData.get("exportFormat") || "DOCX");
  if (!name || !email) return;

  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      name,
      email,
      layoutId,
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
  revalidatePath("/admin/allocations");
  revalidatePath("/chains/new");
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
        masterProfileJson: saved.masterProfileJson,
      },
    });

    const validation = validateMasterProfile(saved.profile);

    await audit("candidate.update", admin.id, {
      candidateId,
      action: "replace_resume",
      fileName: file.name,
      size: file.size,
      extracted: saved.extracted,
      chars: saved.masterResumeText.length,
      engagementCount: saved.profile.engagements.length,
      profileWarnings: saved.profile.warnings,
      validationScore: validation.score,
      validationFail: validation.summary.fail,
      validationWarn: validation.summary.warn,
      validationOk: validation.ok,
    });

    revalidatePath(`/admin/candidates/${candidateId}`);
    revalidatePath("/admin/candidates");

    return {
      ok: true,
      extracted: saved.extracted,
      chars: saved.masterResumeText.length,
      fileName: file.name,
      warning: saved.warning,
      engagementCount: saved.profile.engagements.length,
      profileWarnings: saved.profile.warnings,
      validation,
    };
  } catch (e) {
    console.error("replaceMasterResume failed", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error replacing resume.",
    };
  }
}

/**
 * HARD DELETE only — no soft-delete, no archive, no restore.
 * Removes candidate + all related rows + best-effort pack/master files.
 * Returns ok/error so UI can surface failures (silent failures left ghost rows).
 */
export async function deleteCandidate(
  candidateId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const id = (candidateId || "").trim();
  if (!id) return { ok: false, error: "Missing candidate id." };

  try {
    const existing = await prisma.candidate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        masterResumePath: true,
        chainCandidates: {
          select: {
            id: true,
            tailoredResumePath: true,
            docxPath: true,
            pdfPath: true,
          },
        },
      },
    });
    if (!existing) {
      // Already gone — treat as success (idempotent)
      revalidatePath("/admin/candidates");
      revalidatePath("/admin/allocations");
      revalidatePath("/admin/chains");
      return { ok: true };
    }

    // Collect files before rows disappear
    const filePaths = new Set<string>();
    if (existing.masterResumePath) filePaths.add(existing.masterResumePath);
    for (const cc of existing.chainCandidates) {
      if (cc.tailoredResumePath) filePaths.add(cc.tailoredResumePath);
      if (cc.docxPath) filePaths.add(cc.docxPath);
      if (cc.pdfPath) filePaths.add(cc.pdfPath);
    }

    // Single transaction — no orphan children, no soft tombstone
    await prisma.$transaction(async (tx) => {
      await tx.vendorSubmission.deleteMany({ where: { candidateId: id } });
      await tx.chainCandidate.deleteMany({ where: { candidateId: id } });
      await tx.allocation.deleteMany({ where: { candidateId: id } });
      await tx.candidate.delete({ where: { id } });
    });

    // Best-effort disk cleanup (never block hard-delete on FS errors)
    try {
      const { unlink } = await import("fs/promises");
      const { resolveUploadPath } = await import("@/lib/paths");
      for (const stored of Array.from(filePaths)) {
        try {
          await unlink(resolveUploadPath(stored));
        } catch {
          /* missing file is fine */
        }
      }
    } catch {
      /* ignore */
    }

    // Audit: id only — no name/email/master retained
    await audit("candidate.delete", admin.id, {
      candidateId: id,
      hard: true,
    });

    revalidatePath("/admin/candidates");
    revalidatePath("/admin/allocations");
    revalidatePath("/admin/chains");
    revalidatePath("/chains");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    console.error("[deleteCandidate] hard delete failed", id, e);
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Hard delete failed — candidate may still exist.",
    };
  }
}
