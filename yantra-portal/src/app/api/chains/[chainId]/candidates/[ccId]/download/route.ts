import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/paths";
import { tailorResume } from "@/lib/resume-tailor";
import {
  renderDocxBuffer,
  renderDocxFromPlainText,
} from "@/lib/resume/render-docx";
import {
  renderPdfBuffer,
  renderPdfFromPlainText,
} from "@/lib/resume/render-pdf";
import { renderHtmlFromPlainText } from "@/lib/resume/render-html-export";
import { extractJobTitle } from "@/lib/resume/jd-parse";
import { packDownloadFilename } from "@/lib/resume/pack-filename";
import { stripEngineFooter } from "@/lib/resume/strip-engine-footer";
import { sanitizePostgresText } from "@/lib/resume/extract-master";
import {
  createPerfTrace,
  mark,
  flushPerfLog,
  hashText,
} from "@/lib/resume/perf-timing";

/**
 * PERF LAW (P0):
 * - Download never invokes LLM unless ?regen=1 explicitly.
 * - Prefer disk artifact; else rebuild from stored tailoredResumeText (CPU only).
 * - Missing pack text → 202 artifact_pending (do not block on generation).
 */

async function tryRead(stored: string | null | undefined): Promise<Buffer | null> {
  if (!stored) return null;
  try {
    return await readFile(resolveUploadPath(stored));
  } catch {
    return null;
  }
}

function fileHeaders(
  filename: string,
  contentType: string,
  extra?: Record<string, string>
) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    // Versioned by content at generation time; short private cache for repeat clicks
    "Cache-Control": "private, max-age=120",
    ...extra,
  };
}

