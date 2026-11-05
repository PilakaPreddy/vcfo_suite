import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { LlmProvider, LlmResult } from '@/lib/ask/provider';

/**
 * The cheapest path: a strict metric question reaches the number with no model at all. The
 * provider here fails the test if it is ever called, and each role reads its own scoped rows.
 */

const appendAskMessage = vi.fn();
const countModelAnswersSince = vi.fn();
const systemTodayTokenTotal = vi.fn();
const systemRecordAskUsage = vi.fn();
const loadStaffEngagements = vi.fn();
const loadProjectSnapshot = vi.fn();
const listEngagements = vi.fn();

vi.mock('@/db/repositories/ask-conversations', () => ({
  createAskConversation: vi.fn(async () => ({ id: 'conv-1' })),
  getAskConversationWithMessages: vi.fn(async () => null),
}));
vi.mock('@/db/repositories/ask-messages', () => ({
  appendAskMessage: (...a: unknown[]) => appendAskMessage(...a),
  countModelAnswersSince: (...a: unknown[]) => countModelAnswersSince(...a),
}));
vi.mock('@/db/repositories/ask-usage', () => ({
  systemRecordAskUsage: (...a: unknown[]) => systemRecordAskUsage(...a),
  systemTodayTokenTotal: (...a: unknown[]) => systemTodayTokenTotal(...a),
}));
vi.mock('@/lib/ask/snapshot', () => ({ loadProjectSnapshot: (...a: unknown[]) => loadProjectSnapshot(...a) }));
vi.mock('@/lib/ask/retrieve', () => ({ retrieveSources: vi.fn(async () => []) }));
vi.mock('@/lib/ask/tools/staff-data', () => ({
  loadStaffData: vi.fn(async () => ({ engagements: [], filings: [], now: new Date() })),
  loadStaffEngagements: (...a: unknown[]) => loadStaffEngagements(...a),
}));
vi.mock('@/db/repositories/engagements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/repositories/engagements')>()),
  listEngagements: (...a: unknown[]) => listEngagements(...a),
}));

let treatTopicsAsReviewed = false;
vi.mock('@/lib/ask/topics', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/ask/topics')>();
  return { ...original, isReviewed: (topic: Parameters<typeof original.isReviewed>[0]) => treatTopicsAsReviewed || original.isReviewed(topic) };
});

const { runAskChat } = await import('@/lib/ask/pipeline');
const { listTopics } = await import('@/lib/ask/topics');
const { setAskProviderForTests } = await import('@/lib/ask/provider');

const NOW = new Date('2026-11-06T06:00:00Z');
const QUESTION = 'How many companies are incorporated this year?';

const eng = (dbId: string, companyName: string, incorporationDate: string | null) => ({
  dbId,
  engagement: {
    id: dbId,
    slug: dbId,
    companyName,
    incorporationDate,
    stage: incorporationDate ? 'Post-Incorporation' : 'Pre-Incorporation',
    health: 'on-track',
    createdAt: '2026-05-01T00:00:00Z',
  },
  state: {},
});

/** What the scoped repository would hand each role: the firm, a manager's two, a lead's one, a client's own. */
const SCOPED: Record<string, ReturnType<typeof eng>[]> = {
  super_admin: [eng('a', 'Alpha Pvt Ltd', '2026-05-01'), eng('b', 'Beta Pvt Ltd', '2026-07-10'), eng('c', 'Gamma Pvt Ltd', '2026-09-18'), eng('d', 'Delta Pvt Ltd', '2025-11-20')],
  admin: [eng('a', 'Alpha Pvt Ltd', '2026-05-01'), eng('b', 'Beta Pvt Ltd', '2026-07-10'), eng('c', 'Gamma Pvt Ltd', '2026-09-18'), eng('d', 'Delta Pvt Ltd', '2025-11-20')],
  manager: [eng('a', 'Alpha Pvt Ltd', '2026-05-01'), eng('d', 'Delta Pvt Ltd', '2025-11-20')],
  intern: [eng('d', 'Delta Pvt Ltd', '2025-11-20')],
  client: [eng('b', 'Beta Pvt Ltd', '2026-07-10')],
};

const ctx = (role: AuthContext['role']): AuthContext => ({ userId: `user-${role}`, email: `${role}@x.test`, name: role, role });

function failingProvider() {
  const provider: LlmProvider = {
    name: 'mock',
    complete: vi.fn(async () => {
      throw new Error('the provider must not be called');
    }),
  };
  return provider;
}

