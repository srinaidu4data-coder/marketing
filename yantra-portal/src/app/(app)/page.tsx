import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export default async function EmployeeHomePage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin");

  const pool = await prisma.allocation.findMany({
    where: { employeeId: user.id },
    include: { candidate: true },
    orderBy: { createdAt: "desc" },
  });

  const recentChains = await prisma.chain.findMany({
    where: { employeeId: user.id },
    include: { candidates: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title={
          <>
            Welcome, {user.name}
          </>
        }
        description="Ready to send resumes?"
        actions={
          <Link href="/chains/new">
            <Button>Start New Chain</Button>
          </Link>
        }
      />

      <Card>
        <h2 className="text-xl font-semibold">Start a new Chain</h2>
        <p className="mt-1 text-sm text-slate-500">
          Paste a job requirement and we&apos;ll tailor your pool.
        </p>
        <div className="mt-4">
          <Link href="/chains/new">
            <Button variant="outline">Start New Chain</Button>
          </Link>
        </div>
      </Card>

      <section className="rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Your Pool ({pool.length})</h2>
        <ul className="mt-4 space-y-2">
          {pool.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <div className="text-sm font-medium">{a.candidate.name}</div>
                <div className="text-xs text-slate-500">{a.candidate.email}</div>
              </div>
            </li>
          ))}
          {pool.length === 0 ? (
            <li className="text-sm text-slate-500">No candidates allocated. Ask your admin.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Chains</h2>
          <Link href="/chains" className="text-sm text-slate-600 hover:underline">
            Your Chains →
          </Link>
        </div>
        <ul className="mt-4 space-y-2">
          {recentChains.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <Link
                  href={`/chains/${c.id}`}
                  className="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
                >
                  {c.vendorName}
                </Link>
                <div className="text-xs text-slate-500">
                  {formatDateTime(c.createdAt)} · {c.candidates.length} candidates
                </div>
              </div>
              <Badge status={c.status}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
