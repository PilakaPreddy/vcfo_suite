import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ProjectSnapshot } from '@/data/ask/schema';
import type { LlmProvider, LlmRequest, LlmResult } from '@/lib/ask/provider';

/**
 * Pipeline routing with a mock provider — no live model calls. Covers the
 * cheapest-path-first rules and the guard outcomes.
 */

const appendAskMessage = vi.fn();
const countModelAnswersSince = vi.fn();
const loadStaffData = vi.fn();
let snapshot: ProjectSnapshot;

vi.mock('@/db/repositories/ask-conversations', () => ({
  createAskConversation: (...a: unknown[]) => createAskConversation(...a),
  getAskConversationWithMessages: vi.fn(async () => null),
}));
vi.mock('@/db/repositories/ask-messages', () => ({
  appendAskMessage: (...a: unknown[]) => appendAskMessage(...a),
  countModelAnswersSince: (...a: unknown[]) => countModelAnswersSince(...a),
}));
const loadProjectSnapshot = vi.fn();
const createAskConversation = vi.fn();
vi.mock('@/lib/ask/snapshot', () => ({
  loadProjectSnapshot: (...a: unknown[]) => loadProjectSnapshot(...a),
}));
const defaultSnapshotLoad = () => ({
    snapshot,
    engagementDbId: 'eng-db-1',
    engagementSlug: 'acme',
    state: {},
    filings: [],
});
vi.mock('@/lib/ask/retrieve', () => ({ retrieveSources: vi.fn(async () => []) }));
vi.mock('@/lib/ask/tools/staff-data', () => ({ loadStaffData: (...a: unknown[]) => loadStaffData(...a) }));

const { runAskChat } = await import('@/lib/ask/pipeline');
const { setAskProviderForTests } = await import('@/lib/ask/provider');
const { REFUSAL_COPY } = await import('@/lib/ask/refusals');
const { AskForbiddenError } = await import('@/lib/ask/access');

function ctx(role: AuthContext['role']): AuthContext {
  return { userId: `user-${role}`, email: `${role}@x.test`, name: role, role };
}

function toolUse(name: string, input: unknown, id = `tu-${name}`) {
  return { type: 'tool_use', id, name, input } as unknown as LlmResult['content'][number];
}

function result(content: LlmResult['content'], stopReason = 'tool_use'): LlmResult {
  return { model: 'mock-model', content, stopReason, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } };
}

function mockProvider(replies: LlmResult[]): LlmProvider & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    name: 'mock',
    calls,
    async complete(req) {
      calls.push({ ...req, messages: [...req.messages] });
      const next = replies.shift();
      if (!next) throw new Error('unexpected provider call');
      return next;
    },
  };
}

const guard = (intent: string, extra: Record<string, unknown> = {}) =>
  result([toolUse('classify', { intent, rewrittenQuery: 'q', topicSlug: '', language: 'en', ...extra })]);

async function run(role: AuthContext['role'], request: Parameters<typeof runAskChat>[1]) {
  const events: Array<Record<string, unknown>> = [];
  await runAskChat(ctx(role), request, (e) => events.push(e as Record<string, unknown>));
  const answer = events.find((e) => e.type === 'answer') as { answer: Record<string, unknown> } | undefined;
  return { events, answer: answer?.answer };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASK_VCFO_ENABLED = 'true';
  snapshot = {
    companyName: 'Acme India Private Limited',
    legalForm: 'company',
    residency: 'foreign',
    hasForeignParent: true,
    currentPhase: 'SPICe+ Part B',
    currentStep: { id: 'pre-14', title: 'Registered Office Address', owner: 'client', status: 'waiting on you' },
    completedStepCount: 6,
    totalActiveSteps: 40,
    incorporated: false,
  };
  appendAskMessage.mockImplementation(async () => ({ id: `msg-${appendAskMessage.mock.calls.length}` }));
  countModelAnswersSince.mockResolvedValue(0);
  loadProjectSnapshot.mockImplementation(async () => defaultSnapshotLoad());
  createAskConversation.mockResolvedValue({ id: 'conv-1' });
});

afterEach(() => setAskProviderForTests(undefined));

describe('role gate', () => {
  it.each(['developer'] as const)('rejects %s before any work', async (role) => {
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    await expect(run(role, { shell: 'admin', message: 'hi' })).rejects.toBeInstanceOf(AskForbiddenError);
    expect(provider.calls).toHaveLength(0);
    expect(appendAskMessage).not.toHaveBeenCalled();
  });

  it.each(['manager', 'intern'] as const)('keeps %s out of the client shell', async (role) => {
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    await expect(run(role, { shell: 'client', message: 'hi' })).rejects.toBeInstanceOf(AskForbiddenError);
    expect(provider.calls).toHaveLength(0);
    expect(appendAskMessage).not.toHaveBeenCalled();
  });
});

