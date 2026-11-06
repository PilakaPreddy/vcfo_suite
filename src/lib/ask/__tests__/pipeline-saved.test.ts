import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { LlmProvider, LlmResult } from '@/lib/ask/provider';
import type { RetrievedSource } from '@/lib/ask/retrieve';

/** The saved-answer step and the dates and sources the generation step may use, with a mock provider. */

const appendAskMessage = vi.fn();
const findSavedAnswer = vi.fn();
const saveAnswer = vi.fn();
const retrieveSources = vi.fn();
const getConversation = vi.fn();
vi.mock('@/db/repositories/ask-conversations', () => ({
  createAskConversation: vi.fn(async () => ({ id: 'conv-1' })),
  getAskConversationWithMessages: (...a: unknown[]) => getConversation(...a),
}));
vi.mock('@/db/repositories/ask-messages', () => ({
  appendAskMessage: (...a: unknown[]) => appendAskMessage(...a),
  countModelAnswersSince: vi.fn(async () => 0),
}));
vi.mock('@/db/repositories/ask-runs', () => ({ findWaitingAskRun: vi.fn(async () => null) }));
vi.mock('@/db/repositories/ask-usage', () => ({
  systemRecordAskUsage: vi.fn(async () => undefined),
  systemTodayTokenTotal: vi.fn(async () => 0),
}));
vi.mock('@/db/repositories/ask-saved-answers', () => ({
  findSavedAnswer: (...a: unknown[]) => findSavedAnswer(...a),
  saveAnswer: (...a: unknown[]) => saveAnswer(...a),
}));
vi.mock('@/lib/ask/knowledge-version', () => ({ currentKnowledgeVersion: vi.fn(async () => 'kv-1') }));
vi.mock('@/lib/ask/retrieve', () => ({ retrieveSources: (...a: unknown[]) => retrieveSources(...a) }));
vi.mock('@/lib/ask/tools/staff-data', () => ({
  loadStaffData: vi.fn(async () => ({ engagements: [], filings: [], now: new Date() })),
  loadStaffEngagements: vi.fn(async () => []),
}));

const { runAskChat } = await import('@/lib/ask/pipeline');
const { setAskProviderForTests } = await import('@/lib/ask/provider');

const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const guard = (intent: string, extra: Record<string, unknown> = {}): LlmResult => ({
  model: 'mock',
  stopReason: 'end_turn',
  usage,
  content: [{ type: 'text', text: JSON.stringify({ intent, rewrittenQuery: 'q', topicSlug: '', language: 'en', ...extra }) } as never],
});
const rendered = (line: string, citations = [{ id: 'chunk-1', label: 'Guide' }]): LlmResult => ({
  model: 'mock',
  stopReason: 'tool_use',
  usage,
  content: [{ type: 'tool_use', id: 'tu', name: 'render_answer', input: { line, citations, actions: [] } } as never],
});
const provider = (replies: LlmResult[]) => {
  const complete = vi.fn(async () => {
    const next = replies.shift();
    if (!next) throw new Error('unexpected provider call');
    return next;
  });
  setAskProviderForTests({ name: 'mock', complete } as unknown as LlmProvider);
  return complete;
};
const chunk: RetrievedSource = { id: 'chunk-1', kind: 'chunk', label: 'Guide', text: 'AOC-4 is filed within 30 days of the AGM. GSTR-1 is due on 11 May 2026.' };
const admin: AuthContext = { userId: 'u1', email: 'a@x.test', name: 'A', role: 'admin' };

async function ask(message: string, extra: Record<string, unknown> = {}) {
  const events: Array<Record<string, unknown>> = [];
  await runAskChat(admin, { shell: 'admin', message, ...extra }, (e) => events.push(e as Record<string, unknown>));
  const answer = events.find((e) => e.type === 'answer') as { answer: { line: string; origin: string } } | undefined;
  return answer?.answer;
}
const lastPath = () => (appendAskMessage.mock.calls.at(-1)![2] as { path: string }).path;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASK_VCFO_ENABLED = 'true';
  delete process.env.ASK_KILL_PATHS;
  appendAskMessage.mockImplementation(async () => ({ id: 'msg-1' }));
  getConversation.mockResolvedValue(null);
  findSavedAnswer.mockResolvedValue(null);
  saveAnswer.mockResolvedValue(undefined);
  retrieveSources.mockResolvedValue([chunk]);
});

