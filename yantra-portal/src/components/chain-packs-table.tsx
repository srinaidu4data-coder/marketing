/**
 * Chain pack review — Fortune-100 style candidate cards.
 * Scan quality → preview → download → send. Shared by employee + admin.
 */

import Link from "next/link";
import {
  CheckCircle2,
  Download,
  FileText,
  FileType2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { getLayout } from "@/lib/resume/templates";
import { scorePsych } from "@/lib/resume/psych-scorer";
import {
  normalizeTailorMode,
  resolveTailorMode,
} from "@/lib/resume/tailor-mode";
import { extractJobTitle } from "@/lib/resume/jd-parse";
import type { PackShipReport } from "@/lib/resume/pack-ship-ready";
import { cn } from "@/lib/utils";
import { ResumePreviewModal } from "@/components/resume-preview-modal";
import { FitReportPanel } from "@/components/fit-report-panel";

export type ChainPackRow = {
  id: string;
  tailoredResumeText: string;
  layoutId: string;
  jobTitle: string;
  atsScore: number;
  psychScore?: number | null;
  tailorMode?: string | null;
  sendStatus: string;
  pdfPath?: string | null;
  skillFingerprint?: string | null;
  candidate: {
    name: string;
    email: string;
    layoutId?: string | null;
    masterResumeText?: string | null;
    masterProfileJson?: string | null;
  };
};

function resolvePsychScore(cc: ChainPackRow, rawJobText: string): number {
  const stored = cc.psychScore ?? 0;
  if (stored > 0) return stored;
  const text = (cc.tailoredResumeText || "").trim();
  if (text.length < 200) return 0;
  try {
    const master = cc.candidate.masterResumeText || "";
    const mode = normalizeTailorMode(
      cc.tailorMode || resolveTailorMode(rawJobText, master).mode
    );
    return scorePsych({
      resumeText: text,
      masterText: master,
      masterProfileJson: cc.candidate.masterProfileJson,
      jd: rawJobText,
      jobTitle: cc.jobTitle || extractJobTitle(rawJobText),
      mode,
      candidateName: cc.candidate.name,
    }).score;
  } catch {
    return 0;
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ScoreMeter({
  label,
  score,
  hint,
}: {
  label: string;
  score: number;
  hint?: string;
}) {
  const perfect = score >= 100;
  const good = score >= 95;
  const color = perfect
    ? "bg-emerald-500"
    : good
      ? "bg-sky-500"
      : score >= 80
        ? "bg-amber-500"
        : "bg-red-500";
  const text = perfect
    ? "text-emerald-700"
    : good
      ? "text-sky-800"
      : score >= 80
        ? "text-amber-800"
        : "text-red-700";

  return (
    <div className="min-w-[7.5rem] flex-1" title={hint || `${label} ${score}/100`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#86868b]">
          {label}
        </span>
        <span className={cn("text-[13px] font-semibold tabular-nums", text)}>
          {score}
          <span className="font-normal text-[#86868b]">/100</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

function DownloadChip({
  href,
  label,
  primary,
  title,
}: {
  href: string;
  label: string;
  primary?: boolean;
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold tracking-tight transition-all duration-200",
        primary
          ? "bg-[#0071e3] text-white shadow-soft hover:bg-[#0077ed] active:scale-[0.98]"
          : "border border-black/[0.08] bg-white text-[#1d1d1f] shadow-soft hover:border-black/[0.12] hover:bg-[#fafafa]"
      )}
    >
      <Download className="h-3.5 w-3.5 opacity-90" strokeWidth={2.25} />
      {label}
    </Link>
  );
}

export function ChainPacksTable({
  chainId,
  rawJobText,
  candidates,
  shipById,
}: {
  chainId: string;
  rawJobText: string;
  candidates: ChainPackRow[];
  shipById: Map<string, PackShipReport>;
}) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-black/[0.08] bg-white/80 px-6 py-16 text-center">
        <FileText className="mx-auto h-8 w-8 text-[#86868b]" strokeWidth={1.5} />
        <p className="mt-3 text-[15px] font-semibold text-[#1d1d1f]">
          No resume packs yet
        </p>
        <p className="mt-1 text-[13px] text-[#86868b]">
          Generate packs for this chain, then review scores and download.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-label="Candidate resume packs">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-[#1d1d1f]">
            Resume packs
          </h2>
          <p className="mt-0.5 text-[13px] text-[#86868b]">
            Review quality, download files, then send to the vendor.
          </p>
        </div>
        <p className="hidden text-[12px] font-medium tabular-nums text-[#86868b] sm:block">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </p>
      </div>

      <ul className="space-y-3">
        {candidates.map((cc, index) => {
          const ship = shipById.get(cc.id);
          const psychScore = resolvePsychScore(cc, rawJobText);
          const isBest = cc.atsScore === 100 && psychScore === 100;
          const hasText = !!(cc.tailoredResumeText || "").trim();
          const layoutName = getLayout(cc.layoutId).name;
          const role =
            cc.jobTitle || extractJobTitle(rawJobText) || "Targeted role";
          const base = `/api/chains/${chainId}/candidates/${cc.id}/download`;
          const fileLabel = `${cc.candidate.name} · ${role}`;

          return (
            <li
              key={cc.id}
              className={cn(
                "group overflow-hidden rounded-3xl border bg-white shadow-soft transition-all duration-200",
                ship?.ok
                  ? "border-black/[0.06] hover:border-black/[0.1] hover:shadow-md"
                  : "border-red-200/80 ring-1 ring-red-100"
              )}
            >
              {/* Top: identity + status */}
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                <div className="flex min-w-0 items-start gap-3.5">
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[14px] font-semibold tracking-tight",
                      isBest
                        ? "bg-emerald-500/10 text-emerald-800"
                        : "bg-[#0071e3]/[0.08] text-[#0071e3]"
                    )}
                    aria-hidden
                  >
                    {initials(cc.candidate.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[17px] font-semibold tracking-tight text-[#1d1d1f]">
                        {cc.candidate.name}
                      </h3>
                      {isBest ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
                          <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />
                          Best match
                        </span>
                      ) : null}
                      <span className="text-[11px] font-medium tabular-nums text-[#c7c7cc]">
                        #{index + 1}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13.5px] font-medium text-[#1d1d1f]/80">
                      {role}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-[#86868b]">
                      {cc.candidate.email}
                      <span className="mx-1.5 text-[#d2d2d7]">·</span>
                      {layoutName}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {ship?.ok ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/15">
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Ready to send
                      {ship.minBulletsSeen != null
                        ? ` · ${ship.minBulletsSeen}+ bullets`
                        : ""}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-red-800 ring-1 ring-inset ring-red-500/15"
                      title={ship?.issues.map((i) => i.detail).join("; ")}
                    >
                      <XCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Needs fix
                      {ship?.issues[0]
                        ? ` · ${ship.issues[0].detail.slice(0, 36)}`
                        : ""}
                    </span>
                  )}
                  <Badge status={cc.sendStatus}>
                    {cc.sendStatus === "PENDING"
                      ? "Not emailed"
                      : cc.sendStatus === "SENT"
                        ? "Emailed"
                        : cc.sendStatus}
                  </Badge>
                </div>
              </div>

              {/* Scores */}
              <div className="border-t border-black/[0.04] bg-[#fafafa]/80 px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
                  <ScoreMeter
                    label="ATS match"
                    score={cc.atsScore}
                    hint="Applicant tracking system keyword & structure score"
                  />
                  <ScoreMeter
                    label="Psych fit"
                    score={psychScore}
                    hint="Behavioral / narrative fit vs master profile"
                  />
                </div>
              </div>

              {/* Research lab: JD fit checklist + confidence (localhost) */}
              {hasText ? (
                <FitReportPanel
                  resumeText={cc.tailoredResumeText}
                  jd={rawJobText}
                  jobTitle={cc.jobTitle || role}
                  layoutId={
                    cc.layoutId || cc.candidate.layoutId || "ats_classic"
                  }
                />
              ) : null}

              {/* Actions */}
              <div className="flex flex-col gap-3 border-t border-black/[0.04] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                {hasText ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <DownloadChip
                        href={`${base}?fmt=docx`}
                        label="Word"
                        primary
                        title={`Download MS Word — ${fileLabel}`}
                      />
                      <DownloadChip
                        href={`${base}?fmt=pdf`}
                        label="PDF"
                        title={`Download PDF — ${fileLabel}`}
                      />
                      <DownloadChip
                        href={`${base}?fmt=txt`}
                        label="TXT"
                        title={`Download plain text — ${fileLabel}`}
                      />
                      <DownloadChip
                        href={`${base}?fmt=html`}
                        label="HTML"
                        title={`Download HTML — ${fileLabel}`}
                      />
                    </div>

                    <ResumePreviewModal
                      candidateName={cc.candidate.name}
                      role={role}
                      text={cc.tailoredResumeText}
                      atsScore={cc.atsScore}
                      psychScore={psychScore}
                    />
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-[13px] text-[#86868b]">
                    <FileType2 className="h-4 w-4" />
                    No pack generated for this candidate yet.
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
