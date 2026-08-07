import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, PageHeader } from "@/components/ui";
import { CreateEmployeeForm } from "@/components/employee-forms";
import { formatDate } from "@/lib/utils";

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: { showDeleted?: string };
}) {
  await requireAdmin();
  const showDeleted = searchParams.showDeleted === "1";

  const users = await prisma.user.findMany({
    where: showDeleted ? {} : { deletedAt: null },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          allocations: true,
          chains: true,
        },
      },
    },
  });

  const active = users.filter((u) => !u.deletedAt).length;
  const employees = users.filter((u) => u.role === "EMPLOYEE" && !u.deletedAt).length;
  const admins = users.filter((u) => u.role === "ADMIN" && !u.deletedAt).length;

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Employee profiles"
        description="Create and manage staff logins, roles, and access. Soft-delete deactivates sign-in without removing history."
        actions={
          <Link
            href={showDeleted ? "/admin/employees" : "/admin/employees?showDeleted=1"}
            className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
          >
            {showDeleted ? "Hide deactivated" : "Show deactivated"}
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Active</div>
          <div className="mt-1 text-2xl font-semibold">{active}</div>
        </div>
        <div className="rounded-lg border bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Employees</div>
          <div className="mt-1 text-2xl font-semibold">{employees}</div>
        </div>
        <div className="rounded-lg border bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Admins</div>
          <div className="mt-1 text-2xl font-semibold">{admins}</div>
        </div>
      </div>

      <details className="rounded-lg border p-4" open>
        <summary className="cursor-pointer font-medium">
          Add employee / admin
        </summary>
        <CreateEmployeeForm />
      </details>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Pool</th>
              <th className="px-4 py-3 font-medium">Chains</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  No profiles yet. Add an employee above.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b last:border-0 ${u.deletedAt ? "bg-slate-50 opacity-70" : ""}`}
                >
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {u.phone?.trim() ? u.phone : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={u.role === "ADMIN" ? "ACTIVE" : "READY"}>
                      {u.role === "ADMIN" ? "Admin" : "Employee"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u._count.allocations}</td>
                  <td className="px-4 py-3 text-slate-600">{u._count.chains}</td>
                  <td className="px-4 py-3">
                    {u.deletedAt ? (
                      <Badge status="FAILED">Deactivated</Badge>
                    ) : (
                      <Badge status="SENT">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/employees/${u.id}`}
                      className="text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
