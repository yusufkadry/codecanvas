import type { Keys, ModelInfo, ProviderId } from "./types";

/**
 * Live model discovery. Instead of a hardcoded list, each provider is asked
 * what THIS key can actually use, so every model you have access to shows up.
 *
 * OpenAI's /v1/models returns everything on the account including models that
 * can't do chat (embeddings, TTS, Whisper, image, realtime). Those are
 * filtered by EXCLUSION so brand-new chat models pass through automatically
 * instead of waiting for us to update an allowlist.
 */

const CACHE_KEY = "codecanvas.models.v1";

export function loadModelCache(): Partial<Record<ProviderId, ModelInfo[]>> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw).byProvider ?? {};
  } catch {
    /* cold cache */
  }
  return {};
}

export function saveModelCache(byProvider: Partial<Record<ProviderId, ModelInfo[]>>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ byProvider, fetchedAt: Date.now() }));
  } catch {
    /* storage full — non-fatal */
  }
}

export async function fetchModels(provider: ProviderId, keys: Keys): Promise<ModelInfo[]> {
  switch (provider) {
    case "openai":
      return fetchOpenAI(keys.openai);
    case "anthropic":
      return fetchAnthropic(keys.anthropic);
    case "openrouter":
      return fetchOpenRouter(keys.openrouter);
    case "ollama":
      return fetchOllama(keys.ollamaUrl);
  }
}

// Non-chat model families. Exclusion list, deliberately: future chat models
// appear without a code change; future non-chat families are the rare case.
const OPENAI_EXCLUDE =
  /(embedding|tts|whisper|dall-e|moderation|realtime|transcribe|image|babbage|davinci|instruct|audio)/i;

async function fetchOpenAI(key: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenAI models ${res.status}: ${await safeText(res)}`);
  const data = (await res.json()) as { data: { id: string; created?: number }[] };
  return data.data
    .filter((m) => !OPENAI_EXCLUDE.test(m.id) && /^(gpt|o\d|chatgpt)/i.test(m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .map((m) => ({ id: m.id, label: m.id }));
}

async function fetchAnthropic(key: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=1000", {
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });
  if (!res.ok) throw new Error(`Anthropic models ${res.status}: ${await safeText(res)}`);
  const data = (await res.json()) as {
    data: { id: string; display_name?: string; created_at?: string }[];
  };
  return data.data
    .sort((a, b) => Date.parse(b.created_at ?? "0") - Date.parse(a.created_at ?? "0"))
    .map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
}

async function fetchOpenRouter(key: string): Promise<ModelInfo[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}: ${await safeText(res)}`);
  const data = (await res.json()) as { data: { id: string; name?: string }[] };
  return data.data
    .map((m) => ({ id: m.id, label: m.name ? `${m.name}` : m.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchOllama(baseUrl: string): Promise<ModelInfo[]> {
  const base = baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/models`);
  if (!res.ok) throw new Error(`Local server models ${res.status}: ${await safeText(res)}`);
  const data = (await res.json()) as { data: { id: string }[] };
  return data.data.map((m) => ({ id: m.id, label: m.id })).sort((a, b) => a.id.localeCompare(b.id));
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "(no body)";
  }
}
