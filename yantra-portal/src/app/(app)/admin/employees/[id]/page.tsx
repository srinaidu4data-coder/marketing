import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import {
  EditEmployeeForm,
  EmployeeStatusActions,
  ResetPasswordForm,
} from "@/components/employee-forms";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function AdminEmployeeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = await requireAdmin();
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      allocations: {
        include: { candidate: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      chains: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { _count: { select: { candidates: true } } },
      },
      _count: { select: { allocations: true, chains: true, auditLogs: true } },
    },
  });
  if (!user) notFound();

  const recentAudit = await prisma.auditLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title={user.name}
        description={
          <>
            Profile management ·{" "}
            <Link href="/admin/employees" className="underline underline-offset-2">
              Back to employees
            </Link>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={user.role === "ADMIN" ? "ACTIVE" : "READY"}>
              {user.role === "ADMIN" ? "Admin" : "Employee"}
            </Badge>
            {user.deletedAt ? (
              <Badge status="FAILED">Deactivated</Badge>
            ) : (
              <Badge status="SENT">Active</Badge>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs uppercase text-slate-500">Candidate pool</div>
          <div className="mt-1 text-2xl font-semibold">{user._count.allocations}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Chains</div>
          <div className="mt-1 text-2xl font-semibold">{user._count.chains}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Audit events</div>
          <div className="mt-1 text-2xl font-semibold">{user._count.auditLogs}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Joined</div>
          <div className="mt-1 text-lg font-semibold">{formatDate(user.createdAt)}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="font-medium">Profile</h2>
          <EditEmployeeForm
            employeeId={user.id}
            name={user.name}
            email={user.email}
            role={user.role}
          />
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="font-medium">Reset password</h2>
            <p className="text-sm text-slate-500">
              Sets a new temporary password. Share it out of band — it is not emailed.
            </p>
            <ResetPasswordForm employeeId={user.id} />
          </Card>

          <Card className="space-y-4">
            <h2 className="font-medium">Account status</h2>
            <p className="text-sm text-slate-500">
              Deactivated users cannot sign in. History (chains, allocations, audit) is kept.
            </p>
            {user.deletedAt ? (
              <p className="text-sm text-amber-700">
                Deactivated {formatDateTime(user.deletedAt)}
              </p>
            ) : null}
            <EmployeeStatusActions
              employeeId={user.id}
              deleted={Boolean(user.deletedAt)}
              isSelf={admin.id === user.id}
            />
          </Card>
        </div>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Allocated candidates ({user.allocations.length})</h2>
          <Link
            href="/admin/allocations"
            className="text-sm text-sky-700 underline underline-offset-2"
          >
            Edit allocations →
          </Link>
        </div>
        {user.allocations.length === 0 ? (
          <p className="text-sm text-slate-500">No candidates in this employee&apos;s pool yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {user.allocations.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{a.candidate.name}</div>
                  <div className="text-slate-500">{a.candidate.email}</div>
                </div>
                <Link
                  href={`/admin/candidates/${a.candidate.id}`}
                  className="shrink-0 text-sky-700 underline underline-offset-2"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Recent chains</h2>
          <Link href="/admin/chains" className="text-sm text-sky-700 underline underline-offset-2">
            All chains →
          </Link>
        </div>
        {user.chains.length === 0 ? (
          <p className="text-sm text-slate-500">No chains yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Packs</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {user.chains.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/chains/${c.id}`}
                        className="font-medium text-sky-800 underline-offset-2 hover:underline"
                      >
                        {c.vendorName}
                      </Link>
                      <div className="text-xs text-slate-500">{c.vendorEmail}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge status={c.status}>{c.status}</Badge>
                    </td>
                    <td className="px-3 py-2">{c._count.candidates}</td>
                    <td className="px-3 py-2 text-slate-600">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Recent activity</h2>
        {recentAudit.length === 0 ? (
          <p className="text-sm text-slate-500">No audit events for this user yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentAudit.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2 last:border-0"
              >
                <span className="font-mono text-xs text-slate-800">{a.action}</span>
                <span className="text-xs text-slate-500">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
