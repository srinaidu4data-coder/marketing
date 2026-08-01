import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { ArrowRight, Plus, Users } from "lucide-react";

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
    <div className="space-y-8">
      <PageHeader
        title={`Hi, ${user.name?.split(/\s+/)[0] || user.name}`}
        description="Paste a job. Generate AI resumes. Send to vendors."
        actions={
          <Link href="/chains/new">
            <Button variant="soft" size="lg">
              <Plus className="h-4 w-4" />
              New chain
            </Button>
          </Link>
        }
      />

      {/* Primary CTA */}
      <Link href="/chains/new" className="group block">
        <Card className="relative overflow-hidden border-[#0071e3]/15 bg-gradient-to-br from-[#0071e3]/[0.06] via-white to-white p-6 shadow-soft transition-all duration-200 ease-apple hover:shadow-lift sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="rf-kicker text-[#0071e3]">Start here</p>
              <h2 className="mt-1 text-[21px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                Create a marketing chain
              </h2>
              <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-[#6e6e73]">
                AI tailors every candidate to the JD — layouts, projects, and jargon.
              </p>
            </div>
            <span className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-[#0071e3] px-5 text-[13.5px] font-semibold text-white shadow-soft transition group-hover:bg-[#0077ed]">
              Get started
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </div>
        </Card>
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
              <Users className="h-4 w-4 text-[#86868b]" strokeWidth={1.75} />
              Your pool
              <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-semibold text-[#6e6e73]">
                {pool.length}
              </span>
            </h2>
          </div>
          {pool.length === 0 ? (
            <EmptyState
              title="No candidates yet"
              description="Ask your admin to allocate candidates to your pool."
            />
          ) : (
            <Card className="divide-y divide-zinc-100 p-0">
              {pool.slice(0, 8).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {a.candidate.name}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {a.candidate.email}
                    </p>
                  </div>
                </div>
              ))}
              {pool.length > 8 ? (
                <p className="px-4 py-2 text-xs text-zinc-400">
                  +{pool.length - 8} more
                </p>
              ) : null}
            </Card>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Recent chains</h2>
            <Link
              href="/chains"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              View all
            </Link>
          </div>
          {recentChains.length === 0 ? (
            <EmptyState
              title="No chains yet"
              description="Create your first chain to generate AI resumes."
              action={
                <Link href="/chains/new">
                  <Button size="sm">New chain</Button>
                </Link>
              }
            />
          ) : (
            <Card className="divide-y divide-zinc-100 p-0">
              {recentChains.map((c) => (
                <Link
                  key={c.id}
                  href={`/chains/${c.id}`}
                  className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {c.vendorName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDateTime(c.createdAt)} · {c.candidates.length}{" "}
                      candidate{c.candidates.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge status={c.status}>{c.status}</Badge>
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
