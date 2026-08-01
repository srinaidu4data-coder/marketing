import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { VendorBlockBanner } from "@/components/vendor-block-banner";
import { NewChainForm } from "@/components/new-chain-form";
import { assessCandidateReady } from "@/lib/candidate-ready";

export default async function NewChainPage() {
  const user = await requireUser();

  let poolRaw: {
    id: string;
    name: string;
    email: string;
    layoutId: string;
    exportFormat: string;
    masterResumeText: string;
    masterProfileJson: string;
  }[] = [];

  if (user.role === "EMPLOYEE") {
    const allocs = await prisma.allocation.findMany({
      where: { employeeId: user.id },
      include: { candidate: true },
      orderBy: { createdAt: "asc" },
    });
    poolRaw = allocs.map((a) => a.candidate);
  } else {
    poolRaw = await prisma.candidate.findMany({ orderBy: { name: "asc" } });
  }

  const pool = poolRaw.map((c) => {
    const r = assessCandidateReady(c);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      layoutId: c.layoutId,
      exportFormat: c.exportFormat,
      ready: r.ok,
      readyReason: r.reason,
      engagementCount: r.engagementCount,
    };
  });

  const readyCount = pool.filter((c) => c.ready).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Suspense fallback={null}>
        <VendorBlockBanner />
      </Suspense>

      <PageHeader
        title="New chain"
        description="1) Candidates with master ready · 2) Paste JD · 3) AI builds packs · 4) Review ship-ready · 5) Send"
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
      ) : readyCount === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">No masters ready for pack generation</p>
          <p className="mt-1">
            Upload or replace each candidate&apos;s master resume (.docx) so
            employers and dates are parsed. Then return here.
          </p>
          <Link
            href={user.role === "ADMIN" ? "/admin/candidates" : "/"}
            className="mt-4 inline-block font-medium text-slate-800 underline"
          >
            Go to candidates
          </Link>
        </div>
      ) : (
        <>
          {readyCount < pool.length ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
              {pool.length - readyCount} candidate(s) blocked (no parsed master).
              Only ready candidates can be selected.
            </div>
          ) : null}
          <NewChainForm
            pool={pool}
            cancelHref={user.role === "ADMIN" ? "/admin/chains" : "/chains"}
          />
        </>
      )}
    </div>
  );
}
