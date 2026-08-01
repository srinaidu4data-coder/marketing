import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileWarning,
  LayoutTemplate,
  Link2,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  deleteCandidate,
  updateCandidate,
} from "@/app/actions/candidates";
import { Button, Card, Input, Label } from "@/components/ui";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
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
import { assessCandidateReady } from "@/lib/candidate-ready";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { new?: string; saved?: string };
}) {
  await requireAdmin();
  const c = await prisma.candidate.findUnique({
    where: { id: params.id },
    include: {
      allocations: {
        include: { employee: { select: { id: true, name: true } } },
      },
    },
  });
  if (!c) notFound();
  const profile = parseStoredMasterProfile(c.masterProfileJson);
  const uploadReport = validateMasterProfile(profile);
  const ready = assessCandidateReady(c);
  const justCreated = searchParams?.new === "1";
  const justSaved = searchParams?.saved === "1";
  const allocationCount = c.allocations.length;

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
          masterProfileJson: c.masterProfileJson,
          masterText: c.masterResumeText || "",
          tailoredText: latestPack.tailoredResumeText,
          expectedYears: uploadReport.careerSpanYears,
        })
      : null;

  const submissions = await prisma.vendorSubmission.findMany({
    where: { candidateId: c.id },
    orderBy: { sentAt: "desc" },
    take: 20,
  });

  const preview = c.masterResumeText || "";
  const isPlaceholder =
    !preview ||
    /Uploaded master resume:|Extracted text unavailable|extraction failed/i.test(
      preview
    );
  const layout = getLayout(c.layoutId);
  const chars = preview.length;

  async function saveDetails(formData: FormData) {
    "use server";
    await updateCandidate(params.id, formData);
    redirect(`/admin/candidates/${params.id}?saved=1`);
  }
  async function remove() {
    "use server";
    await deleteCandidate(params.id);
    redirect("/admin/candidates");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-12">
      {/* Back + identity as one tight block (no large empty band) */}
      <div className="space-y-3">
        <Link
          href="/admin/candidates"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0071e3] transition-colors hover:text-[#0077ed]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
          Candidates
        </Link>

        {justCreated ? (
          <div className="rounded-xl border border-[#0071e3]/20 bg-[#0071e3]/[0.06] px-3.5 py-2.5 text-[13px] text-[#1d1d1f]">
            <span className="font-semibold">Candidate created.</span>{" "}
            {ready.ok
              ? "Master looks good — allocate to a marketer, then start a chain."
              : "Next: upload a master resume so packs can generate."}
          </div>
        ) : null}
        {justSaved ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/80 px-3.5 py-2.5 text-[13px] text-emerald-950">
            <span className="font-semibold">Saved.</span> Profile and layout updated.
          </div>
        ) : null}

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5ac8fa]/25 to-[#0071e3]/15 text-[15px] font-semibold tracking-tight text-[#0071e3] shadow-soft sm:h-14 sm:w-14 sm:text-[16px]"
              aria-hidden
            >
              {initials(c.name)}
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.022em] text-[#1d1d1f] sm:text-[28px]">
                {c.name}
              </h1>
              <p className="text-[14px] text-[#6e6e73]">{c.email}</p>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {ready.ok ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/[0.1] px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/15">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Ready for chains
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.1] px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Not ready
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-[#6e6e73] ring-1 ring-inset ring-black/[0.06]">
                  <LayoutTemplate className="h-3 w-3" />
                  {layout.name}
                </span>
                <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-[#6e6e73] ring-1 ring-inset ring-black/[0.06]">
                  {c.exportFormat}
                </span>
                <span className="text-[12px] text-[#a1a1a6]">
                  Joined {formatDate(c.createdAt)}
                </span>
              </div>
              <div className="pt-0.5">
                <LayoutExportLinks layoutId={c.layoutId} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:pt-0.5">
            <a
              href={`/api/candidates/${c.id}/download`}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-[12.5px] font-medium tracking-tight text-[#1d1d1f] shadow-soft transition-all duration-200 ease-apple hover:border-black/[0.12] hover:bg-[#fafafa]"
            >
              <Download className="h-3.5 w-3.5" />
              Download master
            </a>
          </div>
        </header>
      </div>

      {/* Status hero */}
      <section
        className={cn(
          "overflow-hidden rounded-2xl border px-4 py-4 shadow-soft sm:px-5",
          ready.ok
            ? "border-emerald-500/15 bg-gradient-to-br from-emerald-50/80 to-white"
            : "border-amber-500/20 bg-gradient-to-br from-amber-50/70 to-white"
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
          Chain readiness
        </p>
        <h2 className="mt-0.5 text-[17px] font-semibold tracking-tight text-[#1d1d1f] sm:text-[18px]">
          {ready.ok
            ? "Master is ready to market"
            : ready.reason || "Master needs attention"}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
          <div className="rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-black/[0.04]">
            <div className="text-[10px] font-medium text-[#86868b] sm:text-[11px]">
              Engagements
            </div>
            <div className="mt-0.5 text-[1.15rem] font-semibold tabular-nums tracking-tight text-[#1d1d1f]">
              {uploadReport.engagementCount}
            </div>
          </div>
          <div className="rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-black/[0.04]">
            <div className="text-[10px] font-medium text-[#86868b] sm:text-[11px]">
              Profile
            </div>
            <div className="mt-0.5 text-[1.15rem] font-semibold tabular-nums tracking-tight text-[#1d1d1f]">
              {uploadReport.score}%
            </div>
          </div>
          <div className="rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-black/[0.04]">
            <div className="text-[10px] font-medium text-[#86868b] sm:text-[11px]">
              Text
            </div>
            <div className="mt-0.5 text-[1.15rem] font-semibold tabular-nums tracking-tight text-[#1d1d1f]">
              {chars > 999 ? `${(chars / 1000).toFixed(1)}k` : chars}
            </div>
          </div>
        </div>
        {!ready.ok ? (
          <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-amber-950/80">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            Upload or replace a clean <strong className="font-semibold">.docx</strong> or{" "}
            <strong className="font-semibold">.txt</strong> master below so employers and
            dates become ground truth for tailored packs.
          </p>
        ) : null}
      </section>

      {/*
        Next step for ADMIN path:
        - Admins can chain any ready candidate without allocation.
        - Allocation is optional (for employee marketers).
      */}
      <section className="rounded-2xl border border-black/[0.06] bg-white px-4 py-3.5 shadow-soft sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#86868b]">
          Next step
        </p>
        {!ready.ok ? (
          <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
                Upload a master resume
              </p>
              <p className="mt-0.5 text-[13px] text-[#6e6e73]">
                Required before packs can generate. Use .docx or .txt.
              </p>
            </div>
            <a
              href="#master"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#0071e3] px-4 text-[13px] font-semibold text-white shadow-soft hover:bg-[#0077ed]"
            >
              Go to upload
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
                Start a marketing chain
              </p>
              <p className="mt-0.5 text-[13px] text-[#6e6e73]">
                Master is ready
                {allocationCount > 0
                  ? ` · also in pool for ${c.allocations.map((a) => a.employee.name).join(", ")}`
                  : " · as admin you can chain without allocating"}
                . Paste a JD and generate packs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/chains/new"
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#0071e3] px-4 text-[13px] font-semibold text-white shadow-soft hover:bg-[#0077ed]"
              >
                <Link2 className="h-3.5 w-3.5" />
                New chain
              </Link>
              <Link
                href="/admin/allocations"
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-[#1d1d1f] shadow-soft hover:bg-[#fafafa]"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Allocate
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Master resume — highlighted when this is the required next step */}
      <Card
        id="master"
        className={cn(
          "!p-0 scroll-mt-20 overflow-hidden !rounded-2xl",
          !ready.ok && "ring-2 ring-[#0071e3]/25"
        )}
      >
        <div className="border-b border-black/[0.05] px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
            Master resume
            {!ready.ok ? (
              <span className="ml-2 text-[12px] font-semibold text-[#0071e3]">
                Required next
              </span>
            ) : null}
          </h2>
          <p className="mt-0.5 text-[13px] text-[#6e6e73]">
            Source of truth for employers, dates, and bullets.
          </p>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {c.masterResumePath ? (
            <p className="text-[12.5px] text-[#86868b]">
              File{" "}
              <code className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[12px] text-[#6e6e73]">
                {c.masterResumePath.split(/[/\\]/).pop()}
              </code>
            </p>
          ) : (
            <p className="text-[13px] font-medium text-amber-800">
              No master file stored yet — use Replace master below.
            </p>
          )}

          {isPlaceholder ? (
            <div className="flex gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-[13.5px] leading-relaxed text-amber-950">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Text was not fully extracted (common with some binary uploads). Replace
                with a <strong>.docx</strong> or <strong>.txt</strong> so the engine can
                parse experience.
              </div>
            </div>
          ) : null}

          {/* Upload first when master is missing — main action above the fold */}
          <ReplaceResumeForm candidateId={c.id} />

          {preview && !isPlaceholder ? (
            <details className="group rounded-2xl border border-black/[0.06] bg-[#fafafa]/80 open:bg-white">
              <summary className="cursor-pointer list-none px-4 py-3 text-[13.5px] font-medium text-[#1d1d1f] marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  <span>Extracted text preview</span>
                  <span className="text-[12px] font-normal text-[#86868b]">
                    {chars.toLocaleString()} characters
                  </span>
                </span>
              </summary>
              <pre className="max-h-64 overflow-auto border-t border-black/[0.04] px-4 py-3 text-[12px] leading-relaxed text-[#424245] whitespace-pre-wrap">
                {preview.slice(0, 1200)}
                {preview.length > 1200 ? "\n\n…" : ""}
              </pre>
            </details>
          ) : null}
        </div>
      </Card>

      <MasterValidationPanel report={uploadReport} packReport={packReport} />
      {latestPack?.jobTitle ? (
        <p className="-mt-2 text-[12.5px] text-[#86868b]">
          Pack checks use latest chain output · {latestPack.jobTitle}.
        </p>
      ) : null}

      {/* Profile & layout */}
      <Card className="!p-0 overflow-hidden !rounded-2xl">
        <div className="border-b border-black/[0.05] px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
            Profile & layout
          </h2>
          <p className="mt-0.5 text-[13px] text-[#6e6e73]">
            How this person appears on every tailored pack.
          </p>
          <div className="mt-1.5">
            <LayoutExportLinks layoutId={c.layoutId} />
          </div>
        </div>
        <form action={saveDetails} className="grid gap-4 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" defaultValue={c.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={c.email}
                required
              />
            </div>
          </div>
          <LayoutPicker defaultValue={c.layoutId} />
          <ExportFormatPicker
            defaultValue={c.exportFormat}
            layoutIdForPreview={c.layoutId}
          />
          <Button type="submit" variant="soft" className="w-fit">
            Save changes
          </Button>
        </form>
      </Card>

      {/* Vendor history */}
      <Card className="!p-0 overflow-hidden !rounded-2xl">
        <div className="border-b border-black/[0.05] px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
            Vendor submissions
          </h2>
          <p className="mt-0.5 text-[13px] text-[#6e6e73]">
            Hard-block ledger — same person, same vendor, different skill story is
            blocked.
          </p>
        </div>
        <div className="px-4 py-3 sm:px-5">
          {submissions.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[#86868b]">
              No vendor submissions yet.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {submissions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold tracking-tight text-[#1d1d1f]">
                      {s.vendorName}
                    </div>
                    <div className="truncate text-[12.5px] text-[#86868b]">
                      {s.vendorEmail}
                    </div>
                  </div>
                  <div className="text-[12.5px] text-[#6e6e73] sm:text-right">
                    <div className="font-medium text-[#1d1d1f]">{s.jobTitle}</div>
                    <div>{formatDateTime(s.sentAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Danger — quiet, last */}
      <section className="rounded-2xl border border-red-200/60 bg-red-50/30 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-[#ff3b30]">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold tracking-tight text-[#1d1d1f]">
              Remove from roster
            </h2>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#6e6e73]">
              Deletes this candidate and master data. Cannot be undone.
            </p>
            <form action={remove} className="mt-3">
              <Button type="submit" variant="destructive" size="sm">
                Delete candidate
              </Button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
