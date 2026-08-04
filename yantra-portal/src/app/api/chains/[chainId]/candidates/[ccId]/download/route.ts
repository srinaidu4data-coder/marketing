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
import { detectDomain, extractJobTitle } from "@/lib/resume/jd-parse";
import {
  criticalJdPhrases,
  hasCriticalJdCoverage,
} from "@/lib/resume/jd-weave";
import { getResumeEnginePolicy } from "@/lib/system-settings";
import {
  inspectPackShipReady,
  mustRegeneratePack,
} from "@/lib/resume/pack-ship-ready";
import { packDownloadFilename } from "@/lib/resume/pack-filename";
import { stripEngineFooter } from "@/lib/resume/strip-engine-footer";

async function tryRead(stored: string | null | undefined): Promise<Buffer | null> {
  if (!stored) return null;
  try {
    return await readFile(resolveUploadPath(stored));
  } catch {
    return null;
  }
}

/**
 * Only force full AI re-tailor when pack content is missing/bad.
 * Disk files are best-effort (Vercel /tmp is wiped on cold start) — missing
 * docxPath or a missing file must NOT trigger OpenAI. DB text is source of truth.
 */
async function needAiRegen(opts: {
  text: string;
  jd: string;
  master: string;
  masterProfileJson?: string | null;
  force?: boolean;
}): Promise<boolean> {
  if (opts.force) return true;
  if (!opts.text || opts.text.length < 80) return true;
  if (
    mustRegeneratePack({
      text: opts.text,
      masterText: opts.master,
      masterProfileJson: opts.masterProfileJson,
      jd: opts.jd,
    })
  ) {
    return true;
  }

  const policy = await getResumeEnginePolicy();
  const title = extractJobTitle(opts.jd);
  const domain = detectDomain(opts.jd, title, policy);
  const critical = criticalJdPhrases(opts.jd, domain, policy);
  if (critical.length >= 3 && !hasCriticalJdCoverage(opts.text, critical, 0.4)) {
    return true;
  }
  return false;
}

function fileHeaders(
  filename: string,
  contentType: string,
  extra?: Record<string, string>
) {
  // RFC 5987 filename* for Unicode; ASCII fallback for old clients
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store",
    ...extra,
  };
}