describe('deterministic paths', () => {
  it('a suggestion makes zero provider calls', async () => {
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', suggestionId: 'client-gst' });
    expect(provider.calls).toHaveLength(0);
    expect(answer?.topicSlug).toBe('gst-basics');
    // Drafts are never badged reviewed.
    expect(answer?.origin).toBe('generated');
    expect(answer?.draft).toBe(true);
  });

  it('"What is my next step?" shows the real current step', async () => {
    setAskProviderForTests(mockProvider([]));
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', suggestionId: 'client-next-step' });
    expect(answer?.origin).toBe('deterministic');
    expect(answer?.visual).toMatchObject({ type: 'nextStep', stepId: 'pre-14', title: 'Registered Office Address' });
    expect(answer?.line).toContain('Registered Office Address');
  });

  it('staff queries are answered from tools without the model', async () => {
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    loadStaffData.mockResolvedValue({ engagements: [], filings: [], now: new Date() });
    const { answer } = await run('admin', { shell: 'admin', suggestionId: 'admin-waiting-on-client' });
    expect(provider.calls).toHaveLength(0);
    expect(answer?.line).toBe('No projects are waiting on client action.');
    expect(answer?.visual).toMatchObject({ type: 'projectRows' });
  });

  it('super admin preview cannot save or hand off', async () => {
    setAskProviderForTests(mockProvider([]));
    const { answer } = await run('super_admin', { shell: 'client', engagementId: 'eng-1', suggestionId: 'client-gst' });
    expect(answer?.actions).not.toContain('save');
    expect(answer?.actions).not.toContain('askLead');
  });
});

describe('guarded free text', () => {
  it('off-topic gets the fixed refusal with no generation call', async () => {
    const provider = mockProvider([guard('off_topic')]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'Write me a Python script' });
    expect(provider.calls).toHaveLength(1);
    expect(answer?.line).toBe(REFUSAL_COPY.offTopicClient);
    expect(answer?.origin).toBe('refusal');
  });

  it('a decision request explains and hands off to the lead', async () => {
    const provider = mockProvider([
      guard('decision_request'),
      result([
        toolUse('render_answer', {
          line: 'GST registration depends on turnover and the kind of supply.',
          citations: [],
          actions: [],
        }),
      ]),
    ]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'Do we need GST?' });
    expect(provider.calls).toHaveLength(2);
    expect(String(answer?.line)).toMatch(/^This is a decision for your firm\./);
    expect(answer?.actions).toContain('askLead');
    expect(String(answer?.line)).not.toMatch(/\b(yes|no),/i);
  });

  it('retries once on an invented date, then falls back safely', async () => {
    const bad = () =>
      result([toolUse('render_answer', { line: 'It is due on 20 October 2026.', citations: [], actions: [] }, `tu-${Math.random()}`)]);
    const provider = mockProvider([guard('explain'), bad(), bad()]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'When is GSTR-3B due?' });
    expect(provider.calls).toHaveLength(3);
    expect(answer?.line).toBe(REFUSAL_COPY.uncertain);
    expect(answer?.actions).toContain('askLead');
    // The retry carried the validation error back to the model.
    const retryMessages = provider.calls[2]!.messages;
    expect(JSON.stringify(retryMessages[retryMessages.length - 1])).toContain('does not come from the calendar');
  });

  it('an invalid visual renders as text only', async () => {
    const provider = mockProvider([
      guard('explain'),
      result([
        toolUse('render_answer', {
          line: 'A registered office is the company address for official notices.',
          visual: { type: 'pie', slices: [1, 2] },
          citations: [],
          actions: [],
        }),
      ]),
    ]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is a registered office?' });
    expect(answer?.line).toContain('registered office');
    expect(answer?.visual).toBeUndefined();
    expect(answer?.origin).toBe('generated');
  });

  it('rate limit stops a model call', async () => {
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    countModelAnswersSince.mockResolvedValue(999);
    const { events } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is DIN?' });
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'rate_limited' });
    expect(provider.calls).toHaveLength(0);
  });

  it('no provider configured → unavailable answer, suggestions still work', async () => {
    setAskProviderForTests(null);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is DIN?' });
    expect(answer?.line).toBe(REFUSAL_COPY.unavailable);
  });

  it('emits progress labels in order', async () => {
    const provider = mockProvider([
      guard('explain'),
      result([toolUse('render_answer', { line: 'DIN is a director number.', citations: [], actions: [] })]),
    ]);
    setAskProviderForTests(provider);
    const { events } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is DIN?' });
    expect(events.filter((e) => e.type === 'status').map((e) => e.label)).toEqual([
      'Checking your project…',
      'Finding sources…',
      'Writing…',
    ]);
  });
});

