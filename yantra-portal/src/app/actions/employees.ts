"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import { normalizeEmail, normalizePhone } from "@/lib/text-sanitize";

export type EmployeeActionResult = { ok: true } | { ok: false; error: string };

export async function createEmployee(formData: FormData): Promise<EmployeeActionResult> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const email = normalizeEmail(String(formData.get("email") || ""));
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "EMPLOYEE").toUpperCase();

  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  if (role !== "EMPLOYEE" && role !== "ADMIN") {
    return { ok: false, error: "Role must be EMPLOYEE or ADMIN." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.deletedAt) {
      return {
        ok: false,
        error: "A soft-deleted user has this email. Restore them from the employee list instead.",
      };
    }
    return { ok: false, error: "Email is already in use." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, phone, passwordHash, role },
  });

  await audit("employee.create", admin.id, {
    employeeId: user.id,
    name,
    email,
    phone,
    role,
  });

  revalidatePath("/admin/employees");
  revalidatePath("/admin");
  revalidatePath("/admin/allocations");
  revalidatePath("/admin/analytics");
  return { ok: true };
}

export async function updateEmployee(
  employeeId: string,
  formData: FormData
): Promise<EmployeeActionResult> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const email = normalizeEmail(String(formData.get("email") || ""));
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const role = String(formData.get("role") || "EMPLOYEE").toUpperCase();

  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (role !== "EMPLOYEE" && role !== "ADMIN") {
    return { ok: false, error: "Role must be EMPLOYEE or ADMIN." };
  }

  const user = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!user) return { ok: false, error: "User not found." };

  // Prevent demoting the last active admin
  if (user.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN", deletedAt: null, id: { not: employeeId } },
    });
    if (adminCount === 0) {
      return { ok: false, error: "Cannot demote the last active admin." };
    }
  }

  const clash = await prisma.user.findFirst({
    where: { email, id: { not: employeeId } },
  });
  if (clash) return { ok: false, error: "Email is already in use by another account." };

  await prisma.user.update({
    where: { id: employeeId },
    data: { name, email, phone, role },
  });

  await audit("employee.update", admin.id, {
    employeeId,
    name,
    email,
    phone,
    role,
  });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/allocations");
  return { ok: true };
}

export async function resetEmployeePassword(
  employeeId: string,
  formData: FormData
): Promise<EmployeeActionResult> {
  const admin = await requireAdmin();
  const password = String(formData.get("password") || "");
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

  const user = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!user) return { ok: false, error: "User not found." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: employeeId },
    data: { passwordHash },
  });

  await audit("employee.password_reset", admin.id, {
    employeeId,
    email: user.email,
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  return { ok: true };
}

export async function softDeleteEmployee(employeeId: string): Promise<EmployeeActionResult> {
  const admin = await requireAdmin();
  if (admin.id === employeeId) {
    return { ok: false, error: "You cannot deactivate your own account." };
  }

  const user = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!user) return { ok: false, error: "User not found." };
  if (user.deletedAt) return { ok: false, error: "User is already deactivated." };

  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN", deletedAt: null, id: { not: employeeId } },
    });
    if (adminCount === 0) {
      return { ok: false, error: "Cannot deactivate the last active admin." };
    }
  }

  await prisma.user.update({
    where: { id: employeeId },
    data: { deletedAt: new Date() },
  });

  await audit("employee.soft_delete", admin.id, {
    employeeId,
    email: user.email,
  });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/allocations");
  return { ok: true };
}

export async function restoreEmployee(employeeId: string): Promise<EmployeeActionResult> {
  const admin = await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!user) return { ok: false, error: "User not found." };
  if (!user.deletedAt) return { ok: false, error: "User is already active." };

  await prisma.user.update({
    where: { id: employeeId },
    data: { deletedAt: null },
  });

  await audit("employee.restore", admin.id, {
    employeeId,
    email: user.email,
  });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/allocations");
  return { ok: true };
}
