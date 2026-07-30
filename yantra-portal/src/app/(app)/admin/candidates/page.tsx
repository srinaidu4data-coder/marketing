import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createCandidate, deleteCandidate } from "@/app/actions/candidates";
import { Button, Input, Label, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import {
  ExportFormatPicker,
  LayoutExportLinks,
  LayoutPicker,
} from "@/components/layout-picker";
import { getLayout } from "@/lib/resume/templates";

export default async function AdminCandidatesPage() {
  await requireAdmin();
  const candidates = await prisma.candidate.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Candidates"
        description="Assign a unique resume layout per candidate so chain packs never look identical."
      />

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">Add Candidate</summary>
        <form
          action={createCandidate}
          encType="multipart/form-data"
          className="mt-4 grid max-w-2xl gap-4"
        >
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <LayoutPicker />
          <ExportFormatPicker />
          <div className="space-y-1">
            <Label htmlFor="resume">Master Resume (optional)</Label>
            <Input
              id="resume"
              name="resume"
              type="file"
              accept=".txt,.doc,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            />
            <p className="text-xs text-slate-500">
              Prefer <strong>.docx</strong> or <strong>.txt</strong> so employers and experience are
              extracted for tailoring.
            </p>
          </div>
          <Button type="submit" className="w-fit">
            Create
          </Button>
        </form>
      </details>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Layout</th>
              <th className="px-4 py-3 font-medium">Export</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-slate-600">{c.email}</td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="font-medium">{getLayout(c.layoutId).name}</div>
                  <LayoutExportLinks layoutId={c.layoutId} className="mt-1" />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-700">{c.exportFormat}</span>
                    <span className="inline-flex flex-wrap gap-2">
                      <a
                        href={`/api/layouts/preview?layoutId=${encodeURIComponent(c.layoutId)}&fmt=docx`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                      >
                        DOCX
                      </a>
                      <a
                        href={`/api/layouts/preview?layoutId=${encodeURIComponent(c.layoutId)}&fmt=pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                      >
                        PDF
                      </a>
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(c.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/admin/candidates/${c.id}`} className="text-sm hover:underline">
                      View
                    </Link>
                    <form
                      action={async () => {
                        "use server";
                        await deleteCandidate(c.id);
                      }}
                    >
                      <button type="submit" className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
