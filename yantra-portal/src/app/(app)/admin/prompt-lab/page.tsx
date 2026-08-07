import { requireAdmin } from "@/lib/session";
import { PageHeader, Badge, Button } from "@/components/ui";
import { PromptLabForm } from "@/components/prompt-lab-form";
import { getActiveSystemPrompt } from "@/lib/resume-v2/bible-prompt";
import { installDefaultPrompt } from "@/app/actions/templates";
import Link from "next/link";

export default async function PromptLabPage() {
  await requireAdmin();
  const active = await getActiveSystemPrompt();

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Prompt Lab"
        description="Test harness for the Admin ACTIVE prompt (sole system message). Isolate sections, duel providers, and full-generate with ATS/Psych. Does not auto-seed the prompt."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {active ? (
              <Badge status="ACTIVE">admin ACTIVE</Badge>
            ) : (
              <Badge status="DRAFT">no ACTIVE</Badge>
            )}
            <Link
              href="/admin/prompt"
              className="text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Edit ACTIVE prompt →
            </Link>
          </div>
        }
      />

      {!active ? (
        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-medium text-amber-950">No usable ACTIVE prompt</h2>
          <p className="text-sm text-amber-900">
            Prompt Lab will not invent a prompt. Set one under Admin → Prompt, or
            install the code default.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/prompt"
              className="inline-flex items-center rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
            >
              Go to Admin → Prompt
            </Link>
            <form action={installDefaultPrompt}>
              <Button type="submit">Install default seed as ACTIVE</Button>
            </form>
          </div>
        </section>
      ) : (
        <PromptLabForm biblePreview={active.content} />
      )}
    </div>
  );
}
