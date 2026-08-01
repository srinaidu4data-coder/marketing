import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createCandidate, deleteCandidate } from "@/app/actions/candidates";
import { Button, EmptyState, Input, Label, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import {
  ExportFormatPicker,
  LayoutExportLinks,
  LayoutPicker,
} from "@/components/layout-picker";
import { getLayout } from "@/lib/resume/templates";
import { parseStoredMasterProfile } from "@/lib/resume/master-profile";
import { validateMasterProfile } from "@/lib/resume/master-pack-validate";

export default async function AdminCandidatesPage() {
  await requireAdmin();
  const candidates = await prisma.candidate.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Candidates"
        description="Roster, layouts, and master resumes for marketing packs."
      />

      <details className="rf-surface group open:shadow-lift">
        <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-semibold tracking-tight text-[#1d1d1f] marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0071e3] text-[14px] font-medium leading-none text-white">
              +
            </span>
            Add candidate
          </span>
        </summary>
        <form
          action={createCandidate}
          encType="multipart/form-data"
          className="border-t border-black/[0.05] px-5 py-5"
        >
          <div className="grid max-w-2xl gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="candidate@email.com"
              />
            </div>
            <LayoutPicker />
            <ExportFormatPicker />
            <div className="space-y-1.5">
              <Label htmlFor="resume">Master resume (optional)</Label>
              <Input
                id="resume"
                name="resume"
                type="file"
                accept=".txt,.doc,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="file:mr-3 file:rounded-full file:border-0 file:bg-black/[0.05] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-[#1d1d1f]"
              />
              <p className="text-[12.5px] text-[#86868b]">
                Prefer <strong className="font-semibold text-[#6e6e73]">.docx</strong> or{" "}
                <strong className="font-semibold text-[#6e6e73]">.txt</strong>. On upload we
                parse employers, dates, titles, and bullets into a structured profile —
                that ground truth is what the AI path must match (count + dates), paired
                with each JD.
              </p>
            </div>
            <Button type="submit" variant="soft" className="w-fit">
              Create candidate
            </Button>
          </div>
        </form>
      </details>

      {candidates.length === 0 ? (
        <EmptyState
          title="No candidates yet"
          description="Add the first person to the roster to start building packs."
        />
      ) : (
        <div className="rf-table-wrap overflow-x-auto">
          <table className="rf-table min-w-[720px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Master profile</th>
                <th>Layout</th>
                <th>Export</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const profile = parseStoredMasterProfile(
                  (c as { masterProfileJson?: string }).masterProfileJson
                );
                const report = validateMasterProfile(profile);
                const n = report.engagementCount;
                return (
                <tr key={c.id}>
                  <td className="font-semibold tracking-tight">{c.name}</td>
                  <td className="text-[#6e6e73]">{c.email}</td>
                  <td className="text-[12.5px]">
                    {n > 0 ? (
                      <span
                        className={
                          report.summary.fail > 0
                            ? "font-semibold text-amber-800"
                            : "font-semibold text-emerald-800"
                        }
                        title={`${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail`}
                      >
                        {n} eng · {report.score}%
                        {report.summary.fail > 0
                          ? ` · ${report.summary.fail} fail`
                          : report.summary.warn > 0
                            ? ` · ${report.summary.warn} warn`
                            : ""}
                      </span>
                    ) : (
                      <span className="text-amber-700">Not parsed</span>
                    )}
                  </td>
                  <td>
                    <div className="font-medium tracking-tight">
                      {getLayout(c.layoutId).name}
                    </div>
                    <LayoutExportLinks layoutId={c.layoutId} className="mt-1" />
                  </td>
                  <td>
                    <div className="flex flex-col gap-1 text-[12.5px]">
                      <span className="font-semibold text-[#1d1d1f]">
                        {c.exportFormat}
                      </span>
                      <span className="inline-flex flex-wrap gap-2.5">
                        <a
                          href={`/api/layouts/preview?layoutId=${encodeURIComponent(c.layoutId)}&fmt=docx`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[#0071e3] hover:text-[#0077ed]"
                        >
                          DOCX
                        </a>
                        <a
                          href={`/api/layouts/preview?layoutId=${encodeURIComponent(c.layoutId)}&fmt=pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[#0071e3] hover:text-[#0077ed]"
                        >
                          PDF
                        </a>
                      </span>
                    </div>
                  </td>
                  <td className="text-[#86868b]">{formatDate(c.createdAt)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/admin/candidates/${c.id}`}
                        className="text-[13px] font-semibold text-[#0071e3] hover:text-[#0077ed]"
                      >
                        View
                      </Link>
                      <form
                        action={async () => {
                          "use server";
                          await deleteCandidate(c.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="text-[13px] font-semibold text-[#ff3b30] hover:text-[#ff453a]"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
