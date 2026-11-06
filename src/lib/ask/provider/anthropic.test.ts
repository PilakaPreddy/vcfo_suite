// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/secrets/app-secrets', () => ({ anthropicApiKey: {} }));
vi.mock('@/lib/secrets/runtime-secret', () => ({ withSecretRetry: (_secret: unknown, run: (key: string) => unknown) => run('key') }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const { createAnthropicProvider } = await import('./anthropic');

const ask = (model: string) => createAnthropicProvider({ refusalFallback: true }).complete({ model, maxTokens: 10, system: [], messages: [] });

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ model: 'm', content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
});

describe('the refusal fallback', () => {
  it('is left off Haiku, which has no server-side fallback', async () => {
    await ask('claude-haiku-5-5');
    expect(create.mock.calls[0]![0]).not.toHaveProperty('fallbacks');
    expect(create.mock.calls[0]![0]).not.toHaveProperty('betas');
  });

  it('stays on for the larger models', async () => {
    await ask('claude-sonnet-5-5');
    expect(create.mock.calls[0]![0]).toMatchObject({ fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
  });
});
