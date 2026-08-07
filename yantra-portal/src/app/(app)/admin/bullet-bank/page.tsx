import { requireAdmin } from "@/lib/session";
import { PageHeader, Badge } from "@/components/ui";
import { BulletBankForm } from "@/components/bullet-bank-form";
import { loadBulletBankForAdmin } from "@/app/actions/bullet-bank";
import Link from "next/link";

export default async function BulletBankPage() {
  await requireAdmin();
  const data = await loadBulletBankForAdmin();

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Skill-neutral bullet bank"
        description="Repository of consulting-delivery bullets used when packs are thin. Injected into the generation prompt and used by ship-shape padding — never company+(N/M) filler. For Tech Stack / Environment catalogs, use Tool bank."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge status="ACTIVE">{data.bullets.length} bullets</Badge>
            <Link
              href="/admin/tool-bank"
              className="text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Tool bank →
            </Link>
            <Link
              href="/admin/prompt"
              className="text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Prompt Bible →
            </Link>
          </div>
        }
      />
      <BulletBankForm
        initialRaw={data.raw}
        initialCount={data.bullets.length}
        defaultCount={data.defaultCount}
      />
    </div>
  );
}
