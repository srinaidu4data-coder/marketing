import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ToolBankForm } from "@/components/tool-bank-form";
import { loadToolBankForAdmin } from "@/app/actions/tool-bank";
import Link from "next/link";

export default async function ToolBankPage() {
  await requireAdmin();
  const data = await loadToolBankForAdmin();

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Tool bank"
        description="Tools, Platforms, Processes, Compliance, and Regulations — each with optional year ranges (e.g. FastAPI | 2018+, SQL | timeless). Powers era-honest Tech Stack / Environment / Technical Skills."
        actions={
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/admin/bullet-bank"
              className="font-medium text-sky-700 underline underline-offset-2"
            >
              Bullet bank →
            </Link>
            <Link
              href="/admin/prompt-lab"
              className="font-medium text-sky-700 underline underline-offset-2"
            >
              Prompt Lab →
            </Link>
          </div>
        }
      />
      <ToolBankForm
        initialSectioned={data.sectioned}
        stats={data.stats}
        defaultStats={data.defaultStats}
      />
    </div>
  );
}