describe('super admin preview as a client', () => {
  it('is scoped to the chosen engagement and uses only client tools', async () => {
    const provider = mockProvider([
      guard('explain'),
      result([toolUse('render_answer', { line: 'Your company is in SPICe+ Part B.', citations: [], actions: [] })]),
    ]);
    setAskProviderForTests(provider);
    await run('super_admin', { shell: 'client', engagementId: 'eng-chosen', message: 'Where are we?' });
    expect(loadProjectSnapshot).toHaveBeenCalledTimes(1);
    expect(loadProjectSnapshot.mock.calls[0]![1]).toBe('eng-chosen');
    expect(createAskConversation.mock.calls[0]![1]).toMatchObject({ shell: 'client', engagementId: 'eng-db-1' });
    const toolNames = (provider.calls[1]!.tools ?? []).map((t) => t.name);
    expect(toolNames).toContain('getProjectSnapshot');
    expect(toolNames).not.toContain('listWaitingOnClient');
    expect(toolNames).not.toContain('getFirmPulse');
    expect(loadStaffData).not.toHaveBeenCalled();
  });

  it('admin cannot open a client shell', async () => {
    setAskProviderForTests(mockProvider([]));
    await expect(run('admin', { shell: 'client', engagementId: 'eng-1', message: 'hi' })).rejects.toBeInstanceOf(
      AskForbiddenError,
    );
  });
});

describe('go-there links through the pipeline', () => {
  it('a link to a locked step lands on the Incorporation flowchart', async () => {
    setAskProviderForTests(mockProvider([]));
    const { answer } = await run('client', {
      shell: 'client',
      engagementId: 'eng-1',
      context: { kind: 'step', ref: 'pre-13', label: 'Capital Structure' },
    });
    const links = answer?.links as Array<{ dest: { to: string; focusStepId?: string }; label: string }>;
    expect(links[0]).toMatchObject({ dest: { to: 'incorporation', focusStepId: 'pre-13' }, label: 'Open Incorporation' });
  });

  it('super admin preview links stay client-shaped and never reach staff places', async () => {
    setAskProviderForTests(mockProvider([]));
    const { answer } = await run('super_admin', { shell: 'client', engagementId: 'eng-1', suggestionId: 'client-next-step' });
    const tos = (answer?.links as Array<{ dest: { to: string } }>).map((l) => l.dest.to);
    expect(tos.every((t) => ['incorporation', 'step'].includes(t))).toBe(true);
  });
});

describe('C2 explain this document', () => {
  const ask = { shell: 'client' as const, engagementId: 'eng-1', context: { kind: 'document' as const, ref: 'pre-12:panCardFinalUrl', label: 'PAN card' } };

  it('is unavailable while the flag is off', async () => {
    delete process.env.ASK_VCFO_FEATURE_C2;
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', ask);
    expect(answer?.line).toBe(REFUSAL_COPY.unavailable);
    expect(provider.calls).toHaveLength(0);
  });

  it('serves the document-type topic and sends nothing to the provider', async () => {
    process.env.ASK_VCFO_FEATURE_C2 = 'true';
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', ask);
    expect(answer?.topicSlug).toBe('doc-pan-card');
    expect(answer?.visual).toMatchObject({ type: 'keyFacts' });
    expect(provider.calls).toHaveLength(0);
    // An unmapped document type hands off; it still never reaches the model.
    const other = await run('client', { ...ask, context: { kind: 'document', ref: 'x:unknownDocUrl', label: 'Some letter' } });
    expect(other.answer?.actions).toEqual(['askLead']);
    expect(provider.calls).toHaveLength(0);
    delete process.env.ASK_VCFO_FEATURE_C2;
  });
});

describe('"Where is my incorporation now?"', () => {
  it('the suggestion answers with zero provider calls', async () => {
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', suggestionId: 'client-where-now' });
    expect(provider.calls).toHaveLength(0);
    expect(answer?.origin).toBe('deterministic');
    expect(answer?.visual).toMatchObject({ type: 'flow' });
    expect(String(answer?.line)).toMatch(/steps are complete\. You're in SPICe\+ Part A/);
  });

  it('the answer model is offered getPhaseProgress for a client', async () => {
    const provider = mockProvider([
      guard('project_status'),
      result([toolUse('render_answer', { line: 'You are in SPICe+ Part A.', citations: [], actions: [] })]),
    ]);
    setAskProviderForTests(provider);
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'how far along are we' });
    expect((provider.calls[1]!.tools ?? []).map((t) => t.name)).toContain('getPhaseProgress');
  });
});
