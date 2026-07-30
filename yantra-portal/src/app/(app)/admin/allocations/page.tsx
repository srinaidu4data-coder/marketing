import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { AllocationGrid } from "@/components/allocation-grid";

export default async function AllocationsPage() {
  await requireAdmin();
  const candidates = await prisma.candidate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const allocations = await prisma.allocation.findMany({
    select: { candidateId: true, employeeId: true },
  });

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Allocations"
        description="Check the box to assign a candidate to an employee pool. Uncheck to remove. Changes save immediately."
      />
      <AllocationGrid
        candidates={candidates}
        employees={employees}
        allocations={allocations}
      />
    </div>
  );
}
