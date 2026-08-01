import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/paths";
import { tailorResume } from "@/lib/resume-tailor";
import { renderDocxBuffer } from "@/lib/resume/render-docx";
import { renderPdfBuffer } from "@/lib/resume/render-pdf";
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

async function tryRead(stored: string | null | undefined): Promise<Buffer | null> {
  if (!stored) return null;
  try {
    return await readFile(resolveUploadPath(stored));
  } catch {
    return null;
  }
}

/** Stale / thin / dishonest / non-AI / missing JD specialty → regenerate */
async function needRegenerate(opts: {
  text: string;
  jd: string;
  master: string;
  masterProfileJson?: string | null;
  force?: boolean;
  hasDocxPath?: boolean;
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
  if (!opts.hasDocxPath) return true;

  const policy = await getResumeEnginePolicy();
  const title = extractJobTitle(opts.jd);
  const domain = detectDomain(opts.jd, title, policy);
  const critical = criticalJdPhrases(opts.jd, domain, policy);
  if (critical.length >= 3 && !hasCriticalJdCoverage(opts.text, critical, 0.4)) {
    return true;
  }
  return false;
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

  const row = cc;
  const url = new URL(req.url);
  const fmt = (url.searchParams.get("fmt") || "txt").toLowerCase();
  const force = url.searchParams.get("regen") === "1";
  const base = row.candidate.name.replace(/\s+/g, "_");
  const master = (row.candidate.masterResumeText || "").trim();
  const masterProfileJson = row.candidate.masterProfileJson || null;
  const jd = row.chain.rawJobText || "";
  const storedText = row.tailoredResumeText || "";

  if (!master || master.length < 40) {
    return NextResponse.json(
      {
        error:
          "No master resume text on candidate. Replace master .docx on the candidate before downloading a pack.",
      },
      { status: 400 }
    );
  }

  const needAi = await needRegenerate({
    text: storedText,
    jd,
    master,
    masterProfileJson,
    force,
    hasDocxPath: !!row.docxPath,
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
  }

  if (fmt === "docx") {
    if (!needAi) {
      const fromDisk = await tryRead(row.docxPath);
      if (fromDisk) {
        return new NextResponse(new Uint8Array(fromDisk), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${base}_tailored.docx"`,
          },
        });
      }
    }
    try {
      const tailored = await runAi();
      await persistPack(tailored);
      const buf = await renderDocxBuffer(tailored.structured);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${base}_tailored.docx"`,
        },
      });
    } catch (e) {
      console.error("docx AI regenerate failed", e);
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

  if (fmt === "pdf") {
    if (!needAi) {
      const fromDisk = await tryRead(row.pdfPath);
      if (fromDisk) {
        return new NextResponse(new Uint8Array(fromDisk), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${base}_tailored.pdf"`,
          },
        });
      }
    }
    try {
      const tailored = await runAi();
      await persistPack(tailored);
      const buf = await renderPdfBuffer(tailored.structured);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}_tailored.pdf"`,
        },
      });
    } catch (e) {
      console.error("pdf AI regenerate failed", e);
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

  // TXT
  if (needAi) {
    try {
      const tailored = await runAi();
      await persistPack(tailored);
      return new NextResponse(tailored.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}_tailored.txt"`,
        },
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

  // Stale stored text that fails ship-ready: do not serve
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

  return new NextResponse(storedText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}_tailored.txt"`,
    },
  });
}
