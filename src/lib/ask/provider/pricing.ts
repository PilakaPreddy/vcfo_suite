import type { LlmUsage } from './index';

/**
 * List prices in USD per million tokens, for reports only; a bill can differ (Bedrock has its own
 * rates). Cache reads cost 0.1x of input and 5-minute cache writes 1.25x. An unknown model costs 0.
 */
const PRICES: ReadonlyArray<{ match: string; input: number; output: number }> = [
  { match: 'haiku-5-5', input: 0.1, output: 0.5 },
  { match: 'haiku-4-5', input: 1, output: 5 },
  { match: 'sonnet-5-5', input: 2, output: 10 },
];

export function estimateCostUsd(model: string, usage: LlmUsage): number {
  const price = PRICES.find((p) => model.includes(p.match));
  if (!price) return 0;
  const input = usage.inputTokens + usage.cacheReadTokens * 0.1 + usage.cacheWriteTokens * 1.25;
  return (input * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/** Everything the model read or wrote, cached or not. */
export function totalTokens(usage: LlmUsage): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}
