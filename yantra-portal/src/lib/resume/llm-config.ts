/**
 * LLM provider configuration — OpenAI and Anthropic (Claude).
 * API keys stay in env; preferred provider is stored in SystemSetting (Admin UI).
 */

export type LlmProvider = "openai" | "anthropic";

export type LlmProviderConfig = {
  provider: LlmProvider;
  configured: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
  reason?: string;
};

/** Default Claude model — keep on an Active Anthropic ID (not retired). */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

/**
 * Retired / invalid Claude model IDs → recommended Active replacements.
 * Anthropic returns HTTP 404 not_found for retired models (e.g. Sonnet 4, June 2026).
 * @see https://platform.claude.com/docs/en/about-claude/model-deprecations
 */
export const ANTHROPIC_MODEL_REPLACEMENTS: Record<string, string> = {
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-opus-4-20250514": "claude-opus-4-8",
  "claude-3-7-sonnet-20250219": "claude-sonnet-4-6",
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
  "claude-3-5-sonnet-20240620": "claude-sonnet-4-6",
  "claude-3-sonnet-20240229": "claude-sonnet-4-6",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  "claude-3-haiku-20240307": "claude-haiku-4-5-20251001",
  "claude-2.0": "claude-sonnet-4-6",
  "claude-2.1": "claude-sonnet-4-6",
  "claude-instant-1.2": "claude-haiku-4-5-20251001",
};

/** Fallback chain when primary model returns 404 / not_found */
export const ANTHROPIC_MODEL_FALLBACKS = [
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
] as const;

/** Map retired model IDs (and common aliases) to Active IDs. */
export function normalizeAnthropicModel(model: string | null | undefined): string {
  const raw = (model || "").trim();
  if (!raw) return DEFAULT_ANTHROPIC_MODEL;
  const key = raw.toLowerCase();
  if (ANTHROPIC_MODEL_REPLACEMENTS[key]) {
    return ANTHROPIC_MODEL_REPLACEMENTS[key]!;
  }
  // Loose aliases
  if (key === "claude-sonnet-4" || key === "sonnet-4") return "claude-sonnet-4-6";
  if (key === "claude-opus-4" || key === "opus-4") return "claude-opus-4-8";
  return raw;
}

export type ActiveLlmConfig = LlmProviderConfig & {
  /** Admin-selected provider (may differ from env-only fallback) */
  selectedProvider: LlmProvider;
  openai: LlmProviderConfig;
  anthropic: LlmProviderConfig;
};

function isUsableApiKey(key: string): boolean {
  const k = (key || "").trim();
  if (k.length < 20) return false;
  if (/^(test|dummy|placeholder|xxx|your[-_]?key|sk-xxx)/i.test(k)) return false;
  return true;
}

export function parseLlmProvider(raw: string | null | undefined): LlmProvider {
  const v = (raw || "").trim().toLowerCase();
  if (v === "anthropic" || v === "claude" || v === "claude-api") return "anthropic";
  return "openai";
}

export function getOpenAiConfig(): LlmProviderConfig {
  const apiKey = (
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.ROLEFORGE_OPENAI_KEY ||
    ""
  ).trim();
  const baseUrl = (
    process.env.OPENAI_BASE_URL ||
    process.env.OPENAI_API_BASE ||
    "https://api.openai.com/v1"
  )
    .trim()
    .replace(/\/$/, "");
  const model = (
    process.env.OPENAI_MODEL ||
    process.env.ROLEFORGE_OPENAI_MODEL ||
    "gpt-4o-mini"
  ).trim();

  if (!apiKey) {
    return {
      provider: "openai",
      configured: false,
      apiKey: "",
      baseUrl,
      model,
      label: "OpenAI",
      reason:
        "OPENAI_API_KEY is not set. Add it in Vercel → Environment Variables or local .env.",
    };
  }
  if (!isUsableApiKey(apiKey)) {
    return {
      provider: "openai",
      configured: false,
      apiKey: "",
      baseUrl,
      model,
      label: "OpenAI",
      reason:
        "OPENAI_API_KEY looks like a placeholder. Paste a real key (sk-…).",
    };
  }
  return {
    provider: "openai",
    configured: true,
    apiKey,
    baseUrl,
    model,
    label: "OpenAI",
  };
}

