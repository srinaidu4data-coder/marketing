import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const c = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Prefer original binary master when stored on disk
  if (c.masterResumePath) {
    try {
      const full = path.isAbsolute(c.masterResumePath)
        ? c.masterResumePath
        : path.join(process.cwd(), c.masterResumePath);
      const buf = await readFile(full);
      const base = path.basename(c.masterResumePath);
      const ext = path.extname(base).toLowerCase();
      const type =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : ext === ".doc"
              ? "application/msword"
              : "application/octet-stream";
      const downloadName = `${c.name.replace(/\s+/g, "_")}_master${ext || ".bin"}`;
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": type,
          "Content-Disposition": `attachment; filename="${downloadName}"`,
        },
      });
    } catch {
      /* fall through to text */
    }
  }

  const filename = `${c.name.replace(/\s+/g, "_")}_master.txt`;
  return new NextResponse(c.masterResumeText || "No master resume text", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
