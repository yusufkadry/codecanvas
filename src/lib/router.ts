import type { Keys, ModelChoice, ProviderId } from "./types";

type Tier = "light" | "standard" | "heavy";

const HEAVY_HINTS =
  /\b(auth|login|database|db|realtime|websocket|drag|kanban|editor|game|chart|dashboard|multiplayer|payment|stripe|algorithm|complex|full[- ]stack|3d|canvas|animation engine)\b/i;
const LIGHT_HINTS = /\b(button|counter|snippet|tiny|simple|single|one[- ]file|landing page|clock|timer)\b/i;

function classify(prompt: string): { tier: Tier; why: string } {
  const p = prompt.trim();
  if (p.length > 400 || HEAVY_HINTS.test(p)) {
    return { tier: "heavy", why: "complex build detected" };
  }
  if (p.length < 140 && LIGHT_HINTS.test(p)) {
    return { tier: "light", why: "small task detected" };
  }
  return { tier: "standard", why: "standard app build" };
}

/** Per-tier preference order. First provider with a key wins. */
const PREFS: Record<Tier, { provider: ProviderId; model: (k: Keys) => string }[]> = {
  heavy: [
    { provider: "anthropic", model: () => "claude-sonnet-4-6" },
    { provider: "openai", model: () => "gpt-4.1" },
    { provider: "openrouter", model: (k) => k.openrouterModel },
    { provider: "ollama", model: (k) => k.ollamaModel },
  ],
  standard: [
    { provider: "openai", model: () => "gpt-4o" },
    { provider: "anthropic", model: () => "claude-sonnet-4-6" },
    { provider: "openrouter", model: (k) => k.openrouterModel },
    { provider: "ollama", model: (k) => k.ollamaModel },
  ],
  light: [
    { provider: "openai", model: () => "gpt-4o-mini" },
    { provider: "anthropic", model: () => "claude-haiku-4-5-20251001" },
    { provider: "ollama", model: (k) => k.ollamaModel },
    { provider: "openrouter", model: (k) => k.openrouterModel },
  ],
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

/**
 * Auto mode: classify the prompt, then pick the best model among the
 * providers the user has actually configured.
 */
export function route(prompt: string, keys: Keys): ModelChoice | null {
  const { tier, why } = classify(prompt);
  for (const pref of PREFS[tier]) {
    if (keyFor(keys, pref.provider)) {
      return {
        provider: pref.provider,
        model: pref.model(keys),
        reason: `${why} → ${pref.model(keys)}`,
      };
    }
  }
  return null; // no keys configured at all
}

/** All manually-selectable options given the configured keys. */
export function manualOptions(keys: Keys): { provider: ProviderId; model: string; label: string }[] {
  const out: { provider: ProviderId; model: string; label: string }[] = [];
  if (keys.anthropic) {
    out.push(
      { provider: "anthropic", model: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    );
  }
  if (keys.openai) {
    out.push(
      { provider: "openai", model: "gpt-4.1", label: "GPT-4.1" },
      { provider: "openai", model: "gpt-4o", label: "GPT-4o" },
      { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini" },
    );
  }
  if (keys.openrouter) {
    out.push({ provider: "openrouter", model: keys.openrouterModel, label: `OpenRouter · ${keys.openrouterModel}` });
  }
  if (keys.ollamaUrl) {
    out.push({ provider: "ollama", model: keys.ollamaModel, label: `Local · ${keys.ollamaModel}` });
  }
  return out;
}
