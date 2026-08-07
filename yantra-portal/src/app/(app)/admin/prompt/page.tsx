import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  promotePrompt,
  rollbackPrompt,
  savePromptVersion,
  installDefaultPrompt,
  archiveActivePrompt,
} from "@/app/actions/templates";
import { Badge, Button, PageHeader, Textarea } from "@/components/ui";
import { SYSTEM_PREAMBLE, PROMPT_PLACEHOLDERS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { PromptTestForm } from "@/components/prompt-test-form";
import { MIN_ACTIVE_PROMPT_CHARS } from "@/lib/resume-v2/bible-prompt";

export default async function PromptPage() {
  await requireAdmin();
  const versions = await prisma.promptVersion.findMany({
    orderBy: { createdAt: "desc" },
  });
  const active = versions.find((v) => v.status === "ACTIVE");
  const activeUsable =
    !!active && (active.content || "").trim().length >= MIN_ACTIVE_PROMPT_CHARS;
  const editorDefault = active?.content || "";

  return (
    <div className="space-y-8 p-2 lg:p-4">
      <PageHeader
        title="Prompt Template"
        description="ACTIVE prompt is the ONLY system-message source for generation (no separate code Bible). Master + JD are the user message. Edit → Save → Promote to ACTIVE. Test under Admin → Prompt Lab. The code default seed is never auto-reinserted — only via Install default seed or prisma seed."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeUsable ? (
              <Badge status="ACTIVE">Active</Badge>
            ) : (
              <Badge status="DRAFT">No usable ACTIVE</Badge>
            )}
            <a
              href="/admin/prompt-lab"
              className="text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Open Prompt Lab →
            </a>
            <a
              href="/admin/bullet-bank"
              className="text-sm font-medium text-sky-700 underline underline-offset-2"
            >
              Bullet bank →
            </a>
          </div>
        }
      />

      {!activeUsable ? (
        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-medium text-amber-950">No usable ACTIVE prompt</h2>
          <p className="text-sm text-amber-900">
            Generation will fail closed until you Save &amp; make ACTIVE a prompt
            (or install the code default). Empty/short ACTIVE rows are{" "}
            <strong>not</strong> auto-filled from the seed anymore.
          </p>
          <form action={installDefaultPrompt}>
            <Button type="submit">Install default seed as ACTIVE</Button>
          </form>
        </section>
      ) : null}

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-medium">Locked System Preamble</h2>
        <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-600">
          {SYSTEM_PREAMBLE}
        </pre>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Editable Middle Section</h2>
        <p className="text-sm text-slate-500">
          Edit the admin-controlled prompt body. Use only the whitelisted placeholders:{" "}
          {PROMPT_PLACEHOLDERS.map((p) => (
            <code key={p} className="mx-1 rounded bg-slate-100 px-1 text-xs">
              {p}
            </code>
          ))}
        </p>
        <form action={savePromptVersion} className="space-y-3">
          <Textarea
            name="content"
            rows={20}
            defaultValue={editorDefault}
            required
            placeholder="Paste or write the system prompt body, then Save & make ACTIVE."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Save as Draft</Button>
            <Button type="submit" name="promote" value="1">
              Save &amp; make ACTIVE
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Generation always uses the ACTIVE row only. After Save &amp; make ACTIVE,
            Regenerate packs to apply. Deleting/archiving ACTIVE will stick until you
            promote another version or install the default seed.
          </p>
        </form>
        {activeUsable ? (
          <form action={archiveActivePrompt} className="pt-2">
            <Button type="submit" variant="secondary">
              Archive ACTIVE (clear for generation)
            </Button>
            <p className="mt-1 text-xs text-slate-500">
              Archives the current ACTIVE row. Generation will refuse until you promote
              another version or install the default seed. History is kept.
            </p>
          </form>
        ) : null}
      </section>

      {activeUsable && active ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-medium">Test Mode</h2>
          <p className="text-sm text-slate-500">
            Run Test generates six packs: four engine orders (
            <code className="text-xs">AI→Rules</code>,{" "}
            <code className="text-xs">Rules→AI</code>,{" "}
            <code className="text-xs">Rules only</code>,{" "}
            <code className="text-xs">AI only</code>) plus{" "}
            <code className="text-xs">OpenAI</code> vs{" "}
            <code className="text-xs">Claude</code> forced ai-tailor tabs. Needs both{" "}
            <code className="text-xs">OPENAI_API_KEY</code> and{" "}
            <code className="text-xs">ANTHROPIC_API_KEY</code> for the LLM pair.
            Marks the version as tested.
          </p>
          <PromptTestForm versionId={active.id} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Version History</h2>
        <p className="text-sm text-slate-500">
          All saved versions. Promote or roll back to any prior version.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Tested</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-slate-500">
                    No versions yet. Install the default seed or Save a draft.
                  </td>
                </tr>
              ) : null}
              {versions.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{v.id.slice(0, 8)}</td>
                  <td className="px-4 py-3">{formatDateTime(v.createdAt)}</td>
                  <td className="px-4 py-3">{v.tested ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <Badge status={v.status}>{v.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <details>
                        <summary className="cursor-pointer hover:underline">Diff</summary>
                        <pre className="mt-2 max-h-48 max-w-lg overflow-auto rounded border bg-slate-50 p-2 text-xs">
                          {v.content.slice(0, 2000)}
                        </pre>
                      </details>
                      {v.status !== "ACTIVE" ? (
                        <>
                          <form
                            action={async () => {
                              "use server";
                              await promotePrompt(v.id);
                            }}
                          >
                            <button type="submit" className="hover:underline">
                              Promote
                            </button>
                          </form>
                          <form
                            action={async () => {
                              "use server";
                              await rollbackPrompt(v.id);
                            }}
                          >
                            <button type="submit" className="hover:underline">
                              Rollback
                            </button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
