/**
 * Public resume-engine surface for app layers.
 * Prefer deep imports for heavy internals (ai-tailor, assemble-pack) to avoid
 * pulling the full generation graph into client bundles by accident.
 */
export * from "./templates";
export * from "./ats-scorer";
export * from "./progressive-tailor";
export * from "./vendor-guard";
export * from "./render-docx";
export * from "./render-pdf";
export * from "./pack-ship-ready";
export * from "./bullet-density";
export * from "./tailor-mode";
export {
  getOpenAiConfig,
  getAnthropicConfig,
  parseLlmProvider,
  estimateLlmCostUsd,
  type LlmProvider,
  type LlmProviderConfig,
} from "./llm-config";
