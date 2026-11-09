import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { LlmRequest } from '@/lib/ask/provider';

/** The run's token budget: checked before every model call, counted across invocations, stored as over_budget. */

const lead: AuthContext = { userId: 'lead-1', email: 'l@x.test', name: 'Lead', role: 'intern' };
const updates: Array<Record<string, unknown>> = [];
let daily = 0;

vi.mock('@/db/repositories/ask-runs', () => ({ updateAskRun: async (_c: unknown, _id: string, patch: Record<string, unknown>) => void updates.push(patch) }));
vi.mock('@/db/repositories/ask-usage', () => ({ systemTodayTokenTotal: async () => daily, systemRecordAskUsage: async () => undefined }));
vi.mock('@/lib/ask/rate-limit', () => ({ checkAskRateLimit: async () => ({ ok: true }) }));
const calls: LlmRequest[] = [];
vi.mock('@/lib/ask/provider', async (load) => ({
  ...(await load<object>()),
  getAskProvider: async () => ({
    name: 'mock',
    complete: async (req: LlmRequest) => {
      calls.push(req);
      return { model: req.model, content: [], stopReason: 'end_turn', usage: { inputTokens: 6, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  }),
}));

const { createRunContext, RunOverBudget } = await import('./run-context');
const ask = (provider: Awaited<ReturnType<ReturnType<typeof createRunContext>['provider']>>) => provider.complete({ model: 'm', messages: [] } as unknown as LlmRequest);

beforeEach(() => {
  updates.length = 0;
  calls.length = 0;
  daily = 0;
});

describe('createRunContext', () => {
  it('refuses the call that would start past the budget and stores over_budget', async () => {
    const rc = createRunContext({ ctx: lead, run: { id: 'r', budgetTokens: 15, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, now: new Date() });
    const provider = await rc.provider();
    await ask(provider);
    await ask(provider);
    await expect(ask(provider)).rejects.toBeInstanceOf(RunOverBudget);
    expect(calls).toHaveLength(2);
    expect(rc.overBudget()).toBe(true);
    expect(await rc.close('done')).toBe('over_budget');
    expect(updates[0]).toMatchObject({ status: 'over_budget', inputTokens: 12, outputTokens: 8 });
  });

  it('counts what earlier invocations of the run already spent', async () => {
    const rc = createRunContext({ ctx: lead, run: { id: 'r', budgetTokens: 100, inputTokens: 60, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 }, now: new Date() });
    await expect(rc.provider()).rejects.toBeInstanceOf(RunOverBudget);
    expect(calls).toHaveLength(0);
  });

  it('keeps a run waiting for a reply open, and adds the new spend to the stored totals', async () => {
    const rc = createRunContext({ ctx: lead, run: { id: 'r', budgetTokens: 1000, inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, now: new Date() });
    await ask(await rc.provider());
    expect(await rc.close('waiting_reply')).toBe('waiting_reply');
    expect(updates[0]).toMatchObject({ inputTokens: 11, outputTokens: 9 });
    expect(updates[0]).not.toHaveProperty('finishedAt');
  });

  it('checks the daily budget before each call', async () => {
    const rc = createRunContext({ ctx: lead, run: { id: 'r', budgetTokens: 1000, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, now: new Date() });
    const provider = await rc.provider();
    await ask(provider);
    daily = 10_000_000;
    await expect(ask(provider)).rejects.toThrow(/usage limit/);
    expect(rc.overBudget()).toBe(false);
  });
});
