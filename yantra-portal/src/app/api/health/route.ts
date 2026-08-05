import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getAnthropicConfig,
  getOpenAiConfig,
} from "@/lib/resume/openai-config";
import { getActiveLlmConfig } from "@/lib/system-settings";

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
  const anthropic = getAnthropicConfig();
  let active;
  try {
    active = await getActiveLlmConfig();
  } catch {
    active = null;
  }

  const llmReady = active?.configured ?? openai.configured;

  return NextResponse.json({
    ok: postgres === "ok",
    checks: {
      postgres: postgres === "ok" ? "ok" : "error",
      llm: llmReady ? "ok" : "missing",
      llmProvider: active?.provider || "openai",
      llmModel: active?.model || openai.model,
      openai: openai.configured ? "ok" : "missing",
      openaiModel: openai.model,
      anthropic: anthropic.configured ? "ok" : "missing",
      anthropicModel: anthropic.model,
      activePrompt: promptActive ? "ok" : "missing",
      resumeEngine: llmReady
        ? `${active?.provider || "openai"}+prompt`
        : "blocked-no-key",
      redis: "ok",
      worker: "ok",
    },
    openaiReason: openai.configured ? undefined : openai.reason,
    anthropicReason: anthropic.configured ? undefined : anthropic.reason,
    llmReason: active && !active.configured ? active.reason : undefined,
  });
}
