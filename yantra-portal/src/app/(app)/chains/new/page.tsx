import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { VendorBlockBanner } from "@/components/vendor-block-banner";
import { NewChainForm } from "@/components/new-chain-form";

export default async function NewChainPage() {
  const user = await requireUser();

  let pool: {
    id: string;
    name: string;
    email: string;
    layoutId: string;
    exportFormat: string;
  }[] = [];
  if (user.role === "EMPLOYEE") {
    const allocs = await prisma.allocation.findMany({
      where: { employeeId: user.id },
      include: { candidate: true },
      orderBy: { createdAt: "asc" },
    });
    pool = allocs.map((a) => a.candidate);
  } else {
    pool = await prisma.candidate.findMany({ orderBy: { name: "asc" } });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Suspense fallback={null}>
        <VendorBlockBanner />
      </Suspense>

      <PageHeader
        title="New chain"
        description="Paste the job. Pick candidates. AI builds resumes."
      />

      {pool.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">No candidates allocated</p>
          <p className="mt-1">
            Ask your admin to allocate candidates before starting a Chain.
          </p>
          <Link href="/" className="mt-4 inline-block text-slate-700 underline">
            Back home
          </Link>
        </div>
      ) : (
        <NewChainForm
          pool={pool}
          cancelHref={user.role === "ADMIN" ? "/admin/chains" : "/chains"}
        />
      )}
    </div>
  );
}
