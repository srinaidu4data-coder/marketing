import { requireAdmin } from "@/lib/session";
import { PageHeader, Badge } from "@/components/ui";
import { PromptLabForm } from "@/components/prompt-lab-form";
import { BIBLE_PROMPT } from "@/lib/resume-v2";
import Link from "next/link";

export default async function PromptLabPage() {
  await requireAdmin();

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Prompt Lab"
        description="Creative test harness for the prompt-only resume engine. Isolate every section of the Bible, duel providers, and full-generate with ATS/Psych."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge status="ACTIVE">resume-v2</Badge>
            <Link
              href="/admin/prompt"
              className="text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Edit ACTIVE prompt →
            </Link>
          </div>
        }
      />
      <PromptLabForm biblePreview={BIBLE_PROMPT} />
    </div>
  );
}
