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
  "gpt-4o": [2.5, 10],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1": [2, 8],
  "gpt-4.1-mini": [0.4, 1.6],
  // Anthropic
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-4-5-20251001": [1, 5],
  // Local
  "__local__": [0, 0],
};

export function estimateCost(model: string, usage: Usage, isLocal: boolean): number | null {
  const price = isLocal ? PRICES["__local__"] : PRICES[model];
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