export function getAnthropicConfig(): LlmProviderConfig {
  const apiKey = (
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_API_KEY ||
    process.env.ANTHROPIC_KEY ||
    ""
  ).trim();
  const baseUrl = (
    process.env.ANTHROPIC_BASE_URL ||
    process.env.CLAUDE_BASE_URL ||
    "https://api.anthropic.com"
  )
    .trim()
    .replace(/\/$/, "");
  const model = normalizeAnthropicModel(
    process.env.ANTHROPIC_MODEL ||
      process.env.CLAUDE_MODEL ||
      DEFAULT_ANTHROPIC_MODEL
  );

  if (!apiKey) {
    return {
      provider: "anthropic",
      configured: false,
      apiKey: "",
      baseUrl,
      model,
      label: "Claude (Anthropic)",
      reason:
        "ANTHROPIC_API_KEY is not set. Add it in Vercel → Environment Variables or local .env.",
    };
  }
  if (!isUsableApiKey(apiKey)) {
    return {
      provider: "anthropic",
      configured: false,
      apiKey: "",
      baseUrl,
      model,
      label: "Claude (Anthropic)",
      reason:
        "ANTHROPIC_API_KEY looks like a placeholder. Paste a real Anthropic key (sk-ant-…).",
    };
  }
  return {
    provider: "anthropic",
    configured: true,
    apiKey,
    baseUrl,
    model,
    label: "Claude (Anthropic)",
  };
}

/**
 * Env override wins for ops: LLM_PROVIDER=anthropic
 * Else admin SystemSetting (passed in).
 */
export function resolveProviderSelection(
  adminSelected?: string | null
): LlmProvider {
  const envOverride = process.env.LLM_PROVIDER || process.env.ROLEFORGE_LLM_PROVIDER;
  if (envOverride?.trim()) return parseLlmProvider(envOverride);
  return parseLlmProvider(adminSelected);
}

/** Sync snapshot for a given selection (no DB). */
export function getLlmConfigForProvider(provider: LlmProvider): LlmProviderConfig {
  return provider === "anthropic" ? getAnthropicConfig() : getOpenAiConfig();
}

/**
 * Active runtime config: admin (or env) selection + key status.
 * Optional modelOverride from SystemSetting (empty = env default).
 */
export function buildActiveLlmConfig(opts: {
  selectedProvider: LlmProvider;
  modelOverride?: string | null;
}): ActiveLlmConfig {
  const openai = getOpenAiConfig();
  const anthropic = getAnthropicConfig();
  const selected = opts.selectedProvider;
  let active = selected === "anthropic" ? { ...anthropic } : { ...openai };

  const override = (opts.modelOverride || "").trim();
  if (override) {
    active = {
      ...active,
      model:
        selected === "anthropic"
          ? normalizeAnthropicModel(override)
          : override,
    };
  } else if (selected === "anthropic") {
    // Ensure env/default path also remaps retired IDs (already done in getAnthropicConfig)
    active = { ...active, model: normalizeAnthropicModel(active.model) };
  }

  // If selected provider has no key, surface clear reason
  if (!active.configured) {
    // Helpful: if the other provider works, mention it
    const other = selected === "anthropic" ? openai : anthropic;
    if (other.configured) {
      active = {
        ...active,
        reason: `${active.reason || "Key missing"} Switch provider in Admin → Settings, or set the ${selected === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"}.`,
      };
    }
  }

  return {
    ...active,
    selectedProvider: selected,
    openai,
    anthropic,
  };
}

/** Approximate USD cost for usage logging */
export function estimateLlmCostUsd(
  tokensIn: number,
  tokensOut: number,
  model: string,
  provider?: LlmProvider
): number {
  const m = (model || "").toLowerCase();
  let inPerM = 0.15;
  let outPerM = 0.6;

  if (provider === "anthropic" || m.includes("claude")) {
    // Ballpark Claude Sonnet-class pricing (update as needed)
    if (m.includes("haiku")) {
      inPerM = 0.8;
      outPerM = 4;
    } else if (m.includes("opus")) {
      inPerM = 15;
      outPerM = 75;
    } else {
      // sonnet default
      inPerM = 3;
      outPerM = 15;
    }
  } else if (m.includes("gpt-4o") && !m.includes("mini")) {
    inPerM = 2.5;
    outPerM = 10;
  } else if (m.includes("gpt-4") && !m.includes("4o")) {
    inPerM = 30;
    outPerM = 60;
  }

  return Number(
    ((tokensIn / 1e6) * inPerM + (tokensOut / 1e6) * outPerM).toFixed(6)
  );
}
