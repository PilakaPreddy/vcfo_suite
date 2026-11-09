import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { LlmProvider, LlmRequest } from '@/lib/ask/provider';

const listEngagements = vi.fn();
const getEngagementById = vi.fn();
const createAskChangeset = vi.fn();
const resolveEngagementRecipients = vi.fn();
const resolveReminderTarget = vi.fn();
const lastReminderWithinWindow = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  listEngagements: (...a: unknown[]) => listEngagements(...a),
  getEngagementById: (...a: unknown[]) => getEngagementById(...a),
  checklistStateFromRow: (row: { state?: unknown }) => row.state ?? {},
}));
vi.mock('@/db/repositories/ask-changesets', () => ({ createAskChangeset: (...a: unknown[]) => createAskChangeset(...a) }));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: (...a: unknown[]) => resolveEngagementRecipients(...a) }));
vi.mock('@/db/repositories/client-reminders', () => ({
  resolveReminderTarget: (...a: unknown[]) => resolveReminderTarget(...a),
  lastReminderWithinWindow: (...a: unknown[]) => lastReminderWithinWindow(...a),
}));
vi.mock('@/db/repositories/tasks', () => ({ createTask: vi.fn(), updateTask: vi.fn() }));
vi.mock('@/db/repositories/document-requests', () => ({ createDocumentRequest: vi.fn() }));
vi.mock('@/lib/email/send-after-response', () => ({ notifyEngagementEventSoon: vi.fn() }));
vi.mock('@/lib/reminders/send-client-reminder', () => ({ sendClientReminder: vi.fn() }));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: vi.fn(), putObject: vi.fn(), bucketKey: (b: string, k: string) => `${b}/${k}` }));

const { pickAndPrepare, pickableActions, resolveStep } = await import('./pick-action');

const lead: AuthContext = { userId: 'u-lead', email: 'sasi@x.test', name: 'Sasi', role: 'intern' };
const NOW = new Date('2026-11-09T15:00:00Z');

const ROUTEWARE = { id: '11111111-1111-4111-8111-111111111111', slug: 'routeware', companyName: 'Routeware Private Limited', deletedAt: null, state: {} };
const TRIAL = { id: '22222222-2222-4222-8222-222222222222', slug: 'trial', companyName: 'Trial Private Ltd', deletedAt: null, state: {} };