describe('saved answers in the chat', () => {
  it('serves a saved answer with no model call, before the budget and the rate limit', async () => {
    const complete = provider([]);
    findSavedAnswer.mockResolvedValue({ line: 'Saved line.', citations: [{ id: 'chunk-1', label: 'Guide' }], actions: [], origin: 'generated', depth: 'normal' });
    expect((await ask('Who files AOC-4?'))?.line).toBe('Saved line.');
    expect(complete).not.toHaveBeenCalled();
    expect(lastPath()).toBe('saved_answer');
    expect(findSavedAnswer).toHaveBeenCalledWith(admin, {
      questionKey: 'who files aoc-4',
      audience: 'staff',
      language: 'en',
      depth: 'normal',
      knowledgeVersion: 'kv-1',
    });
  });

  it('saves a cited document answer under the same key, with its message', async () => {
    provider([guard('explain'), rendered('AOC-4 goes in within 30 days of the AGM.')]);
    await ask('Who files AOC-4?');
    expect(lastPath()).toBe('document_answer');
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    expect(saveAnswer.mock.calls[0]![1]).toMatchObject({ questionKey: 'who files aoc-4', knowledgeVersion: 'kv-1' });
    expect(saveAnswer.mock.calls[0]![2]).toMatchObject({ line: 'AOC-4 goes in within 30 days of the AGM.' });
    expect(saveAnswer.mock.calls[0]![3]).toBe('msg-1');
  });

  it('a personal or live question neither looks up nor saves', async () => {
    provider([guard('explain'), rendered('It is due soon.')]);
    await ask('What is due on my AOC-4 today?');
    expect(findSavedAnswer).not.toHaveBeenCalled();
    expect(saveAnswer).not.toHaveBeenCalled();
  });

  it('a follow-up in a running conversation neither looks up nor saves', async () => {
    getConversation.mockResolvedValue({
      conversation: { id: 'conv-1', shell: 'admin', engagementId: null },
      messages: [{ sender: 'user', text: 'What is AOC-4?' }],
    });
    provider([guard('explain'), rendered('Within 30 days of the AGM.')]);
    await ask('Who files AOC-4?', { conversationId: '11111111-1111-4111-8111-111111111111' });
    expect(findSavedAnswer).not.toHaveBeenCalled();
    expect(saveAnswer).not.toHaveBeenCalled();
  });

  it('a question about data, a named company, a decision or an uncertain answer is never saved', async () => {
    provider([guard('ops_query'), rendered('Three are overdue.')]);
    await ask('Any news from the vendor?');
    provider([guard('explain', { company: 'Acme' }), rendered('AOC-4 goes in within 30 days.')]);
    await ask('Who files AOC-4 for Acme?');
    provider([guard('decision_request'), rendered('It depends on the turnover.')]);
    await ask('Should a firm register for GST?');
    provider([guard('explain'), rendered('Bad.', [{ id: 'made-up', label: 'x' }]), rendered('Bad.', [{ id: 'made-up', label: 'x' }])]);
    await ask('Who files AOC-4?');
    expect(saveAnswer).not.toHaveBeenCalled();
  });

  it('a killed saved_answer path answers in full instead of a stop line', async () => {
    process.env.ASK_KILL_PATHS = 'saved_answer';
    provider([guard('explain'), rendered('AOC-4 goes in within 30 days of the AGM.')]);
    expect((await ask('Who files AOC-4?'))?.line).toContain('30 days');
    expect(findSavedAnswer).not.toHaveBeenCalled();
    expect(saveAnswer).not.toHaveBeenCalled();
  });

  it('a failed lookup or save never costs the person an answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    findSavedAnswer.mockRejectedValue(new Error('database down'));
    saveAnswer.mockRejectedValue(new Error('database down'));
    provider([guard('explain'), rendered('AOC-4 goes in within 30 days of the AGM.')]);
    expect((await ask('Who files AOC-4?'))?.line).toContain('30 days');
    warn.mockRestore();
  });
});

describe('retrieval in the chat', () => {
  it('asks for record cards only on a question about data, scoped to the project of a client chat', async () => {
    provider([guard('explain'), rendered('AOC-4 goes in within 30 days of the AGM.')]);
    await ask('Who files AOC-4?');
    expect(retrieveSources.mock.calls[0]![1]).toMatchObject({ includeCards: false, engagementId: null });
    provider([guard('ops_query'), rendered('Three are overdue.')]);
    await ask('Any news from the vendor?');
    expect(retrieveSources.mock.calls[1]![1]).toMatchObject({ includeCards: true });
  });

  it('allows a date that a document source holds', async () => {
    provider([guard('explain'), rendered('GSTR-1 is due on 11 May 2026.')]);
    expect((await ask('When is GSTR-1 due in May?'))?.line).toContain('11 May 2026');
  });

  it('still rejects a date that no source holds, and one that only a topic holds', async () => {
    provider([guard('explain'), rendered('GSTR-1 is due on 12 May 2026.'), rendered('GSTR-1 is due on 12 May 2026.')]);
    expect((await ask('When is GSTR-1 due in May?'))?.line).not.toContain('12 May 2026');
    retrieveSources.mockResolvedValue([{ id: 'some-topic', kind: 'topic', label: 'T', text: 'Due on 12 May 2026.' }]);
    provider([guard('explain'), rendered('It is due on 12 May 2026.', [{ id: 'some-topic', label: 'T' }]), rendered('It is due on 12 May 2026.', [{ id: 'some-topic', label: 'T' }])]);
    expect((await ask('When is it due?'))?.line).not.toContain('12 May 2026');
  });
});
