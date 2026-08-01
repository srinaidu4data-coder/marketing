import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { getLayout } from "@/lib/resume/templates";
import { parseStoredMasterProfile } from "@/lib/resume/master-profile";
import { validateMasterProfile } from "@/lib/resume/master-pack-validate";
import { assessCandidateReady } from "@/lib/candidate-ready";
import {
  CandidatesRoster,
  type CandidateRosterItem,
} from "@/components/candidates-roster";

export default async function AdminCandidatesPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireAdmin();
  const candidates = await prisma.candidate.findMany({
    orderBy: { createdAt: "desc" },
  });

  const items: CandidateRosterItem[] = candidates.map((c) => {
    const profile = parseStoredMasterProfile(c.masterProfileJson);
    const report = validateMasterProfile(profile);
    const ready = assessCandidateReady(c);
    const placeholder =
      /Uploaded master resume:|Extracted text unavailable|extraction failed/i.test(
        c.masterResumeText || ""
      );
    const hasMaster =
      (c.masterResumeText || "").trim().length >= 80 && !placeholder;

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      layoutId: c.layoutId,
      layoutName: getLayout(c.layoutId).name,
      exportFormat: c.exportFormat,
      createdAt: c.createdAt.toISOString(),
      engagementCount: report.engagementCount,
      profileScore: report.score,
      failCount: report.summary.fail,
      warnCount: report.summary.warn,
      ready: ready.ok,
      readyReason: ready.reason,
      hasMaster,
    };
  });

  const readyCount = items.filter((i) => i.ready).length;
  const listError = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : null;

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Candidates"
        description={
          items.length === 0
            ? "Create a person, upload their master resume, then start a chain."
            : `${items.length} on roster · ${readyCount} ready for chains`
        }
      />

      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#86868b]">
        <li className="font-semibold text-[#1d1d1f]">1 Create</li>
        <li aria-hidden className="text-[#d2d2d7]">
          →
        </li>
        <li>2 Master</li>
        <li aria-hidden className="text-[#d2d2d7]">
          →
        </li>
        <li>3 Chain</li>
        <li className="text-[#a1a1a6]">(allocate only if employees market them)</li>
      </ol>

      <CandidatesRoster items={items} listError={listError} />
    </div>
  );
}
