import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkVendorConflicts } from "@/lib/resume/vendor-guard";
import { createAndGenerateChain, recoverStaleChains } from "@/lib/chain-pipeline";
import type { ProgressEvent } from "@/lib/resume/generation-progress";

// AI OpenAI generation needs headroom. Pro: up to 300s. Hobby may still hard-cap lower.
export const maxDuration = 300;

const schema = z.object({
  rawJobText: z.string().min(1),
  vendorName: z.string().min(1),
  vendorEmail: z.string().email(),
  candidateIds: z.array(z.string()).min(1).optional(),
  employeeNote: z.string().optional(),
  /** When true, respond with NDJSON progress stream */
  stream: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await recoverStaleChains();
  } catch (e) {
    console.error("stale recover on create failed", e);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid input", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid input",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const user = session.user;
  const { rawJobText, vendorName, vendorEmail, employeeNote, stream } =
    parsed.data;
  let candidateIds = parsed.data.candidateIds || [];

  if (user.role === "EMPLOYEE") {
    if (candidateIds.length === 0) {
      const pool = await prisma.allocation.findMany({
        where: { employeeId: user.id },
      });
      candidateIds = pool.map((p) => p.candidateId);
    } else {
      const pool = await prisma.allocation.findMany({
        where: { employeeId: user.id, candidateId: { in: candidateIds } },
      });
      candidateIds = pool.map((p) => p.candidateId);
    }
  }

  if (candidateIds.length === 0) {
    return NextResponse.json(
      { error: "No candidates allocated" },
      { status: 400 }
    );
  }

  const conflicts = await checkVendorConflicts({
    candidateIds,
    vendorEmail,
    vendorName,
    rawJobText,
  });
  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: "VENDOR_SKILL_CONFLICT",
        code: "HARD_BLOCK",
        conflicts,
      },
      { status: 409 }
    );
  }

  // ── Streaming path: NDJSON progress events for granular green-check UI ──
  if (stream) {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      async start(controller) {
        const send = (ev: ProgressEvent | Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        };
        try {
          const result = await createAndGenerateChain({
            userId: user.id,
            vendorName,
            vendorEmail,
            rawJobText,
            employeeNote: employeeNote || null,
            candidateIds,
            onProgress: async (ev) => {
              send(ev);
            },
          });
          // Ensure final payload even if pipeline already sent chain_done
          send({
            type: "complete",
            id: result.id,
            status: result.status,
            succeeded: result.succeeded,
            failed: result.failed,
            errors: result.errors,
          });
        } catch (e) {
          send({
            type: "error",
            message:
              e instanceof Error ? e.message : "Unexpected error creating chain",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(streamBody, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // ── Classic JSON response (non-stream) ──
  try {
    const result = await createAndGenerateChain({
      userId: user.id,
      vendorName,
      vendorEmail,
      rawJobText,
      employeeNote: employeeNote || null,
      candidateIds,
    });

    if (result.status === "FAILED") {
      return NextResponse.json(
        {
          id: result.id,
          status: "FAILED",
          error: "CHAIN_GENERATION_FAILED",
          message:
            result.errors.length > 0
              ? `Generation failed for all candidates: ${result.errors.map((e) => e.name).join(", ")}`
              : "Generation failed with no resumes produced.",
          errors: result.errors,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      id: result.id,
      status: result.status,
      succeeded: result.succeeded,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (e) {
    console.error("create chain fatal", e);
    return NextResponse.json(
      {
        error: "CHAIN_CREATE_FAILED",
        message:
          e instanceof Error ? e.message : "Unexpected error creating chain",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await recoverStaleChains();
  } catch {
    /* ignore */
  }
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
