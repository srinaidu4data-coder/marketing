import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";

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

  if (fmt === "docx" && cc.docxPath) {
    try {
      const buf = await readFile(path.join(process.cwd(), cc.docxPath));
      return new NextResponse(buf, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${base}_tailored.docx"`,
        },
      });
    } catch {
      /* fall through */
    }
  }

  if (fmt === "pdf" && cc.pdfPath) {
    try {
      const buf = await readFile(path.join(process.cwd(), cc.pdfPath));
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}_tailored.pdf"`,
        },
      });
    } catch {
      /* fall through */
    }
  }

  return new NextResponse(cc.tailoredResumeText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}_tailored.txt"`,
    },
  });
}