function routerProvider(reply: Record<string, unknown>) {
  const result: LlmResult = {
    model: 'mock-router',
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    content: [
      {
        type: 'text',
        text: JSON.stringify({ rewrittenQuery: 'q', topicSlug: '', language: 'en', metric: '', company: '', ...reply }),
      } as unknown as LlmResult['content'][number],
    ],
  };
  const provider: LlmProvider = { name: 'mock', complete: vi.fn(async () => result) };
  return provider;
}

async function ask(role: AuthContext['role'], message: string, shell?: 'client' | 'admin' | 'super') {
  const persona = shell ?? (role === 'client' ? 'client' : role === 'super_admin' ? 'super' : 'admin');
  const events: Array<Record<string, unknown>> = [];
  await runAskChat(
    ctx(role),
    { shell: persona, message, depth: 'normal', ...(persona === 'client' ? { engagementId: 'b' } : {}) },
    (e) => events.push(e as Record<string, unknown>),
  );
  const event = events.find((e) => e.type === 'answer') as { answer: Record<string, any> } | undefined;
  const stored = appendAskMessage.mock.calls.map((c) => c[2]).find((m) => m.sender === 'assistant');
  return { answer: event?.answer, path: stored?.path as string | undefined, model: stored?.model };
}

beforeEach(() => {
  vi.clearAllMocks();
  treatTopicsAsReviewed = false;
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  process.env.ASK_VCFO_ENABLED = 'true';
  appendAskMessage.mockImplementation(async () => ({ id: 'msg-1' }));
  countModelAnswersSince.mockResolvedValue(0);
  systemRecordAskUsage.mockResolvedValue(undefined);
  systemTodayTokenTotal.mockResolvedValue(0);
  loadStaffEngagements.mockImplementation(async (c: AuthContext) => SCOPED[c.role]);
  listEngagements.mockImplementation(async (c: AuthContext) =>
    SCOPED[c.role]!.map((e) => ({ ...e.engagement, id: e.dbId, deletedAt: null, schedule: null, createdAt: NOW, updatedAt: NOW })),
  );
  loadProjectSnapshot.mockResolvedValue({
    snapshot: { companyName: 'Beta Pvt Ltd', legalForm: 'company', residency: 'domestic', hasForeignParent: false, currentPhase: 'x', completedStepCount: 1, totalActiveSteps: 2, incorporated: true },
    engagementDbId: 'b',
    engagementSlug: 'b',
    state: {},
    filings: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  setAskProviderForTests(undefined);
  vi.unstubAllEnvs();
});

describe('a strict metric question spends no model', () => {
  it.each([
    ['super_admin', '3 companies were incorporated in FY 2026-27 across the firm.'],
    ['admin', '3 companies were incorporated in FY 2026-27 across the firm.'],
    ['manager', '1 company was incorporated in FY 2026-27 on your projects.'],
    ['intern', 'No companies were incorporated in FY 2026-27 on your projects.'],
    ['client', 'Your company, Beta Pvt Ltd, was incorporated on 10 Jul 2026.'],
  ] as const)('%s gets the exact, scoped number', async (role, line) => {
    const provider = failingProvider();
    setAskProviderForTests(provider);
    const { answer, path, model } = await ask(role, QUESTION);
    expect(provider.complete).not.toHaveBeenCalled();
    expect(answer?.line).toBe(line);
    expect(answer?.origin).toBe('deterministic');
    expect(path).toBe('metric_local');
    expect(model).toBeNull();
  });

  it('works with no model configured at all', async () => {
    setAskProviderForTests(null);
    const { answer, path } = await ask('admin', QUESTION);
    expect(path).toBe('metric_local');
    expect(answer?.line).toContain('3 companies');
  });

  it('reads Hinglish the same way', async () => {
    const provider = failingProvider();
    setAskProviderForTests(provider);
    const { answer, path } = await ask('admin', 'is saal kitni companies incorporate hui?');
    expect(provider.complete).not.toHaveBeenCalled();
    expect(path).toBe('metric_local');
    expect(answer?.line).toContain('3 companies');
  });

  it('still answers once the daily model budget is spent, and counts nothing against the rate limit', async () => {
    systemTodayTokenTotal.mockResolvedValue(Number.MAX_SAFE_INTEGER);
    setAskProviderForTests(failingProvider());
    const { path } = await ask('admin', QUESTION);
    expect(path).toBe('metric_local');
    expect(countModelAnswersSince).not.toHaveBeenCalled();
  });

  it('narrows to a named company inside the caller\'s scope', async () => {
    setAskProviderForTests(failingProvider());
    const { answer } = await ask('admin', 'How many companies are incorporated this year for Beta?');
    expect(answer?.line).toBe('1 company was incorporated in FY 2026-27 for Beta Pvt Ltd.');
  });

  it('answers a greeting locally', async () => {
    const provider = failingProvider();
    setAskProviderForTests(provider);
    const { path } = await ask('manager', 'Hello!');
    expect(path).toBe('greeting_local');
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('obeys the path kill switch', async () => {
    vi.stubEnv('ASK_KILL_PATHS', 'metric_local');
    setAskProviderForTests(failingProvider());
    const { answer, path } = await ask('admin', QUESTION);
    expect(path).toBe('metric_local');
    expect(answer?.line).not.toContain('3 companies');
  });
});

describe('a topic asked word for word', () => {
  const question = () => listTopics().find((t) => t.audience !== 'client' && !/^(do|does|should|can|is|are)\b/i.test(t.question))!.question;

  it('answers from the reviewed copy with no model', async () => {
    treatTopicsAsReviewed = true;
    const provider = failingProvider();
    setAskProviderForTests(provider);
    const { path, answer } = await ask('admin', question());
    expect(provider.complete).not.toHaveBeenCalled();
    expect(path).toBe('topic_local');
    expect(answer?.topicSlug).toBeTruthy();
  });

  it('goes to the router while the topic is still a draft', async () => {
    const provider = routerProvider({ intent: 'off_topic' });
    setAskProviderForTests(provider);
    const { path } = await ask('admin', question());
    expect(provider.complete).toHaveBeenCalled();
    expect(path).toBe('router_refusal');
  });
});

describe('anything else goes to the router', () => {
  it.each([
    'Why are filings overdue?',
    'How many companies are incorporated this year and why so few?',
    'How many companies are incorporated this year for Omega?',
    'How many companies were not incorporated?x',
  ])('%s', async (message) => {
    const provider = routerProvider({ intent: 'off_topic' });
    setAskProviderForTests(provider);
    const { path } = await ask('admin', message);
    expect(provider.complete).toHaveBeenCalled();
    expect(path).toBe('router_refusal');
  });

  it('does not let another firm\'s company name reach a lead\'s number', async () => {
    const provider = routerProvider({ intent: 'off_topic' });
    setAskProviderForTests(provider);
    const { path } = await ask('intern', 'overdue filings for Alpha');
    expect(provider.complete).toHaveBeenCalled();
    expect(path).toBe('router_refusal');
  });

  it('falls through when a metric cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    loadStaffEngagements.mockRejectedValueOnce(new Error('database down'));
    const provider = routerProvider({ intent: 'off_topic' });
    setAskProviderForTests(provider);
    const { path } = await ask('admin', QUESTION);
    expect(provider.complete).toHaveBeenCalled();
    expect(path).toBe('router_refusal');
    expect(error).toHaveBeenCalled();
  });
});

describe('the router may only pick a name', () => {
  it('runs the named metric with code-read filters and spends only the router call', async () => {
    const provider = routerProvider({
      intent: 'fact',
      metric: 'companies.incorporated',
      rewrittenQuery: 'How many businesses were set up last financial year?',
    });
    setAskProviderForTests(provider);
    const { answer, path } = await ask('admin', 'Businesses we set up last financial year, roughly how many?');
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(path).toBe('router_metric');
    expect(answer?.line).toBe('1 company was incorporated in FY 2025-26 across the firm.');
  });

  it('offers only the metrics the role may read', async () => {
    const provider = routerProvider({ intent: 'off_topic' });
    setAskProviderForTests(provider);
    await ask('client', 'Something the code cannot match');
    const system = JSON.stringify(vi.mocked(provider.complete).mock.calls[0]![0].system);
    expect(system).toContain('filings.overdue');
    expect(system).not.toContain('invoices.outstanding');
    expect(system).not.toContain('approvals.pending');
  });

  it('ignores a metric name the model made up, or one this role lacks', async () => {
    for (const metric of ['companies.deleted', 'invoices.outstanding']) {
      const provider = {
        name: 'mock',
        complete: vi
          .fn()
          .mockResolvedValueOnce(await routerProvider({ intent: 'fact', metric }).complete({} as never))
          .mockRejectedValue(new Error('stop after the router')),
      } as unknown as LlmProvider;
      setAskProviderForTests(provider);
      appendAskMessage.mockClear();
      const { path } = await ask('intern', 'Something the code cannot match');
      expect(path).not.toBe('router_metric');
    }
  });

  it('refuses to answer when the company the router read is not in scope', async () => {
    const provider = {
      name: 'mock',
      complete: vi
        .fn()
        .mockResolvedValueOnce(await routerProvider({ intent: 'fact', metric: 'filings.overdue', company: 'Alpha' }).complete({} as never))
        .mockRejectedValue(new Error('stop after the router')),
    } as unknown as LlmProvider;
    setAskProviderForTests(provider);
    const { path } = await ask('intern', 'Something the code cannot match');
    expect(path).not.toBe('router_metric');
  });
});