export async function GET(
  req: Request,
  { params }: { params: { chainId: string; ccId: string } }
) {
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
  // word / doc / ms-word → docx
  let fmt = (url.searchParams.get("fmt") || "txt").toLowerCase();
  if (fmt === "word" || fmt === "doc" || fmt === "msword" || fmt === "ms-word") {
    fmt = "docx";
  }
  const force = url.searchParams.get("regen") === "1";
  const master = (row.candidate.masterResumeText || "").trim();
  const masterProfileJson = row.candidate.masterProfileJson || null;
  const jd = row.chain.rawJobText || "";
  const storedText = row.tailoredResumeText || "";

  const nameOpts = {
    candidateName: row.candidate.name,
    jobTitle: row.jobTitle || extractJobTitle(jd) || null,
    skillFingerprint: row.skillFingerprint || null,
  };
  const fname = (ext: string) => packDownloadFilename(nameOpts, ext);

  if (!master || master.length < 40) {
    return NextResponse.json(
      {
        error:
          "No master resume text on candidate. Replace master .docx on the candidate before downloading a pack.",
      },
      { status: 400 }
    );
  }

  const needAi = await needAiRegen({
    text: storedText,
    jd,
    master,
    masterProfileJson,
    force,
  });

  async function runAi() {
    return tailorResume({
      master,
      masterProfileJson,
      jd,
      vendorName: row.chain.vendorName,
      candidateName: row.candidate.name,
      layoutId: row.layoutId || row.candidate.layoutId,
      email: row.candidate.email,
    });
  }

  async function persistPack(
    tailored: Awaited<ReturnType<typeof tailorResume>>
  ) {
    const ship = inspectPackShipReady({
      text: tailored.text,
      masterText: master,
      masterProfileJson,
    });
    if (!ship.ok) {
      throw new Error(
        `Pack not ship-ready: ${ship.issues.map((i) => i.detail).join("; ")}`
      );
    }
    const breakdown = {
      ...tailored.ats,
      packValidation: tailored.packValidation
        ? {
            ok: tailored.packValidation.ok,
            score: tailored.packValidation.score,
            summary: tailored.packValidation.summary,
            clientsFound: tailored.packValidation.clientsFound.length,
            clientsMissing: tailored.packValidation.clientsMissing,
            yearsClaims: tailored.packValidation.yearsClaimsInSummary,
          }
        : null,
      shipReady: ship,
    };
    await prisma.chainCandidate.update({
      where: { id: row.id },
      data: {
        tailoredResumeText: tailored.text,
        jobTitle: tailored.structured.meta.jobTitle,
        skillFingerprint: tailored.structured.meta.skillFingerprint,
        atsScore: tailored.ats.score,
        atsReady: tailored.ats.ready && ship.ok,
        atsBreakdownJson: JSON.stringify(breakdown),
      },
    });
    // Keep nameOpts in sync for this response when AI just ran
    nameOpts.jobTitle = tailored.structured.meta.jobTitle || nameOpts.jobTitle;
    nameOpts.skillFingerprint =
      tailored.structured.meta.skillFingerprint || nameOpts.skillFingerprint;
  }

  async function docxFromStoredText(text: string): Promise<Buffer> {
    return renderDocxFromPlainText({
      candidateName: row.candidate.name,
      jobTitle: nameOpts.jobTitle || undefined,
      text,
    });
  }

  async function pdfFromStoredText(text: string): Promise<Buffer> {
    return renderPdfFromPlainText({
      candidateName: row.candidate.name,
      jobTitle: nameOpts.jobTitle || undefined,
      text,
    });
  }

  // ─── MS Word (.docx) ─────────────────────────────────────────────
  if (fmt === "docx") {
    const type =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!needAi) {
      const fromDisk = await tryRead(row.docxPath);
      if (fromDisk) {
        return new NextResponse(new Uint8Array(fromDisk), {
          headers: fileHeaders(fname("docx"), type),
        });
      }
      if (storedText.length >= 80) {
        try {
          const buf = await docxFromStoredText(storedText);
          return new NextResponse(new Uint8Array(buf), {
            headers: fileHeaders(fname("docx"), type),
          });
        } catch (e) {
          console.error("docx rebuild from stored text failed", e);
        }
      }
    }

    try {
      const tailored = await runAi();
      await persistPack(tailored);
      const buf = await renderDocxBuffer(tailored.structured);
      return new NextResponse(new Uint8Array(buf), {
        headers: fileHeaders(fname("docx"), type),
      });
    } catch (e) {
      console.error("docx AI regenerate failed", e);
      if (storedText.length >= 80) {
        try {
          const buf = await docxFromStoredText(storedText);
          return new NextResponse(new Uint8Array(buf), {
            headers: fileHeaders(fname("docx"), type),
          });
        } catch {
          /* ignore */
        }
      }
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "AI resume generation failed. Check OPENAI_API_KEY.",
        },
        { status: 500 }
      );
    }
  }

  // ─── PDF ─────────────────────────────────────────────────────────
  if (fmt === "pdf") {
    const type = "application/pdf";
    if (!needAi) {
      const fromDisk = await tryRead(row.pdfPath);
      if (fromDisk) {
        return new NextResponse(new Uint8Array(fromDisk), {
          headers: fileHeaders(fname("pdf"), type),
        });
      }
      if (storedText.length >= 80) {
        try {
          const buf = await pdfFromStoredText(storedText);
          return new NextResponse(new Uint8Array(buf), {
            headers: fileHeaders(fname("pdf"), type),
          });
        } catch (e) {
          console.error("pdf rebuild from stored text failed", e);
        }
      }
    }

    try {
      const tailored = await runAi();
      await persistPack(tailored);
      const buf = await renderPdfBuffer(tailored.structured);
      return new NextResponse(new Uint8Array(buf), {
        headers: fileHeaders(fname("pdf"), type),
      });
    } catch (e) {
      console.error("pdf AI regenerate failed", e);
      if (storedText.length >= 80) {
        try {
          const buf = await pdfFromStoredText(storedText);
          return new NextResponse(new Uint8Array(buf), {
            headers: fileHeaders(fname("pdf"), type),
          });
        } catch {
          /* ignore */
        }
      }
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "AI resume generation failed. Check OPENAI_API_KEY.",
        },
        { status: 500 }
      );
    }
  }

  // ─── HTML ────────────────────────────────────────────────────────
  if (fmt === "html") {
    let text = storedText;
    if (needAi) {
      try {
        const tailored = await runAi();
        await persistPack(tailored);
        text = tailored.text;
      } catch (e) {
        console.error("html AI regenerate failed", e);
        if (storedText.length < 80) {
          return NextResponse.json(
            {
              error:
                e instanceof Error
                  ? e.message
                  : "AI resume generation failed.",
            },
            { status: 500 }
          );
        }
      }
    } else {
      const ship = inspectPackShipReady({
        text: storedText,
        masterText: master,
        masterProfileJson,
      });
      if (!ship.ok) {
        return NextResponse.json(
          {
            error: `Stored pack not ship-ready: ${ship.issues.map((i) => i.detail).join("; ")}. Use ?regen=1 or regenerate the chain.`,
          },
          { status: 409 }
        );
      }
    }

    const html = renderHtmlFromPlainText({
      candidateName: row.candidate.name,
      jobTitle: nameOpts.jobTitle || undefined,
      text: stripEngineFooter(text),
    });
    return new NextResponse(html, {
      headers: fileHeaders(fname("html"), "text/html; charset=utf-8"),
    });
  }

  // ─── TXT (default) ───────────────────────────────────────────────
  if (needAi) {
    try {
      const tailored = await runAi();
      await persistPack(tailored);
      return new NextResponse(stripEngineFooter(tailored.text), {
        headers: fileHeaders(fname("txt"), "text/plain; charset=utf-8"),
      });
    } catch (e) {
      console.error("txt AI regenerate failed", e);
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "AI resume generation failed.",
        },
        { status: 500 }
      );
    }
  }

  const ship = inspectPackShipReady({
    text: storedText,
    masterText: master,
    masterProfileJson,
  });
  if (!ship.ok) {
    return NextResponse.json(
      {
        error: `Stored pack not ship-ready: ${ship.issues.map((i) => i.detail).join("; ")}. Use ?regen=1 or regenerate the chain.`,
      },
      { status: 409 }
    );
  }

  return new NextResponse(stripEngineFooter(storedText), {
    headers: fileHeaders(fname("txt"), "text/plain; charset=utf-8"),
  });
}
