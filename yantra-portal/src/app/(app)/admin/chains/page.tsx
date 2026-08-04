import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, Button, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import {
  hideEmployeeChainsAction,
  hideSingleEmployeeChainAction,
  unhideChainFromEmployeeAction,
} from "@/app/actions/chains";

export default async function AdminChainsPage({
  searchParams,
}: {
  searchParams?: { cleaned?: string; count?: string };
}) {
  await requireAdmin();
  const chains = await prisma.chain.findMany({
    include: {
      employee: true,
      candidates: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const visibleToEmployees = chains.filter(
    (c) => !c.employeeHiddenAt && c.employee.role === "EMPLOYEE"
  ).length;
  const hiddenFromEmployees = chains.filter((c) => c.employeeHiddenAt).length;

  async function cleanAllAction() {
    "use server";
    const fd = new FormData();
    fd.set("scope", "all_employees");
    const r = await hideEmployeeChainsAction(fd);
    if (r.ok) {
      redirect(`/admin/chains?cleaned=1&count=${r.count}`);
    }
  }

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="All Chains"
        description="System-wide view — every employee’s chain activity. Cleaning only hides chains from employees; admin history is kept forever."
        actions={
          <form action={cleanAllAction}>
            <Button
              type="submit"
              variant="outline"
              title="Hide all employee-owned chains from employee workspaces. Admin still sees everything."
            >
              Clean all employee chains
            </Button>
          </form>
        }
      />

      {searchParams?.cleaned === "1" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Cleaned {searchParams.count || "0"} chain
          {searchParams.count === "1" ? "" : "s"} from employee view. Admin
          history unchanged.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-[13px] text-slate-600">
        <span className="rounded-full bg-slate-100 px-3 py-1">
          Total <strong className="text-slate-900">{chains.length}</strong>
        </span>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-900">
          Visible to employees <strong>{visibleToEmployees}</strong>
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">
          Hidden from employees <strong>{hiddenFromEmployees}</strong>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Employee view</th>
              <th className="px-4 py-3 font-medium">Candidates</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Admin</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr
                key={c.id}
                className="border-b last:border-0 hover:bg-slate-50/60"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{c.employee.name}</div>
                  <div className="text-xs text-slate-500">{c.employee.email}</div>
                  {c.employee.role === "ADMIN" ? (
                    <span className="text-[10px] font-semibold uppercase text-slate-400">
                      Admin-owned
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/chains/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.vendorName}
                  </Link>
                  <div className="text-xs text-slate-500">{c.vendorEmail}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge status={c.status}>
                    {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.employee.role !== "EMPLOYEE" ? (
                    <span className="text-slate-400">n/a</span>
                  ) : c.employeeHiddenAt ? (
                    <span className="font-semibold text-amber-800">Hidden</span>
                  ) : (
                    <span className="font-semibold text-emerald-700">Visible</span>
                  )}
                </td>
                <td className="px-4 py-3">{c.candidates.length}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDateTime(c.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {c.employeeHiddenAt ? (
                    <form
                      action={async () => {
                        "use server";
                        await unhideChainFromEmployeeAction(c.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="text-xs font-semibold text-sky-700 hover:underline"
                      >
                        Restore to employee
                      </button>
                    </form>
                  ) : c.employee.role === "EMPLOYEE" ? (
                    <form
                      action={async () => {
                        "use server";
                        await hideSingleEmployeeChainAction(c.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="text-xs font-semibold text-slate-600 hover:underline"
                      >
                        Hide from employee
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {chains.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No chains yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
