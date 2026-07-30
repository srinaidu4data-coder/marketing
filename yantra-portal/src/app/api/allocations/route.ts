import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/** Live contract: { candidateId, employeeId, allocated: boolean } */
const schema = z.object({
  candidateId: z.string().min(1),
  employeeId: z.string().min(1),
  allocated: z.boolean(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { candidateId, employeeId, allocated } = parsed.data;

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const employee = await prisma.user.findFirst({
    where: { id: employeeId, role: "EMPLOYEE", deletedAt: null },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (allocated) {
    await prisma.allocation.upsert({
      where: {
        candidateId_employeeId: { candidateId, employeeId },
      },
      create: { candidateId, employeeId },
      update: {},
    });
    await audit("ALLOCATION_SET", session.user.id, { candidateId, employeeId });
  } else {
    await prisma.allocation.deleteMany({ where: { candidateId, employeeId } });
    await audit("ALLOCATION_CLEAR", session.user.id, { candidateId, employeeId });
  }

  return NextResponse.json({ ok: true, candidateId, employeeId, allocated });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