function pendingResponse(chainId: string, ccId: string) {
  return NextResponse.json(
    {
      status: "artifact_pending",
      message:
        "Pack text not ready yet. Wait for generation to finish, then download again.",
      chainId,
      ccId,
    },
    {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function GET(
  req: Request,
  { params }: { params: { chainId: string; ccId: string } }
) {
  const trace = createPerfTrace(`dl:${params.chainId}:${params.ccId}`);
  mark(trace, "download_request");

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cc = await prisma.chainCandidate.findFirst({
    where: { id: params.ccId, chainId: params.chainId },
    include: { chain: true, candidate: true },
  });
  if (!cc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role === "EMPLOYEE" && cc.chain.employeeId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.user.role === "EMPLOYEE" && cc.chain.employeeHiddenAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = cc;
  const url = new URL(req.url);
  let fmt = (url.searchParams.get("fmt") || "txt").toLowerCase();
  if (fmt === "word" || fmt === "doc" || fmt === "msword" || fmt === "ms-word") {
    fmt = "docx";
  }
  const forceRegen = url.searchParams.get("regen") === "1";
  const master = (row.candidate.masterResumeText || "").trim();
  const jd = row.chain.rawJobText || "";
  let storedText = stripEngineFooter(row.tailoredResumeText || "").trim();
  /** When true, ignore cached docx/pdf (they still have clone stacks). */
  let invalidateArtifacts = false;

  // Last-line defense: diversify cloned Tech Stack / Environment before user sees pack
  // (covers packs generated before StackEnv engine + any path that skipped it)
  if (storedText.length >= 80) {
    try {
      const { applyStackEnvToPlainText, plainTextHasCloneStacks } = await import(
        "@/lib/resume-v2/stack-env"
      );
      const isClone = plainTextHasCloneStacks(storedText);
      const fixed = applyStackEnvToPlainText(storedText, {
        jd,
        masterText: master,
        force: isClone,
      });
      if (fixed.changed && fixed.text.trim().length >= 80) {
        storedText = stripEngineFooter(fixed.text).trim();
        invalidateArtifacts = true;
        // Persist so next download/preview is clean (CPU only — no LLM)
        await prisma.chainCandidate
          .update({
            where: { id: row.id },
            data: {
              tailoredResumeText: sanitizePostgresText(storedText),
              docxPath: null,
              pdfPath: null,
            },
          })
          .catch(() => {
            /* non-fatal */
          });
      } else if (isClone) {
        invalidateArtifacts = true;
      }
    } catch (e) {
      console.warn("[download] stack-env plain-text pass failed", e);
    }
  }

  const nameOpts = {
    candidateName: row.candidate.name,
    jobTitle: row.jobTitle || extractJobTitle(jd) || null,
    skillFingerprint: row.skillFingerprint || null,
  };
  const fname = (ext: string) => packDownloadFilename(nameOpts, ext);

  // Master only required for LLM regen — downloads rebuild from stored pack text
  if (forceRegen && (!master || master.length < 40)) {
    return NextResponse.json(
      {
        error:
          "No master resume text on candidate. Replace master .docx on the candidate before regenerating a pack.",
      },
      { status: 400 }
    );
  }

  // Explicit opt-in only — never auto AI on download
  if (forceRegen) {
    try {
      mark(trace, "llm_first_byte", "regen=1");
      const tailored = await tailorResume({
        master,
        masterProfileJson: row.candidate.masterProfileJson || null,
        jd,
        vendorName: row.chain.vendorName,
        candidateName: row.candidate.name,
        layoutId: row.layoutId || row.candidate.layoutId,
        email: row.candidate.email,
        fastMode: true,
      });
      mark(trace, "llm_complete");
      await prisma.chainCandidate.update({
        where: { id: row.id },
        data: {
          tailoredResumeText: sanitizePostgresText(tailored.text || ""),
          jobTitle: sanitizePostgresText(tailored.structured.meta.jobTitle || ""),
          skillFingerprint: sanitizePostgresText(
            tailored.structured.meta.skillFingerprint || ""
          ),
          atsScore: tailored.ats.score,
          psychScore: tailored.psych?.score ?? 0,
          atsReady: tailored.ats.score >= 95,
          atsBreakdownJson: sanitizePostgresText(
            JSON.stringify({ regenDownload: true, ats: tailored.ats })
          ),
        },
      });
      nameOpts.jobTitle = tailored.structured.meta.jobTitle || nameOpts.jobTitle;
      // Fall through using new text for this response
      const text = stripEngineFooter(tailored.text || "");
      if (fmt === "docx") {
        mark(trace, "docx_start");
        const buf = await renderDocxBuffer(tailored.structured);
        mark(trace, "docx_complete");
        mark(trace, "response_first_byte");
        flushPerfLog(trace, { fmt, path: "regen_docx" });
        return new NextResponse(new Uint8Array(buf), {
          headers: fileHeaders(
            fname("docx"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ),
        });
      }
      if (fmt === "pdf") {
        mark(trace, "pdf_start");
        const buf = await renderPdfBuffer(tailored.structured);
        mark(trace, "pdf_complete");
        flushPerfLog(trace, { fmt, path: "regen_pdf" });
        return new NextResponse(new Uint8Array(buf), {
          headers: fileHeaders(fname("pdf"), "application/pdf"),
        });
      }
      flushPerfLog(trace, { fmt, path: "regen_text" });
      return new NextResponse(text, {
        headers: fileHeaders(fname(fmt === "html" ? "html" : "txt"), "text/plain; charset=utf-8"),
      });
    } catch (e) {
      flushPerfLog(trace, { fmt, path: "regen_error" });
      return NextResponse.json(
        {
          error:
            e instanceof Error ? e.message : "Regeneration failed. Try again.",
        },
        { status: 500 }
      );
    }
  }

  if (storedText.length < 80) {
    mark(trace, "cache_miss", "no_pack_text");
    flushPerfLog(trace, { fmt, path: "pending" });
    return pendingResponse(params.chainId, params.ccId);
  }

  const textKey = hashText(storedText);

  // ─── DOCX ─────────────────────────────────────────────────────────
  if (fmt === "docx") {
    const type =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const fromDisk =
      !invalidateArtifacts ? await tryRead(row.docxPath) : null;
    if (fromDisk) {
      mark(trace, "cache_hit", "disk_docx");
      mark(trace, "response_first_byte");
      flushPerfLog(trace, { fmt, path: "disk", bytes: fromDisk.length, key: textKey });
      return new NextResponse(new Uint8Array(fromDisk), {
        headers: fileHeaders(fname("docx"), type, {
          "X-Artifact-Source": "disk",
          "X-Content-Key": textKey,
        }),
      });
    }
    mark(trace, "cache_miss", "rebuild_docx");
    mark(trace, "rebuild_docx");
    mark(trace, "docx_start");
    try {
      const buf = await renderDocxFromPlainText({
        candidateName: row.candidate.name,
        jobTitle: nameOpts.jobTitle || undefined,
        text: storedText,
        layoutId: row.layoutId || row.candidate.layoutId,
      });
      mark(trace, "docx_complete");
      mark(trace, "response_first_byte");
      flushPerfLog(trace, { fmt, path: "rebuild", bytes: buf.length, key: textKey });
      return new NextResponse(new Uint8Array(buf), {
        headers: fileHeaders(fname("docx"), type, {
          "X-Artifact-Source": "rebuild",
          "X-Content-Key": textKey,
        }),
      });
    } catch (e) {
      console.error("docx rebuild failed", e);
      flushPerfLog(trace, { fmt, path: "rebuild_error" });
      return NextResponse.json(
        { error: "Could not build Word file from stored pack." },
        { status: 500 }
      );
    }
  }

  // ─── PDF ──────────────────────────────────────────────────────────
  if (fmt === "pdf") {
    const type = "application/pdf";
    const fromDisk =
      !invalidateArtifacts ? await tryRead(row.pdfPath) : null;
    // Accept only real PDF magic bytes (avoid serving corrupt/empty disk files)
    if (fromDisk && fromDisk.length > 200 && fromDisk.subarray(0, 4).toString() === "%PDF") {
      mark(trace, "cache_hit", "disk_pdf");
      flushPerfLog(trace, { fmt, path: "disk", bytes: fromDisk.length });
      return new NextResponse(new Uint8Array(fromDisk), {
        headers: fileHeaders(fname("pdf"), type, {
          "X-Artifact-Source": "disk",
        }),
      });
    }
    mark(trace, "cache_miss", "rebuild_pdf");
    mark(trace, "pdf_start");
    try {
      const buf = await renderPdfFromPlainText({
        candidateName: row.candidate.name,
        jobTitle: nameOpts.jobTitle || undefined,
        text: storedText,
      });
      mark(trace, "pdf_complete");
      flushPerfLog(trace, { fmt, path: "rebuild", bytes: buf.length });
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...fileHeaders(fname("pdf"), type, {
            "X-Artifact-Source": "rebuild",
          }),
          "Content-Length": String(buf.length),
        },
      });
    } catch (e) {
      console.error("pdf rebuild failed", e);
      // Last resort: minimal PDF so the button always yields a file
      try {
        const fallback = await renderPdfFromPlainText({
          candidateName: row.candidate.name || "Candidate",
          jobTitle: nameOpts.jobTitle || "Resume",
          text: storedText.slice(0, 12000) || "Resume pack unavailable. Re-generate and try again.",
        });
        return new NextResponse(new Uint8Array(fallback), {
          status: 200,
          headers: fileHeaders(fname("pdf"), type, {
            "X-Artifact-Source": "fallback",
          }),
        });
      } catch (e2) {
        console.error("pdf fallback failed", e2);
        return NextResponse.json(
          {
            error: "Could not build PDF from stored pack.",
            detail: e instanceof Error ? e.message : String(e),
          },
          { status: 500 }
        );
      }
    }
  }

  // ─── HTML ─────────────────────────────────────────────────────────
  if (fmt === "html") {
    mark(trace, "cache_hit", "html_from_text");
    const html = renderHtmlFromPlainText({
      candidateName: row.candidate.name,
      jobTitle: nameOpts.jobTitle || undefined,
      text: storedText,
    });
    flushPerfLog(trace, { fmt, path: "text" });
    return new NextResponse(html, {
      headers: fileHeaders(fname("html"), "text/html; charset=utf-8"),
    });
  }

  // ─── TXT ──────────────────────────────────────────────────────────
  mark(trace, "cache_hit", "txt");
  flushPerfLog(trace, { fmt, path: "text", chars: storedText.length });
  return new NextResponse(storedText, {
    headers: fileHeaders(fname("txt"), "text/plain; charset=utf-8"),
  });
}
