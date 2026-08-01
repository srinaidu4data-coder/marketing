import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  deleteCandidate,
  updateCandidate,
} from "@/app/actions/candidates";
import { Button, Input, Label, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import {
  ExportFormatPicker,
  LayoutExportLinks,
  LayoutPicker,
} from "@/components/layout-picker";
import { getLayout } from "@/lib/resume/templates";
import { ReplaceResumeForm } from "@/components/replace-resume-form";
import { MasterValidationPanel } from "@/components/master-validation-panel";
import { parseStoredMasterProfile } from "@/lib/resume/master-profile";
import {
  validateMasterProfile,
  validatePackAgainstMaster,
} from "@/lib/resume/master-pack-validate";

export default async function CandidateDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const c = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!c) notFound();
  const profile = parseStoredMasterProfile(
    (c as { masterProfileJson?: string }).masterProfileJson
  );
  const uploadReport = validateMasterProfile(profile);

  // Latest tailored pack for this candidate (if any chain ran)
  const latestPack = await prisma.chainCandidate.findFirst({
    where: {
      candidateId: c.id,
      tailoredResumeText: { not: "" },
    },
    orderBy: { id: "desc" },
    select: { tailoredResumeText: true, jobTitle: true },
  });
  const packReport =
    latestPack?.tailoredResumeText && profile
      ? validatePackAgainstMaster({
          masterProfileJson: (c as { masterProfileJson?: string }).masterProfileJson,
          tailoredText: latestPack.tailoredResumeText,
          expectedYears: uploadReport.careerSpanYears,
        })
      : null;

  const submissions = await prisma.vendorSubmission.findMany({
    where: { candidateId: c.id },
    orderBy: { sentAt: "desc" },
    take: 20,
  });

  const preview = c.masterResumeText || "No text";
  const isPlaceholder = /Uploaded master resume:|Extracted text unavailable|extraction failed/i.test(
    preview
  );

  async function saveDetails(formData: FormData) {
    "use server";
    await updateCandidate(params.id, formData);
  }
  async function remove() {
    "use server";
    await deleteCandidate(params.id);
    redirect("/admin/candidates");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-2 lg:p-4">
      <PageHeader
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {c.email} · {formatDate(c.createdAt)} · Layout: {getLayout(c.layoutId).name} ·{" "}
              {c.exportFormat}
            </span>
            <LayoutExportLinks layoutId={c.layoutId} />
          </span>
        }
      />

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Master Resume</h2>
        {c.masterResumePath ? (
          <p className="text-xs text-slate-500">
            Stored file: <code className="rounded bg-slate-100 px-1">{c.masterResumePath}</code>
          </p>
        ) : (
          <p className="text-xs text-amber-700">No master file on disk yet — upload one below.</p>
        )}
        <Link
          href={`/api/candidates/${c.id}/download`}
          className="text-sm text-slate-700 hover:underline"
        >
          Download master
        </Link>
        {isPlaceholder ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Master text was not fully extracted last time (common with binary uploads). Use{" "}
            <strong>Replace</strong> with a <strong>.docx</strong> or <strong>.txt</strong> so
            employers and experience from the master can feed tailored packs.
          </div>
        ) : null}
        <details open={isPlaceholder}>
          <summary className="cursor-pointer text-sm hover:underline">
            Preview extracted text (first 800 chars) — {preview.length} total chars
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">
            {preview.slice(0, 800)}
          </pre>
        </details>
        <ReplaceResumeForm candidateId={c.id} />
      </section>

      <MasterValidationPanel report={uploadReport} packReport={packReport} />
      {latestPack?.jobTitle ? (
        <p className="text-[12px] text-[#86868b]">
          Pack validation uses latest chain output
          {latestPack.jobTitle ? ` (${latestPack.jobTitle})` : ""}.
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Edit Details &amp; Resume Layout</h2>
        <form action={saveDetails} className="grid gap-4">
          <div className="space-y-1">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" name="name" defaultValue={c.name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" name="email" type="email" defaultValue={c.email} required />
          </div>
          <LayoutPicker defaultValue={c.layoutId} />
          <ExportFormatPicker
            defaultValue={c.exportFormat}
            layoutIdForPreview={c.layoutId}
          />
          <Button type="submit" className="w-fit">
            Save Changes
          </Button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Vendor submission history</h2>
        <p className="text-xs text-slate-500">
          Used by the hard-block rule: different skill/title to the same vendor is blocked.
        </p>
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-500">No vendor submissions yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {submissions.map((s) => (
              <li key={s.id} className="rounded border p-2">
                <div className="font-medium">
                  {s.vendorName} ({s.vendorEmail})
                </div>
                <div className="text-xs text-slate-500">
                  {s.jobTitle} · {new Date(s.sentAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-red-200 p-4">
        <h2 className="font-medium text-red-700">Danger Zone</h2>
        <form action={remove}>
          <Button type="submit" variant="destructive">
            Delete Candidate
          </Button>
        </form>
      </section>
    </div>
  );
}
