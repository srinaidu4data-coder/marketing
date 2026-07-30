import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  recoverStuckChainAction,
  retryGenerateChainAction,
  sendChain,
} from "@/app/actions/chains";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getLayout } from "@/lib/resume/templates";

export default async function AdminChainDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { failed?: string };
}) {
  await requireAdmin();
  const chain = await prisma.chain.findUnique({
    where: { id: params.id },
    include: {
      candidates: { include: { candidate: true } },
      employee: true,
    },
  });
  if (!chain) notFound();

  const sent = chain.candidates.filter((c) => c.sendStatus === "SENT").length;
  const stuck = chain.status === "GENERATING" || chain.status === "SENDING";
  const emptyFailed = chain.status === "FAILED" && chain.candidates.length === 0;

  async function sendAction() {
    "use server";
    await sendChain(params.id);
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
        description={`${chain.employee.name} · ${formatDateTime(chain.createdAt)} · ${sent} of ${chain.candidates.length} sent`}
        actions={
          <>
            <Badge status={chain.status}>
              {chain.status.charAt(0) + chain.status.slice(1).toLowerCase()}
            </Badge>
            {stuck ? (
              <form action={recoverAction}>
                <Button type="submit" variant="destructive">
                  Recover stuck
                </Button>
              </form>
            ) : null}
            {chain.status === "FAILED" || emptyFailed ? (
              <form action={retryAction}>
                <Button type="submit" variant="outline">
                  Retry generation
                </Button>
              </form>
            ) : null}
            {chain.status === "READY" || (chain.status === "FAILED" && chain.candidates.length > 0) ? (
              <form action={sendAction}>
                <Button type="submit" disabled={chain.candidates.length === 0}>
                  Send all
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      {searchParams?.failed === "1" || chain.status === "FAILED" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {emptyFailed
            ? "Generation produced 0 packs (timeout or error). Use Retry generation — prefer 1–2 candidates on serverless."
            : "Chain failed or was recovered from a stuck state. New chains can still be created."}
        </div>
      ) : null}

      {stuck ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          In-flight status <strong>{chain.status}</strong>. If abandoned, recover to free the
          queue; live jobs heartbeated recently will not auto-fail for ~3 minutes.
        </div>
      ) : null}

      <Card className="space-y-2 text-sm">
        <div>
          <span className="text-slate-500">Employee: </span>
          {chain.employee.name} ({chain.employee.email})
        </div>
        <div>
          <span className="text-slate-500">Vendor: </span>
          {chain.vendorName} ({chain.vendorEmail})
        </div>
        <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{chain.rawJobText}</pre>
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
                </td>
                <td className="px-4 py-3 text-xs">{getLayout(cc.layoutId).name}</td>
                <td className="px-4 py-3 font-semibold">
                  <span className={cc.atsScore >= 95 ? "text-emerald-700" : "text-amber-700"}>
                    {cc.atsScore}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge status={cc.sendStatus}>{cc.sendStatus}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-3">
                    <details>
                      <summary className="cursor-pointer hover:underline">Preview</summary>
                      <pre className="mt-2 max-h-64 max-w-xl overflow-auto rounded border bg-slate-50 p-3 text-xs">
                        {cc.tailoredResumeText.slice(0, 4000)}
                      </pre>
                    </details>
                    <Link
                      href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=txt`}
                      className="hover:underline"
                    >
                      TXT
                    </Link>
                    {cc.docxPath ? (
                      <Link
                        href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=docx`}
                        className="hover:underline"
                      >
                        DOCX
                      </Link>
                    ) : null}
                    {cc.pdfPath ? (
                      <Link
                        href={`/api/chains/${chain.id}/candidates/${cc.id}/download?fmt=pdf`}
                        className="hover:underline"
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
