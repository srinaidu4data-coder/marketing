/**
 * OpenAI / compatible chat API configuration.
 * Role Forge generates resumes via this key + the ACTIVE admin prompt.
 */

export type OpenAiConfig = {
  configured: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  reason?: string;
};

function isUsableApiKey(key: string): boolean {
  const k = (key || "").trim();
  if (k.length < 20) return false;
  if (/^(test|dummy|placeholder|xxx|your[-_]?key|sk-xxx)/i.test(k)) return false;
  return true;
}

/** Resolve OpenAI credentials from environment (Vercel / .env). */
export function getOpenAiConfig(): OpenAiConfig {
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
      configured: false,
      apiKey: "",
      baseUrl,
      model,
      reason:
        "OPENAI_API_KEY is not set. Add it in Vercel → Settings → Environment Variables (Production) or local .env.",
    };
  }
  if (!isUsableApiKey(apiKey)) {
    return {
      configured: false,
      apiKey: "",
      baseUrl,
      model,
      reason:
        "OPENAI_API_KEY looks like a placeholder (too short or dummy). Paste a real key (sk-…).",
    };
  }
  return { configured: true, apiKey, baseUrl, model };
}
