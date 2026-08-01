import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/paths";
import { tailorResume } from "@/lib/resume-tailor";
import { renderDocxBuffer } from "@/lib/resume/render-docx";
import { renderPdfBuffer } from "@/lib/resume/render-pdf";
import { detectDomain } from "@/lib/resume/jd-parse";
import { extractJobTitle } from "@/lib/resume/jd-parse";
import {
  criticalJdPhrases,
  hasCriticalJdCoverage,
} from "@/lib/resume/jd-weave";
import { getResumeEnginePolicy } from "@/lib/system-settings";

async function tryRead(stored: string | null | undefined): Promise<Buffer | null> {
  if (!stored) return null;
  try {
    return await readFile(resolveUploadPath(stored));
  } catch {
    return null;
  }
}

/** Stale / non-AI / missing JD specialty → must regenerate with OpenAI */
async function mustRegenerate(text: string, jd: string): Promise<boolean> {
  if (!text || text.length < 80) return true;
  if (!/Role Forge AI/i.test(text)) return true;
  if (!/OPENAI|gpt-|Model:/i.test(text)) return true;
  const policy = await getResumeEnginePolicy();
  const title = extractJobTitle(jd);
  const domain = detectDomain(jd, title, policy);
  const critical = criticalJdPhrases(jd, domain, policy);
  if (critical.length >= 3 && !hasCriticalJdCoverage(text, critical, 0.4)) {
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
  const master =
    (row.candidate.masterResumeText || "").trim() ||
    // last resort only — never prefer old tailored as "master" when real master exists
    (row.tailoredResumeText || "");
  const jd = row.chain.rawJobText || "";
  const storedText = row.tailoredResumeText || "";

  const needAi =
    force || (await mustRegenerate(storedText, jd)) || !row.docxPath;

  async function runAi() {
    return tailorResume({
      master,
      masterProfileJson: row.candidate.masterProfileJson || null,
      jd,
      vendorName: row.chain.vendorName,
      candidateName: row.candidate.name,
      layoutId: row.layoutId || row.candidate.layoutId,
      email: row.candidate.email,
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
      // Persist improved text for next time
      await prisma.chainCandidate.update({
        where: { id: row.id },
        data: {
          tailoredResumeText: tailored.text,
          jobTitle: tailored.structured.meta.jobTitle,
          skillFingerprint: tailored.structured.meta.skillFingerprint,
          atsScore: tailored.ats.score,
          atsReady: tailored.ats.ready,
          atsBreakdownJson: JSON.stringify(tailored.ats),
        },
      });
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
      await prisma.chainCandidate.update({
        where: { id: row.id },
        data: {
          tailoredResumeText: tailored.text,
          atsScore: tailored.ats.score,
          atsReady: tailored.ats.ready,
        },
      });
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
      await prisma.chainCandidate.update({
        where: { id: row.id },
        data: {
          tailoredResumeText: tailored.text,
          atsScore: tailored.ats.score,
          atsReady: tailored.ats.ready,
        },
      });
      return new NextResponse(tailored.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}_tailored.txt"`,
        },
      });
    } catch (e) {
      console.error("txt AI regenerate failed", e);
    }
  }

  return new NextResponse(storedText || "No tailored text", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}_tailored.txt"`,
    },
  });
}
