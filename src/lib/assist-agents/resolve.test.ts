import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider, LlmRequest } from '@/lib/ask/provider';

const todayTotal = vi.fn();
const recordUsage = vi.fn();
vi.mock('@/db/repositories/ask-usage', () => ({
  systemTodayTokenTotal: (...a: unknown[]) => todayTotal(...a),
  systemRecordAskUsage: (...a: unknown[]) => recordUsage(...a),
}));

const { setAskProviderForTests } = await import('@/lib/ask/provider');
const { AssistResolveRefused, fuzzyMatchCandidate, resolveField } = await import('./resolve');
const { looksLikePersonalData } = await import('./pii');

const CANDIDATES = [
  { i: 0, label: 'Type of company', name: 'companyType' },
  { i: 1, label: 'Proposed Name 1', name: 'proposedName1' },
  { i: 2, label: 'Proposed Name 2', name: 'proposedName2' },
  { i: 3, label: 'Significance of key/coined word(s)', name: 'significance' },
];
const input = (over: Record<string, unknown> = {}) => ({
  fieldKey: 'company.proposedNames[0]',
  fieldLabel: 'Proposed name (1)',
  candidates: CANDIDATES,
  recipeId: 'spice-a',
  ...over,
});

function fakeProvider(reply: string, usage = { inputTokens: 900, outputTokens: 12 }) {
  const calls: LlmRequest[] = [];
  const provider: LlmProvider = {
    name: 'fake',
    async complete(req) {
      calls.push(req);
      return { model: req.model, content: [{ type: 'text', text: reply, citations: null }] as never, stopReason: 'end_turn', usage: { ...usage, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
  return { provider, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  todayTotal.mockResolvedValue(0);
  recordUsage.mockResolvedValue(undefined);
});
afterEach(() => setAskProviderForTests(undefined));

describe('personal data check', () => {
  it.each([
    ['PAN', 'ABCDE1234F'],
    ['Aadhaar', '2345 6789 0123'],
    ['email', 'director@example.com'],
    ['phone', '+91 98765 43210'],
    ['bare phone', '9876543210'],
    ['DIN', 'DIN 01234567'],
    ['bare DIN', '01234567'],
  ])('flags a %s', (_kind, text) => {
    expect(looksLikePersonalData(`Value ${text}`)).toBe(true);
  });

  it('lets ordinary labels and SOM names through', () => {
    for (const text of ['Proposed Name 1', 'guide[0].guide1[0].guideRootPanel[0].proposedName1[0]', 'Main division of industrial activity', 'NIC 62011']) {
      expect(looksLikePersonalData(text)).toBe(false);
    }
  });
});

describe('resolveField', () => {
  it.each([
    ['a PAN in a candidate label', input({ candidates: [...CANDIDATES, { i: 9, label: 'ABCDE1234F' }] })],
    ['an email in an aria label', input({ candidates: [{ i: 0, label: 'Email', aria: 'a@b.co' }] })],
    ['a phone number in the field label', input({ fieldLabel: 'Mobile 9876543210' })],
    ['an Aadhaar number in a name', input({ candidates: [{ i: 0, label: 'Aadhaar', name: '234567890123' }] })],
  ])('refuses %s before any model call', async (_case, payload) => {
    const { provider, calls } = fakeProvider('{"choice":1,"confidence":0.9}');
    setAskProviderForTests(provider);
    await expect(resolveField(payload)).rejects.toBeInstanceOf(AssistResolveRefused);
    expect(calls).toHaveLength(0);
  });

  it('refuses more than 40 candidates and an unknown recipe', async () => {
    setAskProviderForTests(null);
    const many = Array.from({ length: 41 }, (_, i) => ({ i, label: `Field ${i}` }));
    await expect(resolveField(input({ candidates: many }))).rejects.toThrow();
    await expect(resolveField(input({ recipeId: 'nope' }))).rejects.toThrow('unknown_recipe');
  });

  it('falls back to the fuzzy label match (T1) without a model', async () => {
    setAskProviderForTests(null);
    const result = await resolveField(input());
    expect(result).toMatchObject({ choice: 1, tier: 'T1', tokens: 0, aiCalls: 0 });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('falls back to T1 when the daily budget is nearly spent', async () => {
    const { provider, calls } = fakeProvider('{"choice":2,"confidence":0.9}');
    setAskProviderForTests(provider);
    todayTotal.mockResolvedValue(10_000_000);
    expect((await resolveField(input())).tier).toBe('T1');
    expect(calls).toHaveLength(0);
  });

  it('falls back to T1 when the run may not spend', async () => {
    const { provider, calls } = fakeProvider('{"choice":2,"confidence":0.9}');
    setAskProviderForTests(provider);
    expect((await resolveField(input(), { allowModel: false })).tier).toBe('T1');
    expect(calls).toHaveLength(0);
  });

  it('asks the model with labels only and a strict schema, and meters the call', async () => {
    const { provider, calls } = fakeProvider('{"choice":2,"confidence":0.8}');
    setAskProviderForTests(provider);
    const result = await resolveField(input({ fieldLabel: 'Second name proposed' }));
    expect(result).toEqual({ choice: 2, confidence: 0.8, tier: 'T3', tokens: 912, aiCalls: 1 });
    const req = calls[0]!;
    expect(req.model).toMatch(/haiku/);
    expect(req.outputSchema).toMatchObject({ required: ['choice', 'confidence'] });
    expect(JSON.stringify(req.messages)).not.toMatch(/value/i);
    expect(recordUsage).toHaveBeenCalledWith('assist_resolve', [expect.objectContaining({ calls: 1 })], expect.any(Date));
  });

  it('drops a pick the model was not offered', async () => {
    const { provider } = fakeProvider('{"choice":17,"confidence":0.99}');
    setAskProviderForTests(provider);
    expect(await resolveField(input())).toMatchObject({ choice: null, tier: 'T3' });
  });

  it('uses the label match when the model reply is not JSON', async () => {
    const { provider } = fakeProvider('click submit now');
    setAskProviderForTests(provider);
    expect(await resolveField(input())).toMatchObject({ choice: 1, tier: 'T1', aiCalls: 1, tokens: 912 });
  });
});

describe('fuzzyMatchCandidate', () => {
  it('matches a reworded label, the field key or the element name', () => {
    expect(fuzzyMatchCandidate('Type of the company', 'company.type', CANDIDATES).choice).toBe(0);
    expect(fuzzyMatchCandidate('Significance', 'company.nameSignificance', CANDIDATES).choice).toBe(3);
  });

  it('returns null on a tie or when nothing is close', () => {
    expect(fuzzyMatchCandidate('Proposed name', 'company.x', CANDIDATES).choice).toBeNull();
    expect(fuzzyMatchCandidate('Registered office pincode', 'registeredOffice.pincode', CANDIDATES).choice).toBeNull();
  });
});
