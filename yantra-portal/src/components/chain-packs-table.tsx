/**
 * Shared chain packs table — ATS + Psych + Best + Preview + downloads.
 * Used by employee and admin chain detail pages so columns never drift.
 */

import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { Badge } from "@/components/ui";
import { getLayout } from "@/lib/resume/templates";
import { scorePsych } from "@/lib/resume/psych-scorer";
import {
  normalizeTailorMode,
  resolveTailorMode,
} from "@/lib/resume/tailor-mode";
import { extractJobTitle } from "@/lib/resume/jd-parse";
import type { PackShipReport } from "@/lib/resume/pack-ship-ready";

export type ChainPackRow = {
  id: string;
  tailoredResumeText: string;
  layoutId: string;
  jobTitle: string;
  atsScore: number;
  psychScore?: number | null;
  tailorMode?: string | null;
  sendStatus: string;
  /** retained for callers; PDF is always offered via on-demand render */
  pdfPath?: string | null;
  skillFingerprint?: string | null;
  candidate: {
    name: string;
    email: string;
    masterResumeText?: string | null;
    masterProfileJson?: string | null;
  };
};

function resolvePsychScore(
  cc: ChainPackRow,
  rawJobText: string
): number {
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

function ScoreCell({ score, label }: { score: number; label: string }) {
  const perfect = score === 100;
  return (
    <td className="px-3 py-3 sm:px-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:hidden">
        {label}
      </div>
      <span
        className={
          perfect
            ? "text-base font-semibold tabular-nums text-emerald-700"
            : "text-base font-semibold tabular-nums text-amber-700"
        }
        title={`${label} score (100 = perfect)`}
      >
        {score}
      </span>
      <span className="text-xs text-zinc-400"> / 100</span>
    </td>
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
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50/90">
          <tr>
            <th className="px-4 py-3 text-xs font-medium text-zinc-500">
              Candidate
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-500">
              Layout
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-500">
              ATS
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-500">
              Psych
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-500">
              Best
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-500">
              Ship-ready
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-500">
              Email
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-500">
              Files
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-8 text-center text-sm text-zinc-400"
              >
                No resume packs yet
              </td>
            </tr>
          ) : (
            candidates.map((cc) => {
              const ship = shipById.get(cc.id);
              const psychScore = resolvePsychScore(cc, rawJobText);
              const isBest = cc.atsScore === 100 && psychScore === 100;
              const hasText = !!(cc.tailoredResumeText || "").trim();

              return (
                <tr
                  key={cc.id}
                  className="border-b border-zinc-50 last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">
                      {cc.candidate.name}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {cc.candidate.email}
                    </div>
                    {cc.jobTitle ? (
                      <div className="text-[11px] text-zinc-400">
                        {cc.jobTitle}
                      </div>
                    ) : null}
                    {/* Mobile-friendly score strip under name */}
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] sm:hidden">
                      <span
                        className={
                          cc.atsScore === 100
                            ? "font-semibold text-emerald-700"
                            : "font-semibold text-amber-700"
                        }
                      >
                        ATS {cc.atsScore}/100
                      </span>
                      <span
                        className={
                          psychScore === 100
                            ? "font-semibold text-emerald-700"
                            : "font-semibold text-amber-700"
                        }
                      >
                        Psych {psychScore}/100
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    {getLayout(cc.layoutId).name}
                  </td>
                  <ScoreCell score={cc.atsScore} label="ATS" />
                  <ScoreCell score={psychScore} label="Psych" />
                  <td className="px-4 py-3 text-xs">
                    {isBest ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                        BEST
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ship?.ok ? (
                      <span className="font-semibold text-emerald-700">
                        OK
                        {ship.minBulletsSeen != null
                          ? ` · ≥${ship.minBulletsSeen} bullets`
                          : ""}
                      </span>
                    ) : (
                      <span
                        className="font-semibold text-red-700"
                        title={ship?.issues.map((i) => i.detail).join("; ")}
                      >
                        Blocked
                        {ship?.issues[0]
                          ? ` · ${ship.issues[0].detail.slice(0, 40)}`
                          : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={cc.sendStatus}>{cc.sendStatus}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {hasText ? (
                        <details className="group relative">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full border border-[#0071e3]/25 bg-[#0071e3]/[0.06] px-2.5 py-1 font-semibold text-[#0071e3] hover:bg-[#0071e3]/[0.12] [&::-webkit-details-marker]:hidden">
                            <Eye className="h-3.5 w-3.5" strokeWidth={2.25} />
                            Preview
                          </summary>
                          <div className="absolute right-0 z-40 mt-2 flex max-h-[min(75vh,40rem)] w-[min(44rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-black/[0.1] bg-white shadow-float">
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] bg-[#fafafa] px-3 py-2">
                              <span className="text-[12px] font-semibold text-[#1d1d1f]">
                                Full resume — {cc.candidate.name}
                                {cc.jobTitle ? ` · ${cc.jobTitle}` : ""}
                              </span>
                              <span className="text-[11px] text-[#86868b]">
                                {cc.tailoredResumeText.length.toLocaleString()}{" "}
                                chars · ATS {cc.atsScore} · Psych {psychScore}
                              </span>
                            </div>
                            <pre className="min-h-0 flex-1 overflow-auto p-4 text-[12px] leading-relaxed text-[#1d1d1f] whitespace-pre-wrap">
                              {cc.tailoredResumeText}
                            </pre>
                          </div>
                        </details>
                      ) : (
                        <span className="text-zinc-400">No pack</span>
                      )}
                      {hasText ? (
                        <>
                          <Link
                            href={`/api/chains/${chainId}/candidates/${cc.id}/download?fmt=docx`}
                            className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                            title={`MS Word — ${cc.candidate.name}${cc.jobTitle ? ` · ${cc.jobTitle}` : ""}`}
                          >
                            <Download className="h-3 w-3" /> Word
                          </Link>
                          <Link
                            href={`/api/chains/${chainId}/candidates/${cc.id}/download?fmt=pdf`}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/80 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-100"
                            title={`PDF — ${cc.candidate.name}${cc.jobTitle ? ` · ${cc.jobTitle}` : ""}`}
                          >
                            <Download className="h-3 w-3" /> PDF
                          </Link>
                          <Link
                            href={`/api/chains/${chainId}/candidates/${cc.id}/download?fmt=txt`}
                            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-100"
                            title={`Plain text — ${cc.candidate.name}${cc.jobTitle ? ` · ${cc.jobTitle}` : ""}`}
                          >
                            <Download className="h-3 w-3" /> TXT
                          </Link>
                          <Link
                            href={`/api/chains/${chainId}/candidates/${cc.id}/download?fmt=html`}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100"
                            title={`HTML — ${cc.candidate.name}${cc.jobTitle ? ` · ${cc.jobTitle}` : ""}`}
                          >
                            <Download className="h-3 w-3" /> HTML
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
