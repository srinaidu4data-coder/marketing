import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  recoverStuckChainAction,
  retryGenerateChainAction,
  sendChain,
} from "@/app/actions/chains";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getLayout } from "@/lib/resume/templates";

export default async function ChainDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { failed?: string };
}) {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect(`/admin/chains/${params.id}`);

  const chain = await prisma.chain.findUnique({
    where: { id: params.id },
    include: {
      candidates: { include: { candidate: true } },
      employee: true,
    },
  });
  if (!chain || chain.employeeId !== user.id) notFound();

  const genErrors = await prisma.auditLog.findMany({
    where: {
      OR: [
        { action: "chain.candidate_failed", meta: { contains: chain.id } },
        { action: "chain.status_changed", meta: { contains: chain.id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  const errorHints: string[] = [];
  for (const row of genErrors) {
    try {
      const meta = JSON.parse(row.meta || "{}") as {
        chainId?: string;
        message?: string;
        fatal?: string;
        errors?: { name?: string; message?: string }[];
        reason?: string;
        timedOut?: boolean;
      };
      if (meta.chainId && meta.chainId !== chain.id) continue;
      if (meta.fatal) errorHints.push(meta.fatal);
      if (meta.message) errorHints.push(meta.message);
      if (meta.reason) errorHints.push(String(meta.reason));
      if (meta.timedOut) errorHints.push("Generation hit serverless time budget");
      if (meta.errors?.length) {
        for (const e of meta.errors.slice(0, 4)) {
          errorHints.push(`${e.name || "candidate"}: ${e.message || "failed"}`);
        }
      }
    } catch {
      /* ignore */
    }
  }
  const uniqueHints = Array.from(new Set(errorHints)).slice(0, 6);

  const sent = chain.candidates.filter((c) => c.sendStatus === "SENT").length;
  const total = chain.candidates.length;
  const lowAts = chain.candidates.filter((c) => c.atsScore < 95);
  const stuck = chain.status === "GENERATING" || chain.status === "SENDING";
  const emptyFailed = chain.status === "FAILED" && total === 0;

  async function sendAction() {
    "use server";
    const result = await sendChain(params.id);
    if (result && "error" in result && result.error === "VENDOR_SKILL_CONFLICT") {
      const payload = Buffer.from(JSON.stringify(result.conflicts || []), "utf8").toString(
        "base64url"
      );
      redirect(`/chains/new?blocked=1&conflicts=${payload}`);
    }
  }

  async function recoverAction() {
    "use server";
    await recoverStuckChainAction(params.id);
  }

  async function retryAction() {
    "use server";
    await retryGenerateChainAction(params.id);
  }

  return (
    <div className="space-y-6 p-2 lg:p-4">
      <PageHeader
        title={
          <>
            Chain <span className="text-slate-400">{chain.id.slice(0, 8)}</span>
          </>
        }
        description={`${formatDateTime(chain.createdAt)} · ${sent} of ${total} sent`}
        actions={
          <>
            <Badge status={chain.status}>
              {chain.status.charAt(0) + chain.status.slice(1).toLowerCase()}
            </Badge>
            {stuck ? (
              <form action={recoverAction}>
                <Button type="submit" variant="destructive">
                  Recover stuck chain
                </Button>
              </form>
            ) : null}
            {emptyFailed || (chain.status === "FAILED" && total === 0) || chain.status === "FAILED" ? (
              <form action={retryAction}>
                <Button type="submit" variant="outline">
                  Retry generation
                </Button>
              </form>
            ) : null}
            {chain.status === "READY" || (chain.status === "FAILED" && total > 0) ? (
              <form action={sendAction}>
                <Button type="submit" disabled={total === 0}>
                  Send all
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      {searchParams?.failed === "1" || chain.status === "FAILED" ? (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>
            {emptyFailed
              ? "Generation produced no resumes (timeout, empty selection, or server error)."
              : "This chain did not finish cleanly (failed or recovered from a stuck state)."}{" "}
            You can{" "}
            <Link href="/chains/new" className="underline">
              create a new chain
            </Link>
            {total > 0 ? " or send packs that did generate." : " or retry generation below."}
          </p>
          {uniqueHints.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-red-900">
              {uniqueHints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs">
              Tip: On production, start with 1–2 candidates. Dense packs can hit serverless time
              limits.
            </p>
          )}
        </div>
      ) : null}

      {stuck ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This chain is still in <strong>{chain.status}</strong>. If generation/send appears
          frozen, click <strong>Recover stuck chain</strong> (moves to READY if any resumes
          already exist, otherwise FAILED). New chains are never blocked by this state.
        </div>
      ) : null}

      {total === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          No resume packs on this chain yet. Use <strong>Retry generation</strong> or create a
          new chain with fewer candidates.
        </div>
      ) : lowAts.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {lowAts.length} resume(s) scored below internal ATS 95. Review before send. Progressive
          tailor already reinforced keywords; consider refining the JD or master resume.
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          All resumes meet internal ATS target (≥ 95).
        </div>
      )}

      <Card className="space-y-2 text-sm">
        <div>
          <span className="text-slate-500">Vendor: </span>
          <span className="font-medium">{chain.vendorName}</span> ({chain.vendorEmail})
        </div>
        <div>
          <span className="text-slate-500">Job requirement</span>
          <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">
            {chain.rawJobText}
          </pre>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium">Candidate</th>
              <th className="px-4 py-3 font-medium">Layout</th>
              <th className="px-4 py-3 font-medium">ATS</th>
              <th className="px-4 py-3 font-medium">Send Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {chain.candidates.map((cc) => (
              <tr key={cc.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{cc.candidate.name}</div>
                  <div className="text-xs text-slate-500">{cc.candidate.email}</div>
                  {cc.jobTitle ? (
                    <div className="text-[11px] text-slate-400">{cc.jobTitle}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs">{getLayout(cc.layoutId).name}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      cc.atsScore >= 95
                        ? "font-semibold text-emerald-700"
                        : "font-semibold text-amber-700"
                    }
                  >
                    {cc.atsScore}
                  </span>
                  <span className="text-xs text-slate-400"> / 100</span>
                </td>
                <td className="px-4 py-3">
                  <Badge status={cc.sendStatus}>{cc.sendStatus}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <details className="text-sm">
                      <summary className="cursor-pointer text-slate-700 hover:underline">
                        Preview
                      </summary>
                      <pre className="mt-2 max-h-64 max-w-xl overflow-auto rounded border bg-slate-50 p-3 text-xs">
                        {cc.tailoredResumeText.slice(0, 4000)}
                      </pre>
                    </details>
                    <Link
                      href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=txt`}
                      className="text-sm text-slate-700 hover:underline"
                    >
                      TXT
                    </Link>
                    {cc.docxPath ? (
                      <Link
                        href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=docx`}
                        className="text-sm text-slate-700 hover:underline"
                      >
                        DOCX
                      </Link>
                    ) : null}
                    {cc.pdfPath ? (
                      <Link
                        href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=pdf`}
                        className="text-sm text-slate-700 hover:underline"
                      >
                        PDF
                      </Link>
                    ) : null}
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
