/**
 * Unified chat completions for OpenAI + Anthropic (Claude).
 * Returns JSON text for resume generation paths.
 */

import {
  type LlmProvider,
  type LlmProviderConfig,
  ANTHROPIC_MODEL_FALLBACKS,
  getLlmConfigForProvider,
  normalizeAnthropicModel,
} from "./llm-config";

export type LlmChatJsonResult = {
  json: unknown;
  raw: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  provider: LlmProvider;
};

function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonLoose(raw: string): unknown {
  const cleaned = stripCodeFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("LLM returned non-JSON content");
  }
}

async function chatOpenAiJson(
  cfg: LlmProviderConfig,
  opts: { system: string; user: string; temperature?: number }
): Promise<LlmChatJsonResult> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: opts.temperature ?? 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
    signal: AbortSignal.timeout(
      Number(process.env.OPENAI_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 90_000)
    ),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const raw = (data.choices?.[0]?.message?.content || "").trim();
  if (!raw) throw new Error("OpenAI empty response");
  return {
    json: parseJsonLoose(raw),
    raw: stripCodeFence(raw),
    tokensIn: data.usage?.prompt_tokens || Math.ceil(opts.user.length / 4),
    tokensOut: data.usage?.completion_tokens || Math.ceil(raw.length / 4),
    model: data.model || cfg.model,
    provider: "openai",
  };
}

function anthropicErrorSummary(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as {
      error?: { type?: string; message?: string };
      type?: string;
    };
    const msg = j?.error?.message || j?.error?.type;
    if (msg) return `Anthropic HTTP ${status}: ${msg}`;
  } catch {
    /* keep truncated body */
  }
  return `Anthropic HTTP ${status}: ${body.slice(0, 200)}`;
}

function isAnthropicModelNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  const lower = (body || "").toLowerCase();
  return (
    lower.includes("not_found") ||
    lower.includes("model:") ||
    /model .* (not found|does not exist|retired)/i.test(body || "")
  );
}

async function chatAnthropicJsonOnce(
  cfg: LlmProviderConfig,
  opts: { system: string; user: string; temperature?: number },
  model: string
): Promise<LlmChatJsonResult> {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = base.endsWith("/v1")
    ? `${base}/messages`
    : `${base}/v1/messages`;

  const system =
    opts.system +
    "\n\nIMPORTANT: Respond with a single valid JSON object only. No markdown fences, no commentary.";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "anthropic-version":
        process.env.ANTHROPIC_VERSION || "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 8192),
      temperature: opts.temperature ?? 0.35,
      system,
      messages: [{ role: "user", content: opts.user }],
    }),
    signal: AbortSignal.timeout(
      Number(
        process.env.ANTHROPIC_TIMEOUT_MS ||
          process.env.LLM_TIMEOUT_MS ||
          120_000
      )
    ),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(anthropicErrorSummary(res.status, t)) as Error & {
      status?: number;
      body?: string;
      modelNotFound?: boolean;
    };
    err.status = res.status;
    err.body = t;
    err.modelNotFound = isAnthropicModelNotFound(res.status, t);
    throw err;
  }
  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };
  const raw = (data.content || [])
    .filter((c) => c.type === "text" || c.text)
    .map((c) => c.text || "")
    .join("\n")
    .trim();
  if (!raw) throw new Error("Anthropic empty response");
  return {
    json: parseJsonLoose(raw),
    raw: stripCodeFence(raw),
    tokensIn: data.usage?.input_tokens || Math.ceil(opts.user.length / 4),
    tokensOut: data.usage?.output_tokens || Math.ceil(raw.length / 4),
    model: data.model || model,
    provider: "anthropic",
  };
}

async function chatAnthropicJson(
  cfg: LlmProviderConfig,
  opts: { system: string; user: string; temperature?: number }
): Promise<LlmChatJsonResult> {
  const primary = normalizeAnthropicModel(cfg.model);
  const candidates = [
    primary,
    ...ANTHROPIC_MODEL_FALLBACKS.filter((m) => m !== primary),
  ];

  let lastErr: Error | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i]!;
    try {
      return await chatAnthropicJsonOnce(cfg, opts, model);
    } catch (e) {
      const err = e as Error & { modelNotFound?: boolean; status?: number };
      lastErr = err instanceof Error ? err : new Error(String(e));
      // Only walk the fallback chain on model-not-found (retired / wrong ID)
      if (!err.modelNotFound) throw lastErr;
      // continue to next candidate
    }
  }
  throw lastErr || new Error("Anthropic: no working model in fallback chain");
}

/**
 * JSON chat against the active (or forced) provider.
 */
export async function llmChatJson(opts: {
  system: string;
  user: string;
  temperature?: number;
  /** Force provider; default from cfg.provider */
  config: LlmProviderConfig;
}): Promise<LlmChatJsonResult> {
  const cfg = opts.config;
  if (!cfg.configured) {
    throw new Error(
      cfg.reason ||
        `${cfg.label || cfg.provider} is not configured (missing API key).`
    );
  }
  if (cfg.provider === "anthropic") {
    return chatAnthropicJson(cfg, opts);
  }
  return chatOpenAiJson(cfg, opts);
}

/** Convenience: build config for a provider id and call */
export async function llmChatJsonForProvider(
  provider: LlmProvider,
  opts: { system: string; user: string; temperature?: number; modelOverride?: string }
): Promise<LlmChatJsonResult> {
  let cfg = getLlmConfigForProvider(provider);
  if (opts.modelOverride?.trim()) {
    const m =
      provider === "anthropic"
        ? normalizeAnthropicModel(opts.modelOverride)
        : opts.modelOverride.trim();
    cfg = { ...cfg, model: m };
  }
  return llmChatJson({ ...opts, config: cfg });
}
