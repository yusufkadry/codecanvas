import type { Keys, ModelChoice, ModelInfo, ProviderId } from "./types";

type Tier = "light" | "standard" | "heavy";
type ModelMap = Partial<Record<ProviderId, ModelInfo[]>>;

const HEAVY_HINTS =
  /\b(auth|login|database|db|realtime|websocket|drag|kanban|editor|game|chart|dashboard|multiplayer|payment|stripe|algorithm|complex|full[- ]stack|3d|canvas|animation engine)\b/i;
const LIGHT_HINTS = /\b(button|counter|snippet|tiny|simple|single|one[- ]file|landing page|clock|timer)\b/i;

function classify(prompt: string): { tier: Tier; why: string } {
  const p = prompt.trim();
  if (p.length > 400 || HEAVY_HINTS.test(p)) return { tier: "heavy", why: "complex build detected" };
  if (p.length < 140 && LIGHT_HINTS.test(p)) return { tier: "light", why: "small task detected" };
  return { tier: "standard", why: "standard app build" };
}

/**
 * Ranked patterns matched against the user's LIVE model list (newest-first
 * from the fetcher), so new releases are picked up automatically. The
 * hardcoded FALLBACK only applies before the first successful model fetch.
 */
const RANK: Record<"openai" | "anthropic", Record<Tier, RegExp[]>> = {
  openai: {
    heavy: [/^gpt-5(?!.*(mini|nano))/i, /^o3(?!-mini)/i, /^gpt-4\.1(?!.*(mini|nano))/i, /^gpt-4o(?!.*mini)/i],
    standard: [/^gpt-5-mini/i, /^gpt-4\.1(?!.*(mini|nano))/i, /^gpt-4o(?!.*mini)/i, /^gpt-5(?!.*nano)/i],
    light: [/nano/i, /mini/i, /^gpt-4o$/i],
  },
  anthropic: {
    heavy: [/opus/i, /sonnet/i],
    standard: [/sonnet/i, /opus/i],
    light: [/haiku/i, /sonnet/i],
  },
};

const FALLBACK: Record<"openai" | "anthropic", Record<Tier, string>> = {
  openai: { heavy: "gpt-4.1", standard: "gpt-4o", light: "gpt-4o-mini" },
  anthropic: {
    heavy: "claude-sonnet-4-6",
    standard: "claude-sonnet-4-6",
    light: "claude-haiku-4-5-20251001",
  },
};

const ORDER: Record<Tier, ProviderId[]> = {
  heavy: ["anthropic", "openai", "openrouter", "ollama"],
  standard: ["openai", "anthropic", "openrouter", "ollama"],
  light: ["openai", "anthropic", "ollama", "openrouter"],
};

function keyFor(keys: Keys, p: ProviderId): string {
  switch (p) {
    case "openai":
      return keys.openai;
    case "anthropic":
      return keys.anthropic;
    case "openrouter":
      return keys.openrouter;
    case "ollama":
      return keys.ollamaUrl;
  }
}

function pickFrom(models: ModelMap, provider: ProviderId, tier: Tier, keys: Keys): string {
  if (provider === "openrouter") return keys.openrouterModel;
  if (provider === "ollama") return keys.ollamaModel || models.ollama?.[0]?.id || "";
  const list = models[provider];
  if (list?.length) {
    for (const re of RANK[provider][tier]) {
      const hit = list.find((m) => re.test(m.id));
      if (hit) return hit.id;
    }
    return list[0].id; // newest available beats nothing
  }
  return FALLBACK[provider][tier];
}

/** Auto mode: classify, then pick the best model the user's keys can reach. */
export function route(prompt: string, keys: Keys, models: ModelMap): ModelChoice | null {
  const { tier, why } = classify(prompt);
  for (const provider of ORDER[tier]) {
    if (!keyFor(keys, provider)) continue;
    const model = pickFrom(models, provider, tier, keys);
    if (model) return { provider, model, reason: `${why} → ${model}` };
  }
  return null;
}

export interface ModelGroup {
  provider: ProviderId;
  label: string;
  options: ModelInfo[];
}

/**
 * Everything the user can manually select — the FULL fetched list per
 * provider, not a curated subset. Falls back to a minimal set only before
 * the first fetch succeeds.
 */
export function manualGroups(keys: Keys, models: ModelMap): ModelGroup[] {
  const groups: ModelGroup[] = [];
  if (keys.anthropic) {
    groups.push({
      provider: "anthropic",
      label: "Anthropic",
      options: models.anthropic?.length
        ? models.anthropic
        : [
            { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
            { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
          ],
    });
  }
  if (keys.openai) {
    groups.push({
      provider: "openai",
      label: "OpenAI",
      options: models.openai?.length
        ? models.openai
        : [
            { id: "gpt-4.1", label: "gpt-4.1" },
            { id: "gpt-4o", label: "gpt-4o" },
            { id: "gpt-4o-mini", label: "gpt-4o-mini" },
          ],
    });
  }
  if (keys.openrouter) {
    groups.push({
      provider: "openrouter",
      label: "OpenRouter",
      options: models.openrouter?.length
        ? models.openrouter
        : [{ id: keys.openrouterModel, label: keys.openrouterModel }],
    });
  }
  if (keys.ollamaUrl) {
    groups.push({
      provider: "ollama",
      label: "Local",
      options: models.ollama?.length
        ? models.ollama
        : [{ id: keys.ollamaModel, label: keys.ollamaModel }],
    });
  }
  return groups;
}
