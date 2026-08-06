/**
 * Long-running regenerate job. Called by the live panel after the page shows
 * GENERATING — keeps progress ticks visible while packs rebuild.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { retryGenerateChain } from "@/lib/chain-pipeline";
import { parseProgressJson } from "@/lib/resume/generation-progress";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: { chainId: string } }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chainId = ctx.params.chainId;
  const chain = await prisma.chain.findUnique({
    where: { id: chainId },
    select: {
      id: true,
      status: true,
      employeeId: true,
      progressJson: true,
      updatedAt: true,
    },
  });
  if (!chain) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = session.user as { id: string; role?: string };
  if (user.role === "EMPLOYEE" && chain.employeeId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { forceAll?: boolean; candidateId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const progress = parseProgressJson(chain.progressJson);
  // Idempotent: if already mid-run (recent non-finished, not just queued), skip re-entry
  const ageMs = Date.now() - new Date(chain.updatedAt).getTime();
  const phase = progress?.phase || "";
  const midRun =
    chain.status === "GENERATING" &&
    progress &&
    !progress.finished &&
    phase !== "queued" &&
    phase !== "starting" &&
    ageMs < 4 * 60 * 1000;

  if (midRun) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "already_running",
      status: chain.status,
    });
  }

  // Claim job
  await prisma.chain.update({
    where: { id: chainId },
    data: {
      status: "GENERATING",
      progressJson: JSON.stringify({
        ...(progress || {}),
        phase: "starting",
        headline: "Starting regeneration…",
        detail: "Claimed by live worker — loading master + JD…",
        finished: false,
        chainStatus: "GENERATING",
        updatedAt: new Date().toISOString(),
        pct: Math.max(progress?.pct || 0, 5),
      }),
    },
  });

  const forceAll = body.forceAll !== false;
  const one = (body.candidateId || "").trim();

  try {
    const result = await retryGenerateChain(
      chainId,
      user.id,
      one ? [one] : undefined,
      { forceAll: forceAll && !one }
    );
    return NextResponse.json({
      ok: true,
      status: result.status,
      succeeded: result.succeeded,
      failed: result.failed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await prisma.chain.update({
        where: { id: chainId },
        data: {
          status: "FAILED",
          progressJson: JSON.stringify({
            phase: "error",
            headline: "Regeneration failed",
            detail: message.slice(0, 240),
            finished: true,
            chainStatus: "FAILED",
            updatedAt: new Date().toISOString(),
            steps: progress?.steps || [],
            doneCount: 0,
            totalCount: 0,
            pct: 100,
            tip: "",
            tipIndex: 0,
          }),
        },
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { ok: false, error: message.slice(0, 400) },
      { status: 500 }
    );
  }
}
