import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/paths";
import { tailorResume } from "@/lib/resume-tailor";
import { renderDocxBuffer } from "@/lib/resume/render-docx";
import { renderPdfBuffer } from "@/lib/resume/render-pdf";

async function tryRead(stored: string | null | undefined): Promise<Buffer | null> {
  if (!stored) return null;
  try {
    return await readFile(resolveUploadPath(stored));
  } catch {
    return null;
  }
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

  const url = new URL(req.url);
  const fmt = (url.searchParams.get("fmt") || "txt").toLowerCase();
  const base = cc.candidate.name.replace(/\s+/g, "_");

  if (fmt === "docx") {
    const fromDisk = await tryRead(cc.docxPath);
    if (fromDisk) {
      return new NextResponse(new Uint8Array(fromDisk), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${base}_tailored.docx"`,
        },
      });
    }
    // Ephemeral FS: regenerate DOCX from tailor engine
    try {
      const tailored = await tailorResume({
        master: cc.candidate.masterResumeText || cc.tailoredResumeText,
        jd: cc.chain.rawJobText,
        vendorName: cc.chain.vendorName,
        candidateName: cc.candidate.name,
        layoutId: cc.layoutId || cc.candidate.layoutId,
        email: cc.candidate.email,
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
      console.error("docx regenerate failed", e);
    }
  }

  if (fmt === "pdf") {
    const fromDisk = await tryRead(cc.pdfPath);
    if (fromDisk) {
      return new NextResponse(new Uint8Array(fromDisk), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}_tailored.pdf"`,
        },
      });
    }
    try {
      const tailored = await tailorResume({
        master: cc.candidate.masterResumeText || cc.tailoredResumeText,
        jd: cc.chain.rawJobText,
        vendorName: cc.chain.vendorName,
        candidateName: cc.candidate.name,
        layoutId: cc.layoutId || cc.candidate.layoutId,
        email: cc.candidate.email,
      });
      const buf = await renderPdfBuffer(tailored.structured);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}_tailored.pdf"`,
        },
      });
    } catch (e) {
      console.error("pdf regenerate failed", e);
    }
  }

  return new NextResponse(cc.tailoredResumeText || "No tailored text", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}_tailored.txt"`,
    },
  });
}
