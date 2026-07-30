import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  promoteEmailTemplate,
  rollbackEmailTemplate,
  saveEmailTemplate,
} from "@/app/actions/templates";
import { Badge, Button, PageHeader, Textarea } from "@/components/ui";
import { EMAIL_PLACEHOLDERS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { renderEmailTemplate } from "@/lib/resume-tailor";

function VersionTable({
  versions,
}: {
  versions: { id: string; content: string; status: string; createdAt: Date }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className="px-4 py-3 font-medium">Version</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-mono text-xs">{v.id.slice(0, 8)}</td>
              <td className="px-4 py-3">{formatDateTime(v.createdAt)}</td>
              <td className="px-4 py-3">
                <Badge status={v.status}>{v.status}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <details>
                    <summary className="cursor-pointer hover:underline">Diff</summary>
                    <pre className="mt-2 max-h-40 max-w-lg overflow-auto rounded border bg-slate-50 p-2 text-xs">
                      {v.content}
                    </pre>
                  </details>
                  {v.status !== "ACTIVE" ? (
                    <>
                      <form
                        action={async () => {
                          "use server";
                          await promoteEmailTemplate(v.id);
                        }}
                      >
                        <button type="submit" className="hover:underline">
                          Promote
                        </button>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          await rollbackEmailTemplate(v.id);
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
  );
}

export default async function EmailTemplatePage() {
  await requireAdmin();
  const subjects = await prisma.emailTemplateVersion.findMany({
    where: { type: "SUBJECT" },
    orderBy: { createdAt: "desc" },
  });
  const bodies = await prisma.emailTemplateVersion.findMany({
    where: { type: "BODY" },
    orderBy: { createdAt: "desc" },
  });
  const activeSubject = subjects.find((s) => s.status === "ACTIVE");
  const activeBody = bodies.find((b) => b.status === "ACTIVE");

  const sampleCtx = {
    candidate_name: "Jane Smith",
    job_title_or_vendor_line: "SAP FICO Consultant",
    vendor_name: "Acme Staffing",
    employee_name: "Admin User",
    employee_email: "admin@srsoft.com",
    employee_note: "",
    job_requirement_summary:
      "6-month SAP FICO contract, hybrid Chicago. Must have strong GL, AP, AR, and asset accounting experience. S/4HANA migration experience a plus.",
  };
  const previewSubject = renderEmailTemplate(
    activeSubject?.content || "{{candidate_name}} — {{job_title_or_vendor_line}}  — {{vendor_name}}",
    sampleCtx
  );
  const previewBody = renderEmailTemplate(activeBody?.content || "", sampleCtx);

  return (
    <div className="space-y-10 p-2 lg:p-4">
      <PageHeader
        title="Email Template"
        description="Subject and body templates sent to vendors for each included candidate. Admins manage versions here; employees never see this surface."
      />

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Subject</h2>
          {activeSubject ? <Badge status="ACTIVE">Active</Badge> : null}
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Rendered Preview</h3>
          <p className="mt-1 text-xs text-slate-500">
            Rendered against a hardcoded sample context for visual review.
          </p>
          <p className="mt-2 rounded bg-slate-50 p-3 text-sm">{previewSubject}</p>
        </div>
        <form
          action={async (fd) => {
            "use server";
            await saveEmailTemplate("SUBJECT", fd);
          }}
          className="space-y-3 rounded-lg border p-4"
        >
          <h3 className="font-medium">Editable Subject Template</h3>
          <p className="text-sm text-slate-500">
            Allowed placeholders:{" "}
            {EMAIL_PLACEHOLDERS.map((p) => (
              <code key={p} className="mx-1 rounded bg-slate-100 px-1 text-xs">
                {p}
              </code>
            ))}
            . Saving creates a new immutable version row.
          </p>
          <Textarea name="content" rows={3} defaultValue={activeSubject?.content || ""} required />
          <Button type="submit">Save as New Version</Button>
        </form>
        <div>
          <h3 className="mb-2 font-medium">Version History</h3>
          <p className="mb-3 text-sm text-slate-500">
            All saved subject versions. Promote or roll back to any prior version.
          </p>
          <VersionTable versions={subjects} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Body</h2>
          {activeBody ? <Badge status="ACTIVE">Active</Badge> : null}
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Rendered Preview</h3>
          <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{previewBody}</pre>
        </div>
        <form
          action={async (fd) => {
            "use server";
            await saveEmailTemplate("BODY", fd);
          }}
          className="space-y-3 rounded-lg border p-4"
        >
          <h3 className="font-medium">Editable Body Template</h3>
          <Textarea name="content" rows={12} defaultValue={activeBody?.content || ""} required />
          <Button type="submit">Save as New Version</Button>
        </form>
        <div>
          <h3 className="mb-2 font-medium">Version History</h3>
          <p className="mb-3 text-sm text-slate-500">
            All saved body versions. Promote or roll back to any prior version.
          </p>
          <VersionTable versions={bodies} />
        </div>
      </section>
    </div>
  );
}
