import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  promotePrompt,
  rollbackPrompt,
  savePromptVersion,
} from "@/app/actions/templates";
import { Badge, Button, PageHeader, Textarea } from "@/components/ui";
import { SYSTEM_PREAMBLE, PROMPT_PLACEHOLDERS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { PromptTestForm } from "@/components/prompt-test-form";

export default async function PromptPage() {
  await requireAdmin();
  const versions = await prisma.promptVersion.findMany({ orderBy: { createdAt: "desc" } });
  const active = versions.find((v) => v.status === "ACTIVE") || versions[0];

  return (
    <div className="space-y-8 p-2 lg:p-4">
      <PageHeader
        title="Prompt Template"
        description="Active prompt template, test runs, and rollback."
        actions={active ? <Badge status="ACTIVE">Active</Badge> : null}
      />

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
          <Textarea name="content" rows={16} defaultValue={active?.content || ""} required />
          <Button type="submit">Save as New Version</Button>
        </form>
      </section>

      {active ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-medium">Test Mode</h2>
          <p className="text-sm text-slate-500">
            Run the active progressive tailor against sample JD + master. Results appear below
            (ATS score + full resume text). This marks the version as tested.
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
              {versions.map((v, i) => (
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
                      {i === 0 ? null : null}
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
