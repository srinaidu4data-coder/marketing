import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  ENGAGEMENT_TIPS,
  parseProgressJson,
  engagementTip,
} from "@/lib/resume/generation-progress";

/**
 * Poll live generation status for a chain (employee or admin).
 */
export async function GET(
  _req: Request,
  ctx: { params: { chainId: string } }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chain = await prisma.chain.findUnique({
    where: { id: ctx.params.chainId },
    select: {
      id: true,
      status: true,
      employeeId: true,
      progressJson: true,
      updatedAt: true,
      candidates: {
        select: {
          candidate: { select: { name: true } },
          tailoredResumeText: true,
        },
      },
    },
  });

  if (!chain) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = session.user as { id: string; role?: string };
  if (user.role === "EMPLOYEE" && chain.employeeId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const progress = parseProgressJson(chain.progressJson);
  const packsReady = chain.candidates.filter(
    (c) => (c.tailoredResumeText || "").trim().length > 200
  ).length;

  // Client-side tip rotation seed even if server hasn't written progress yet
  const tipSeed = Math.floor(Date.now() / 4000) % ENGAGEMENT_TIPS.length;

  return NextResponse.json({
    chainId: chain.id,
    status: chain.status,
    updatedAt: chain.updatedAt.toISOString(),
    packsReady,
    candidateCount: chain.candidates.length,
    progress: progress || {
      updatedAt: chain.updatedAt.toISOString(),
      phase: chain.status === "GENERATING" ? "waiting" : chain.status,
      headline:
        chain.status === "GENERATING"
          ? "Generation in progress…"
          : chain.status === "SENDING"
            ? "Sending emails…"
            : `Status: ${chain.status}`,
      detail:
        chain.status === "GENERATING"
          ? "Waiting for the next progress tick from the engine…"
          : "",
      tip: engagementTip(tipSeed),
      tipIndex: tipSeed,
      steps: [],
      doneCount: 0,
      totalCount: 0,
      pct: chain.status === "GENERATING" ? 8 : 100,
      finished: !["GENERATING", "SENDING"].includes(chain.status),
      chainStatus: chain.status,
    },
    tips: ENGAGEMENT_TIPS,
  });
}
