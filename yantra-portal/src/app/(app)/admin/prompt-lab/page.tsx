import { requireAdmin } from "@/lib/session";
import { PageHeader, Badge } from "@/components/ui";
import { PromptLabForm } from "@/components/prompt-lab-form";
import { getActiveSystemPrompt } from "@/lib/resume-v2/bible-prompt";
import Link from "next/link";

export default async function PromptLabPage() {
  await requireAdmin();
  const active = await getActiveSystemPrompt();

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Prompt Lab"
        description="Test harness for the Admin ACTIVE prompt (sole system message). Isolate sections, duel providers, and full-generate with ATS/Psych."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge status="ACTIVE">admin ACTIVE</Badge>
            <Link
              href="/admin/prompt"
              className="text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Edit ACTIVE prompt →
            </Link>
          </div>
        }
      />
      <PromptLabForm biblePreview={active.content} />
    </div>
  );
}
