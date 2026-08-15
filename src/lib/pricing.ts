import type { Usage } from "./types";

/**
 * USD per 1M tokens: [input, output].
 *
 * ⚠️ EDIT ME. Prices change and this table WILL drift. Treat every number
 * as an estimate and verify against your provider's pricing page.
 * Unknown models return null cost (shown as "n/a" in the UI) rather than
 * a made-up number.
 */
export const PRICES: Record<string, [number, number]> = {
  // OpenAI
  "gpt-5": [1.25, 10],
  "gpt-5-mini": [0.25, 2],
  "gpt-5-nano": [0.05, 0.4],
  "gpt-4o": [2.5, 10],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1": [2, 8],
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1-nano": [0.1, 0.4],
  "o3": [2, 8],
  "o4-mini": [1.1, 4.4],
  // Anthropic
  "claude-sonnet-4-6": [3, 15],
  "claude-sonnet-4-5": [3, 15],
  "claude-haiku-4-5": [1, 5],
  "claude-haiku-4-5-20251001": [1, 5],
  "claude-opus-4-1": [15, 75],
  // Local
  "__local__": [0, 0],
};

/** Fetched model IDs are often date-stamped (claude-sonnet-4-5-20250929) or
 *  "-latest" aliases; normalize before lookup so pricing still resolves. */
function lookupPrice(model: string): [number, number] | undefined {
  if (PRICES[model]) return PRICES[model];
  const stripped = model.replace(/-latest$/, "").replace(/-20\d{6}$/, "");
  return PRICES[stripped];
}

export function estimateCost(model: string, usage: Usage, isLocal: boolean): number | null {
  const price = isLocal ? PRICES["__local__"] : lookupPrice(model);
  if (!price) return null;
  return (usage.inputTokens / 1_000_000) * price[0] + (usage.outputTokens / 1_000_000) * price[1];
}

/** Rough token estimate when the provider doesn't report usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function fmtUsd(v: number | null): string {
  if (v === null) return "n/a";
  if (v === 0) return "$0.00";
  return v < 0.01 ? `<$0.01` : `$${v.toFixed(2)}`;
}
