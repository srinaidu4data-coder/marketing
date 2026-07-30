import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export default async function AdminChainsPage() {
  await requireAdmin();
  const chains = await prisma.chain.findMany({
    include: {
      employee: true,
      candidates: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="All Chains"
        description="System-wide view — every employee's Chain activity."
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Candidates</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.employee.name}</div>
                  <div className="text-xs text-slate-500">{c.employee.email}</div>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/chains/${c.id}`} className="font-medium hover:underline">
                    {c.vendorName}
                  </Link>
                  <div className="text-xs text-slate-500">{c.vendorEmail}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge status={c.status}>
                    {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                  </Badge>
                </td>
                <td className="px-4 py-3">{c.candidates.length}</td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
