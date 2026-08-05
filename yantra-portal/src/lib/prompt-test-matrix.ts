/**
 * Fixed engine sequences + LLM provider tabs for Admin → Prompt → Test Mode.
 * Kept outside "use server" so the client can import labels safely.
 */

import type { ResumeEngineId } from "@/lib/system-settings";
import type { LlmProvider } from "@/lib/resume/llm-config";

export type PromptTestTabDef = {
  id: string;
  label: string;
  shortLabel: string;
  sequence: ResumeEngineId[];
  /** When set, force this LLM for ai-tailor steps */
  llmProvider?: LlmProvider;
};

export const PROMPT_TEST_SEQUENCES: PromptTestTabDef[] = [
  {
    id: "ai-then-rules",
    label: "ai-tailor → progressive-rules",
    shortLabel: "AI → Rules",
    sequence: ["ai-tailor", "progressive-rules"],
  },
  {
    id: "rules-then-ai",
    label: "progressive-rules → ai-tailor",
    shortLabel: "Rules → AI",
    sequence: ["progressive-rules", "ai-tailor"],
  },
  {
    id: "rules-only",
    label: "progressive-rules",
    shortLabel: "Rules only",
    sequence: ["progressive-rules"],
  },
  {
    id: "ai-only",
    label: "ai-tailor (admin LLM)",
    shortLabel: "AI only",
    sequence: ["ai-tailor"],
  },
  {
    id: "openai-only",
    label: "ai-tailor · OpenAI",
    shortLabel: "OpenAI",
    sequence: ["ai-tailor"],
    llmProvider: "openai",
  },
  {
    id: "claude-only",
    label: "ai-tailor · Claude (Anthropic)",
    shortLabel: "Claude",
    sequence: ["ai-tailor"],
    llmProvider: "anthropic",
  },
];
