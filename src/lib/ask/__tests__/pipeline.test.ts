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
  getAskConversationWithMessages: (...a: unknown[]) => getAskConversationWithMessages(...a),
}));
vi.mock('@/db/repositories/ask-messages', () => ({
  appendAskMessage: (...a: unknown[]) => appendAskMessage(...a),
  countModelAnswersSince: (...a: unknown[]) => countModelAnswersSince(...a),
}));
const getAskConversationWithMessages = vi.fn();
const systemRecordAskUsage = vi.fn();
const systemTodayTokenTotal = vi.fn();
vi.mock('@/db/repositories/ask-runs', () => ({ findWaitingAskRun: vi.fn(async () => null) }));
vi.mock('@/db/repositories/ask-usage', () => ({
  systemRecordAskUsage: (...a: unknown[]) => systemRecordAskUsage(...a),
  systemTodayTokenTotal: (...a: unknown[]) => systemTodayTokenTotal(...a),
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
vi.mock('@/db/repositories/ask-saved-answers', () => ({ findSavedAnswer: vi.fn(async () => null), saveAnswer: vi.fn(async () => undefined) }));
vi.mock('@/lib/ask/knowledge-version', () => ({ currentKnowledgeVersion: vi.fn(async () => 'kv') }));
vi.mock('@/lib/ask/retrieve', () => ({ retrieveSources: vi.fn(async () => []) }));
const { retrieveSources: retrieveSourcesMock } = vi.mocked(await import('@/lib/ask/retrieve'));
vi.mock('@/lib/ask/tools/staff-data', () => ({
  loadStaffData: (...a: unknown[]) => loadStaffData(...a),
  loadStaffEngagements: vi.fn(async () => []),
}));

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
  result(
    [{ type: 'text', text: JSON.stringify({ intent, rewrittenQuery: 'q', topicSlug: '', language: 'en', ...extra }) } as unknown as LlmResult['content'][number]],
    'end_turn',
  );

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
  getAskConversationWithMessages.mockResolvedValue(null);
  loadStaffData.mockResolvedValue({ engagements: [], filings: [], now: new Date() });
  systemRecordAskUsage.mockResolvedValue(undefined);
  systemTodayTokenTotal.mockResolvedValue(0);
  loadProjectSnapshot.mockImplementation(async () => defaultSnapshotLoad());
  createAskConversation.mockResolvedValue({ id: 'conv-1' });
});

afterEach(() => {
  setAskProviderForTests(undefined);
  vi.unstubAllEnvs();
});

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
    expect(toolNames).toContain('getPhaseProgress');
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

describe('path, usage and limits', () => {
  const lastStored = () => appendAskMessage.mock.calls.at(-1)![2] as Record<string, unknown>;
  const rendered = (extra: Record<string, unknown> = {}) =>
    result([toolUse('render_answer', { line: 'A DIN identifies a director.', citations: [], actions: [], ...extra })]);

  it('records the path of a suggestion, with no usage row', async () => {
    setAskProviderForTests(mockProvider([]));
    await run('client', { shell: 'client', engagementId: 'eng-1', suggestionId: 'client-next-step' });
    expect(lastStored()).toMatchObject({ path: 'suggestion', model: null, inputTokens: null });
    expect(systemRecordAskUsage).not.toHaveBeenCalled();
  });

  it('records a refusal against the router, usage included', async () => {
    setAskProviderForTests(mockProvider([guard('off_topic')]));
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'write me a poem' });
    expect(lastStored()).toMatchObject({ path: 'router_refusal', inputTokens: 10, cacheWriteTokens: 0 });
    expect(systemRecordAskUsage.mock.calls[0]![0]).toBe('router_refusal');
    expect(systemRecordAskUsage.mock.calls[0]![1]).toMatchObject([{ model: 'mock-model', calls: 1 }]);
  });

  it('adds the router and the answer call together, and tells document from tool answers', async () => {
    setAskProviderForTests(mockProvider([guard('explain'), rendered()]));
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is a DIN?' });
    expect(lastStored()).toMatchObject({ path: 'document_answer', inputTokens: 20, outputTokens: 10 });

    setAskProviderForTests(mockProvider([guard('project_status'), result([toolUse('getPhaseProgress', {})]), rendered()]));
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'Where are we?' });
    expect(lastStored()).toMatchObject({ path: 'tool_answer', inputTokens: 30 });
  });

  it('a refused router call counts as unsafe, and a malformed one as explain', async () => {
    setAskProviderForTests(mockProvider([result([], 'refusal')]));
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'something' });
    expect(lastStored()).toMatchObject({ path: 'router_refusal', origin: 'refusal' });

    setAskProviderForTests(mockProvider([result([{ type: 'text', text: 'not json' } as never], 'end_turn'), rendered()]));
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is a DIN?' });
    expect(lastStored()).toMatchObject({ path: 'document_answer' });
  });

  it('asks to do work that no action covers get the list of what works, and no generation', async () => {
    const none = result([{ type: 'text', text: JSON.stringify({ action: 'none', company: '', step: '', title: '', status: '', dueDate: '', note: '', subject: '', body: '', assignToMe: false }) } as unknown as LlmResult['content'][number]], 'end_turn');
    const provider = mockProvider([guard('do_work'), none]);
    setAskProviderForTests(provider);
    const { answer } = await run('admin', { shell: 'admin', message: 'Send the reminder' });
    // The router, then the action reader; no answer generation.
    expect(provider.calls).toHaveLength(2);
    expect(String(answer?.line).startsWith(REFUSAL_COPY.doWorkStaff)).toBe(true);
    expect(answer?.line).not.toMatch(/lead/i);
  });

  it('a client asking for work still gets the plain refusal', async () => {
    const provider = mockProvider([guard('do_work')]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'Send the reminder' });
    expect(answer?.line).toBe(REFUSAL_COPY.doWork);
  });

  it('answers "what can you do?" from code, with no model call', async () => {
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    const { answer } = await run('admin', { shell: 'admin', message: 'what are the things you can do from chat in spice a' });
    expect(provider.calls).toHaveLength(0);
    expect(answer?.origin).toBe('deterministic');
    expect(answer?.line).toContain('Nothing saves until you approve');
    expect(answer?.line).not.toMatch(/read only|your (project )?lead/i);
    expect(lastStored()).toMatchObject({ path: 'greeting_local' });
  });

  it('gives the staff model staff rules: no "ask your lead", and the real list of changes', async () => {
    const provider = mockProvider([guard('explain'), rendered()]);
    setAskProviderForTests(provider);
    await run('intern', { shell: 'admin', message: 'Explain the stamp duty rule for Part A' });
    const system = provider.calls[1]!.system.map((b) => b.text).join('\n');
    expect(system).not.toMatch(/project lead can confirm|add the askLead action/);
    expect(system).toContain('never tell them to ask or check with their project lead');
    expect(system).toContain('Fill checklist answers');
    expect(system).not.toMatch(/read-only/);
  });

  it('drops citations from an answer that says it is not certain', async () => {
    retrieveSourcesMock.mockResolvedValueOnce([{ id: 'src-1', kind: 'chunk', label: 'SPICe+ Part A', text: 'Part A reserves the name.' }]);
    const provider = mockProvider([
      guard('explain'),
      rendered({ line: "I'm not certain, because my sources don't cover that.", citations: [{ id: 'src-1', label: 'SPICe+ Part A' }] }),
    ]);
    setAskProviderForTests(provider);
    const { answer } = await run('admin', { shell: 'admin', message: 'What does Part A allow from chat?' });
    expect(answer?.citations).toEqual([]);
  });

  it('answers the router capabilities intent from code', async () => {
    const provider = mockProvider([guard('capabilities')]);
    setAskProviderForTests(provider);
    const { answer } = await run('admin', { shell: 'admin', message: 'tell me everything this assistant is able to change for me please' });
    expect(provider.calls).toHaveLength(1);
    expect(answer?.origin).toBe('deterministic');
  });

  it('routes the router and document answers to Haiku, thinking off for the router', async () => {
    const provider = mockProvider([guard('explain'), rendered()]);
    setAskProviderForTests(provider);
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is a DIN?' });
    expect(provider.calls[0]).toMatchObject({ model: 'claude-haiku-5-5', thinking: 'off', effort: 'low' });
    expect(provider.calls[1]).toMatchObject({ model: 'claude-haiku-5-5', maxTokens: 1500 });
  });

  it('the router reads a short topic list, not all of them', async () => {
    const provider = mockProvider([guard('explain'), rendered()]);
    setAskProviderForTests(provider);
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is GSTR-3B and the GST return?' });
    const system = provider.calls[0]!.system.map((b) => b.text).join('\n');
    expect(system.match(/^- /gm)?.length ?? 0).toBeLessThanOrEqual(8);
    expect(system).toContain('obligation-gst-gstr-3b');
  });

  it('generation reads the rewritten question plus the last two turns', async () => {
    getAskConversationWithMessages.mockResolvedValue({
      conversation: { id: 'conv-9', shell: 'client', engagementId: 'eng-db-1' },
      messages: Array.from({ length: 6 }, (_, i) => ({ sender: i % 2 ? 'assistant' : 'user', text: `turn ${i}` })),
    });
    const provider = mockProvider([guard('explain', { rewrittenQuery: 'How often is DIR-3 KYC filed?' }), rendered()]);
    setAskProviderForTests(provider);
    await run('client', { shell: 'client', engagementId: 'eng-1', conversationId: '11111111-1111-4111-8111-111111111111', message: 'how often?' });
    expect(provider.calls[1]!.messages).toEqual([
      { role: 'user', content: 'turn 4' },
      { role: 'assistant', content: 'turn 5' },
      { role: 'user', content: 'How often is DIR-3 KYC filed?' },
    ]);
  });

  it('a reply cut at the limit is asked for again with twice the room', async () => {
    const provider = mockProvider([guard('explain'), result([], 'max_tokens'), rendered()]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is a DIN?', depth: 'detail' });
    expect(provider.calls.map((c) => c.maxTokens)).toEqual([1024, 2500, 5000]);
    expect(answer?.line).toBe('A DIN identifies a director.');
  });

  it('an identity number is masked before it is stored or sent', async () => {
    const provider = mockProvider([guard('explain'), rendered()]);
    setAskProviderForTests(provider);
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'Is ABCDE1234F a valid PAN?' });
    expect(appendAskMessage.mock.calls[0]![2]).toMatchObject({ text: 'Is XXXXXX234F a valid PAN?' });
    expect(JSON.stringify(provider.calls[0]!.messages)).not.toContain('ABCDE1234F');
  });

  it('staff list tools give the model the count and top rows, while code draws the full table', async () => {
    const filings = Array.from({ length: 12 }, (_, i) => ({
      engagementId: `e${i}`,
      companyName: `Company ${i}`,
      particular: 'GSTR-3B',
      dueDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      filedOn: null,
    }));
    loadStaffData.mockResolvedValue({ engagements: [], filings, now: new Date('2026-02-01T00:00:00Z') });
    const provider = mockProvider([
      guard('ops_query'),
      result([toolUse('listOverdueAndDueSoon', { days: 7 })]),
      result([toolUse('render_answer', { line: '12 filings are overdue.', citations: [{ id: 'listOverdueAndDueSoon', label: 'Live data' }], actions: [] })]),
    ]);
    setAskProviderForTests(provider);
    const { answer } = await run('admin', { shell: 'admin', message: 'What is overdue?' });
    const toolResult = (provider.calls[2]!.messages.at(-1)!.content as Array<{ content: string }>)[0]!.content;
    expect(JSON.parse(toolResult).count).toBe(12);
    expect(JSON.parse(toolResult).top).toHaveLength(5);
    expect((answer?.visual as { type: string; rows: unknown[] }).type).toBe('projectRows');
    expect((answer?.visual as { rows: unknown[] }).rows).toHaveLength(12);
    expect(lastStored()).toMatchObject({ path: 'tool_answer' });
  });

  it('draws no table when the list is empty', async () => {
    const provider = mockProvider([
      guard('ops_query'),
      result([toolUse('listPendingApprovals', {})]),
      result([toolUse('render_answer', { line: 'No approvals are pending.', citations: [], actions: [] })]),
    ]);
    setAskProviderForTests(provider);
    const { answer } = await run('admin', { shell: 'admin', message: 'Which approvals have waited the longest?' });
    expect(answer?.visual).toBeUndefined();
  });

  it('stops model calls once the daily budget is reached, while suggestions keep working', async () => {
    systemTodayTokenTotal.mockResolvedValue(2_000_000);
    const provider = mockProvider([]);
    setAskProviderForTests(provider);
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is a DIN?' });
    expect(provider.calls).toHaveLength(0);
    expect(answer?.line).toBe(REFUSAL_COPY.budgetReached);
    const suggestion = await run('client', { shell: 'client', engagementId: 'eng-1', suggestionId: 'client-next-step' });
    expect(suggestion.answer?.origin).toBe('deterministic');
  });

  it('stops an answer that runs past its budget, and says so', async () => {
    vi.stubEnv('ASK_ANSWER_MAX_TOKENS', '10');
    setAskProviderForTests(mockProvider([guard('project_status'), result([toolUse('getPhaseProgress', {})])]));
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'Where are we?' });
    expect(answer?.line).toBe(REFUSAL_COPY.runTooLong);
    expect(lastStored()).toMatchObject({ path: 'document_answer' });
  });

  it.each([
    ['suggestion', { suggestionId: 'client-next-step' }],
    ['document_answer', { message: 'What is a DIN?' }],
  ])('the kill switch stops %s with a clear message', async (path, request) => {
    vi.stubEnv('ASK_KILL_PATHS', path);
    setAskProviderForTests(mockProvider([guard('explain')]));
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', ...request });
    expect(answer?.line).toBe(REFUSAL_COPY.pathStopped);
    expect(lastStored()).toMatchObject({ path });
  });

  it('a killed tool path offers no tools to a document answer', async () => {
    vi.stubEnv('ASK_KILL_PATHS', 'tool_answer');
    const provider = mockProvider([guard('explain'), rendered()]);
    setAskProviderForTests(provider);
    await run('client', { shell: 'client', engagementId: 'eng-1', message: 'What is a DIN?' });
    expect((provider.calls[1]!.tools ?? []).map((t) => t.name)).toEqual(['render_answer']);

    setAskProviderForTests(mockProvider([guard('project_status')]));
    const { answer } = await run('client', { shell: 'client', engagementId: 'eng-1', message: 'Where are we?' });
    expect(answer?.line).toBe(REFUSAL_COPY.pathStopped);
  });
});
