import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, Button, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { redirect } from "next/navigation";

export default async function ChainsPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin/chains");

  const chains = await prisma.chain.findMany({
    where: { employeeId: user.id },
    include: { candidates: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Your Chains"
        actions={
          <Link href="/chains/new">
            <Button>Start New Chain</Button>
          </Link>
        }
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
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
                  <Link href={`/chains/${c.id}`} className="font-medium hover:underline">
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
            {chains.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No chains yet. Start a new one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
