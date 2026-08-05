/**
 * Backward-compatible OpenAI config exports.
 * Prefer `@/lib/resume/llm-config` for multi-provider code.
 */

export {
  getOpenAiConfig,
  getAnthropicConfig,
  getLlmConfigForProvider,
  buildActiveLlmConfig,
  parseLlmProvider,
  resolveProviderSelection,
  estimateLlmCostUsd,
  type LlmProvider,
  type LlmProviderConfig,
  type ActiveLlmConfig,
} from "./llm-config";

/** @deprecated Use LlmProviderConfig */
export type OpenAiConfig = import("./llm-config").LlmProviderConfig;