function provider(reply: Record<string, unknown>): LlmProvider & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const full = { action: 'none', company: '', step: '', title: '', status: '', dueDate: '', note: '', subject: '', body: '', assignToMe: false, ...reply };
  return {
    name: 'mock',
    calls,
    async complete(req) {
      calls.push(req);
      return { model: 'mock', content: [{ type: 'text', text: JSON.stringify(full) }] as never, stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
}

const run = (message: string, reply: Record<string, unknown>, ctx: AuthContext = lead) =>
  pickAndPrepare({ ctx, message, onScreen: null, conversationId: 'conv-1', provider: provider(reply), model: 'haiku', now: NOW });

beforeEach(() => {
  vi.clearAllMocks();
  listEngagements.mockResolvedValue([ROUTEWARE, TRIAL]);
  getEngagementById.mockImplementation(async (_ctx: unknown, id: string) => [ROUTEWARE, TRIAL].find((e) => e.id === id) ?? null);
  createAskChangeset.mockResolvedValue('33333333-3333-4333-8333-333333333333');
  resolveEngagementRecipients.mockResolvedValue({ clients: [{ userId: 'c1', name: 'Asha', email: 'asha@routeware.test' }], client: null });
  resolveReminderTarget.mockImplementation(async (_ctx: unknown, engagementId: string, itemKey: string) => ({
    ok: true,
    target: { engagementDbId: engagementId, engagementId, companyName: 'Routeware', itemKey, itemTitle: 'Client Details', clientPath: '/x', kind: 'step' },
  }));
  lastReminderWithinWindow.mockResolvedValue(null);
});

describe('pickableActions', () => {
  it('offers a lead the four areas and leaves checklist filling to the data router', async () => {
    const names = (await pickableActions(lead)).map((a) => a.name).sort();
    expect(names).toEqual(['reminders.client', 'reminders.draftEmail', 'requests.create', 'statuses.setStep', 'tasks.create']);
  });

  it('offers a client nothing', async () => {
    expect(await pickableActions({ ...lead, role: 'client' })).toEqual([]);
  });
});

describe('pickAndPrepare', () => {
  it('returns null when the request is none of the actions', async () => {
    expect(await run('fill PAN ABCDE1234F for Routeware', { action: 'none' })).toBeNull();
  });

  it('puts a task on a T2 card and saves nothing', async () => {
    const answer = await run('create a task to call the bank for Routeware by 2026-11-20', {
      action: 'tasks.create',
      company: 'Routeware',
      title: 'Call the bank',
      dueDate: '2026-11-20',
    });
    expect(answer?.changesetId).toBeDefined();
    expect(answer?.line).toContain('Nothing changes until you accept');
    const { draft } = createAskChangeset.mock.calls[0]![1];
    expect(draft.tier).toBe('T2');
    expect(draft.rows[0]).toMatchObject({ action: 'tasks.create', newValue: 'Call the bank', target: { engagementId: ROUTEWARE.id, dueAt: '2026-11-20' } });
  });

  it('defaults a reminder to the step waiting on the client and names who gets it', async () => {
    const answer = await run('remind Routeware', { action: 'reminders.client', company: 'Routeware' });
    expect(answer?.line).toContain('only when you accept');
    const { draft } = createAskChangeset.mock.calls[0]![1];
    expect(draft.tier).toBe('T3');
    expect(draft.recipients).toEqual([{ name: 'Asha', email: 'asha@routeware.test', role: 'client' }]);
    expect(draft.rows[0].target.stepId).toBe('pre-1');
  });

  it('holds a reminder sent in the last 24 hours instead of sending it again', async () => {
    lastReminderWithinWindow.mockResolvedValue(new Date(NOW.getTime() - 3_600_000));
    const answer = await run('remind Routeware about client details', { action: 'reminders.client', company: 'Routeware', step: 'Client Details' });
    expect(answer?.line).toContain('cannot go yet');
  });

  it('asks which step before changing a status', async () => {
    const answer = await run('mark it done for Trial', { action: 'statuses.setStep', company: 'Trial', status: 'completed' });
    expect(answer?.line).toBe('Which step of Trial Private Ltd is this for?');
    expect(createAskChangeset).not.toHaveBeenCalled();
  });

  it('runs an email draft at once and links to the compose page with the text', async () => {
    const answer = await run('draft an email to Trial about the NOC', {
      action: 'reminders.draftEmail',
      company: 'Trial',
      subject: 'NOC for the registered office',
      body: 'Hello, please share the NOC.',
    });
    expect(createAskChangeset).not.toHaveBeenCalled();
    expect(answer?.links?.[0]?.dest).toEqual({ to: 'composeReminder', engagementId: 'trial', subject: 'NOC for the registered office', body: 'Hello, please share the NOC.' });
    expect(answer?.line).toContain('Nothing is sent');
  });

  it('says so when the client is not in scope', async () => {
    const answer = await run('create a task for Acme', { action: 'tasks.create', company: 'Acme Widgets', title: 'Call' });
    expect(answer?.line).toBe('I cannot find Acme Widgets among your clients.');
  });

  it('never trusts an action name outside the list', async () => {
    expect(await run('approve it', { action: 'checklist.setResponse', company: 'Trial' })).toBeNull();
  });
});

describe('resolveStep', () => {
  it('finds a step by id, by title and by most of its words', () => {
    expect(resolveStep('pre-4')).toMatchObject({ id: 'pre-4' });
    expect(resolveStep('name application')).toMatchObject({ id: 'pre-4' });
    expect(resolveStep('kyc review')).toMatchObject({ id: 'pre-7' });
    expect(resolveStep('the bank account step')).toMatchObject({ id: 'post-3' });
    // GST, PF, ESI, PT and the rest all end in "Registration".
    expect(resolveStep('registration')).toBe('ambiguous');
    expect(resolveStep('xyz unknown words')).toBeNull();
  });
});
