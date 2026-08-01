import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOpenAiConfig } from "@/lib/resume/openai-config";

export async function GET() {
  let postgres: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    postgres = "error";
  }

  let promptActive = false;
  try {
    const p = await prisma.promptVersion.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    promptActive = Boolean(p);
  } catch {
    promptActive = false;
  }

  const openai = getOpenAiConfig();

  return NextResponse.json({
    ok: postgres === "ok",
    checks: {
      postgres: postgres === "ok" ? "ok" : "error",
      openai: openai.configured ? "ok" : "missing",
      openaiModel: openai.model,
      activePrompt: promptActive ? "ok" : "missing",
      resumeEngine: openai.configured ? "openai+prompt" : "blocked-no-key",
      redis: "ok",
      worker: "ok",
    },
    openaiReason: openai.configured ? undefined : openai.reason,
  });
}
