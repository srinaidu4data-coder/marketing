"use server";

import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { llmChatJson } from "@/lib/resume/llm-chat";
import { getLlmConfigForProvider, type LlmProvider } from "@/lib/resume/llm-config";
import { getActiveLlmConfig } from "@/lib/system-settings";
import {
  getActiveSystemPrompt,
  PROMPT_LAB_SECTIONS,
  getSection,
  generateResumeV2WithRegen,
  generateResumeV2PickBetter,
  precheckGenerate,
  type PromptSectionId,
} from "@/lib/resume-v2";

async function resolvePrompt(override?: string): Promise<{
  prompt: string;
  versionId: string;
}> {
  if (override && override.trim().length > 100) {
    return { prompt: override.trim(), versionId: "override" };
  }
  const active = await getActiveSystemPrompt();
  return { prompt: active.content, versionId: active.versionId };
}

export type PromptLabSectionResult = {
  ok: boolean;
  sectionId: string;
  title: string;
  raw: string;
  json?: unknown;
  model?: string;
  provider?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  error?: string;
};

export async function runPromptLabSection(opts: {
  sectionId: PromptSectionId;
  master: string;
  jd: string;
  draft?: string;
  promptOverride?: string;
  llmProvider?: LlmProvider | null;
}): Promise<PromptLabSectionResult> {
  await requireAdmin();
  const section = getSection(opts.sectionId);
  const t0 = Date.now();

  try {
    if (opts.sectionId === "precheck" && !opts.promptOverride) {
      // Code precheck + optional LLM enrichment
      const { prompt } = await resolvePrompt(opts.promptOverride);
      const code = precheckGenerate({
        prompt,
        masterText: opts.master,
        jd: opts.jd,
      });
      // Still call LLM micro for richer audit if keys work
      try {
        const cfg = opts.llmProvider
          ? getLlmConfigForProvider(opts.llmProvider)
          : await getActiveLlmConfig(null);
        if (cfg.configured) {
          const res = await llmChatJson({
            system: section.microPrompt,
            user: `MASTER:\n${opts.master.slice(0, 12000)}\n\nJD:\n${opts.jd.slice(0, 8000)}`,
            config: cfg,
            temperature: 0.2,
          });
          return {
            ok: true,
            sectionId: section.id,
            title: section.title,
            raw: JSON.stringify(
              { codePrecheck: code, llmPrecheck: res.json },
              null,
              2
            ),
            json: { codePrecheck: code, llmPrecheck: res.json },
            model: res.model,
            provider: res.provider,
            tokensIn: res.tokensIn,
            tokensOut: res.tokensOut,
            latencyMs: Date.now() - t0,
          };
        }
      } catch {
        /* code only */
      }
      return {
        ok: code.ok,
        sectionId: section.id,
        title: section.title,
        raw: JSON.stringify(code, null, 2),
        json: code,
        latencyMs: Date.now() - t0,
        error: code.ok ? undefined : code.errors.join("; "),
      };
    }

    if (opts.sectionId === "full_bible") {
      const { prompt, versionId } = await resolvePrompt(opts.promptOverride);
      const gen = await generateResumeV2WithRegen({
        prompt,
        master: opts.master,
        jd: opts.jd,
        promptVersionId: versionId,
        llmProvider: opts.llmProvider || null,
        targetAts: 95,
        maxAttempts: 3,
      });
      return {
        ok: gen.ok,
        sectionId: section.id,
        title: section.title,
        raw: gen.text || gen.error || "",
        json: {
          pack: gen.pack,
          ats: gen.ats,
          psych: gen.psych,
          issues: gen.issues,
          precheckErrors: gen.precheckErrors,
          attempts: gen.attempts,
        },
        model: gen.model,
        provider: gen.provider,
        tokensIn: gen.tokensIn,
        tokensOut: gen.tokensOut,
        latencyMs: Date.now() - t0,
        error: gen.error,
      };
    }

    const activeSys = await getActiveSystemPrompt();
    const system = section.microPrompt || activeSys.content;

    const userParts = [
      `=== MASTER ===\n${opts.master.slice(0, 14000)}`,
      `=== JD ===\n${opts.jd.slice(0, 8000)}`,
    ];
    if (opts.draft?.trim()) {
      userParts.push(`=== DRAFT / PRIOR ===\n${opts.draft.slice(0, 10000)}`);
    }
    userParts.push(`Return JSON only for section: ${section.title}. ${section.expectHint}`);

    const cfg = opts.llmProvider
      ? getLlmConfigForProvider(opts.llmProvider)
      : await getActiveLlmConfig(null);
    if (!cfg.configured) {
      return {
        ok: false,
        sectionId: section.id,
        title: section.title,
        raw: "",
        latencyMs: Date.now() - t0,
        error: cfg.reason || "LLM not configured",
      };
    }

    const res = await llmChatJson({
      system,
      user: userParts.join("\n\n"),
      config: cfg,
      temperature: 0.35,
    });

    return {
      ok: true,
      sectionId: section.id,
      title: section.title,
      raw: res.raw,
      json: res.json,
      model: res.model,
      provider: res.provider,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      sectionId: section.id,
      title: section.title,
      raw: "",
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runPromptLabFullCompare(opts: {
  master: string;
  jd: string;
  promptOverride?: string;
}): Promise<{
  ok: boolean;
  winner?: string;
  openai?: Awaited<ReturnType<typeof generateResumeV2WithRegen>>;
  claude?: Awaited<ReturnType<typeof generateResumeV2WithRegen>>;
  error?: string;
}> {
  await requireAdmin();
  try {
    const { prompt, versionId } = await resolvePrompt(opts.promptOverride);
    const both = await generateResumeV2PickBetter({
      prompt,
      master: opts.master,
      jd: opts.jd,
      promptVersionId: versionId,
      targetAts: 95,
      maxAttempts: 2,
    });
    return {
      ok: both.ok,
      winner: both.provider,
      openai: both.provider === "openai" ? both : both.runnerUp,
      claude: both.provider === "anthropic" ? both : both.runnerUp,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function listPromptLabSections() {
  await requireAdmin();
  return PROMPT_LAB_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    emoji: s.emoji,
    blurb: s.blurb,
    color: s.color,
    expectHint: s.expectHint,
  }));
}

export async function getBiblePromptSample() {
  await requireAdmin();
  const active = await getActiveSystemPrompt();
  return active.content;
}
