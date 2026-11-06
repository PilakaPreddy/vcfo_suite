import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider, LlmRequest, LlmResult } from '@/lib/ask/provider';
import { addLlmUsage, NO_LLM_USAGE, outputConfigFor, toLlmResult } from '@/lib/ask/provider';
import { createAnthropicProvider } from '@/lib/ask/provider/anthropic';
import { meterProvider } from '@/lib/ask/provider/meter';
import { estimateCostUsd, totalTokens } from '@/lib/ask/provider/pricing';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create: (...a: unknown[]) => create(...a) } };
  },
}));

const apiResponse = (extra: Record<string, unknown> = {}) => ({
  model: 'claude-haiku-5-5',
  content: [{ type: 'text', text: 'hi' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 7 },
  ...extra,
});

const secret = {
  envVar: 'X',
  secretIdVar: 'Y',
  get: async () => 'key',
  invalidate: () => undefined,
  source: () => 'env' as const,
  configured: () => true,
};

const request = (model: string, extra: Partial<LlmRequest> = {}): LlmRequest => ({ model, system: [], messages: [], maxTokens: 10, ...extra });

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue(apiResponse());
});

describe('response mapping', () => {
  it('reports cache writes apart from input', () => {
    expect(toLlmResult(apiResponse() as never).usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 7 });
  });

  it('a refusal carries no content', () => {
    const result = toLlmResult(apiResponse({ stop_reason: 'refusal' }) as never);
    expect(result.stopReason).toBe('refusal');
    expect(result.content).toEqual([]);
  });
});

describe('request shape', () => {
  it('sends output_config only when effort or a schema is set', () => {
    expect(outputConfigFor(request('m'))).toEqual({});
    expect(outputConfigFor(request('m', { effort: 'low' }))).toEqual({ output_config: { effort: 'low' } });
    expect(outputConfigFor(request('m', { outputSchema: { type: 'object' } }))).toEqual({
      output_config: { format: { type: 'json_schema', schema: { type: 'object' } } },
    });
  });

  it('asks for the refusal fallback on Sonnet but never on Haiku, which has none', async () => {
    const provider = createAnthropicProvider({ refusalFallback: true, apiKey: secret });
    await provider.complete(request('claude-sonnet-5-5'));
    expect(create.mock.calls[0]![0]).toMatchObject({ fallbacks: 'default' });
    await provider.complete(request('claude-haiku-5-5'));
    expect(create.mock.calls[1]![0]).not.toHaveProperty('fallbacks');
    expect(create.mock.calls[1]![0]).not.toHaveProperty('betas');
  });

  it('turns thinking off only when asked', async () => {
    const provider = createAnthropicProvider({ refusalFallback: false, apiKey: secret });
    await provider.complete(request('claude-haiku-5-5', { thinking: 'off' }));
    expect(create.mock.calls[0]![0]).toMatchObject({ thinking: { type: 'disabled' } });
    await provider.complete(request('claude-haiku-5-5'));
    expect(create.mock.calls[1]![0]).not.toHaveProperty('thinking');
  });
});

describe('metering', () => {
  const usage = { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50, cacheWriteTokens: 20 };
  const reply = (model: string): LlmResult => ({ model, content: [], stopReason: 'end_turn', usage });

  it('adds up per model and keeps what was spent before a later call fails', async () => {
    const complete = vi
      .fn<LlmProvider['complete']>()
      .mockResolvedValueOnce(reply('haiku'))
      .mockResolvedValueOnce(reply('haiku'))
      .mockResolvedValueOnce(reply('sonnet'))
      .mockRejectedValueOnce(new Error('down'));
    const metered = meterProvider({ name: 'mock', complete });
    await metered.complete(request('haiku'));
    await metered.complete(request('haiku'));
    await metered.complete(request('sonnet'));
    await expect(metered.complete(request('sonnet'))).rejects.toThrow('down');
    expect(metered.lastModel()).toBe('sonnet');
    expect(metered.spend()).toEqual([
      { model: 'haiku', calls: 2, usage: addLlmUsage(usage, usage) },
      { model: 'sonnet', calls: 1, usage },
    ]);
  });
});

describe('pricing', () => {
  it('prices cache reads and writes against the model card', () => {
    expect(estimateCostUsd('claude-haiku-5-5', { ...NO_LLM_USAGE, inputTokens: 1_000_000 })).toBeCloseTo(0.1);
    expect(estimateCostUsd('claude-sonnet-5-5', { ...NO_LLM_USAGE, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.2);
    expect(estimateCostUsd('claude-sonnet-5-5', { ...NO_LLM_USAGE, cacheWriteTokens: 1_000_000 })).toBeCloseTo(2.5);
    expect(estimateCostUsd('unknown', { ...NO_LLM_USAGE, inputTokens: 1_000_000 })).toBe(0);
  });

  it('counts every token the model read or wrote', () => {
    expect(totalTokens({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 })).toBe(10);
  });
});
