"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";

/** Toggle a single candidate↔employee allocation pair (matches live API). */
export async function setAllocationPair(
  candidateId: string,
  employeeId: string,
  allocated: boolean
) {
  const admin = await requireAdmin();
  if (!candidateId || !employeeId) {
    return { error: "Invalid body", code: "VALIDATION_ERROR" };
  }

  if (allocated) {
    await prisma.allocation.upsert({
      where: { candidateId_employeeId: { candidateId, employeeId } },
      create: { candidateId, employeeId },
      update: {},
    });
    await audit("ALLOCATION_SET", admin.id, { candidateId, employeeId });
  } else {
    await prisma.allocation.deleteMany({ where: { candidateId, employeeId } });
    await audit("ALLOCATION_CLEAR", admin.id, { candidateId, employeeId });
  }

  revalidatePath("/admin/allocations");
  revalidatePath("/");
  revalidatePath("/chains/new");
  return { ok: true };
}

/** @deprecated use setAllocationPair — kept for any old callers */
export async function setAllocation(candidateId: string, employeeId: string) {
  return setAllocationPair(candidateId, employeeId, true);
}

export async function clearAllocation(candidateId: string) {
  const admin = await requireAdmin();
  await prisma.allocation.deleteMany({ where: { candidateId } });
  await audit("ALLOCATION_CLEAR", admin.id, { candidateId, all: true });
  revalidatePath("/admin/allocations");
  revalidatePath("/");
  return { ok: true };
}
