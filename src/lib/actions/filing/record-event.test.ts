import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { LlmProvider } from '@/lib/ask/provider';
import type { ActionContext } from '../types';

/**
 * filing.recordEvent: the card shows the form, due date and what is created; execute creates the
 * task (compliance task for a manager, Work board task for a lead), drafts the client request list
 * and records the event. The Ask picker maps "Mr X resigned yesterday" onto it.
 */

const getEngagementById = vi.fn();
const listEngagements = vi.fn();
const createComplianceTask = vi.fn();
const changeTaskStage = vi.fn();
const createWorkTask = vi.fn();
const updateWorkTask = vi.fn();
const createRequestList = vi.fn();
const updateRequestList = vi.fn();
const getComplianceEvent = vi.fn();
const recordComplianceEvent = vi.fn();
const setComplianceEventStatus = vi.fn();
const createAskChangeset = vi.fn();
const actionsForRole = vi.fn();

vi.mock('@/db/repositories/engagements', () => ({
  getEngagementById: (...a: unknown[]) => getEngagementById(...a),
  listEngagements: (...a: unknown[]) => listEngagements(...a),
  checklistStateFromRow: () => ({}),
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: vi.fn() }));
vi.mock('@/db/repositories/ask-attachments', () => ({ getOwnAskAttachments: vi.fn() }));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: vi.fn() }));
vi.mock('@/db/repositories/compliance-tasks', () => ({
  createTask: (...a: unknown[]) => createComplianceTask(...a),
  changeTaskStage: (...a: unknown[]) => changeTaskStage(...a),
}));
vi.mock('@/db/repositories/tasks', () => ({
  createTask: (...a: unknown[]) => createWorkTask(...a),
  updateTask: (...a: unknown[]) => updateWorkTask(...a),
}));
vi.mock('@/db/repositories/request-lists', () => ({
  createRequestList: (...a: unknown[]) => createRequestList(...a),
  updateRequestList: (...a: unknown[]) => updateRequestList(...a),
}));
vi.mock('@/db/repositories/compliance-events', () => ({
  getComplianceEvent: (...a: unknown[]) => getComplianceEvent(...a),
  recordComplianceEvent: (...a: unknown[]) => recordComplianceEvent(...a),
  setComplianceEventStatus: (...a: unknown[]) => setComplianceEventStatus(...a),
}));
vi.mock('@/db/repositories/ask-changesets', () => ({ createAskChangeset: (...a: unknown[]) => createAskChangeset(...a) }));
vi.mock('@/lib/actions/registry', () => ({ actionsForRole: (...a: unknown[]) => actionsForRole(...a) }));

const { recordEvent, requestDueOn } = await import('./record-event');
const { inputForPicked, pickAndPrepare } = await import('@/lib/ask/do/pick-action');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const manager: AuthContext = { userId: 'u-mgr', email: 'mgr@x.test', name: 'Mgr', role: 'manager' };
const NOW = new Date('2026-11-10T06:00:00Z');
const actx = (auth: AuthContext): ActionContext => ({ auth, engagementId: null, conversationId: null, runId: null, now: NOW, via: 'route' });
const ACME = { id: '11111111-1111-4111-8111-111111111111', slug: 'acme', companyName: 'Acme Private Limited', incorporationDate: '2026-05-01', stage: 'Post-Incorporation', deletedAt: null };
const input = { engagementId: ACME.id, kind: 'director_resigned' as const, occurredOn: '2026-11-09', details: { person: 'Vikram Shah' }, value: 'Vikram Shah resigned' };

beforeEach(() => {
  vi.clearAllMocks();
  getEngagementById.mockResolvedValue(ACME);
  listEngagements.mockResolvedValue([ACME]);
  createComplianceTask.mockResolvedValue({ id: 'ct-1' });
  createWorkTask.mockResolvedValue({ id: 'wt-1' });
  createRequestList.mockResolvedValue({ id: 'rl-1' });
  recordComplianceEvent.mockResolvedValue({ id: 'ev-1' });
  createAskChangeset.mockResolvedValue('33333333-3333-4333-8333-333333333333');
  actionsForRole.mockResolvedValue([recordEvent]);
});

describe('filing.recordEvent', () => {
  it('is a staff T2 action', () => {
    expect(recordEvent.tier).toBe('T2');
    expect(recordEvent.roles).not.toContain('client');
  });

  it('previews the form, the due date and what it will create', async () => {
    const row = (await recordEvent.preview(actx(lead), input))!.rows[0]!;
    expect(row.displayNew).toContain('DIR-12 due 2026-12-09');
    expect(row.displayNew).toContain('Work board task: File DIR-12 for the resignation of Vikram Shah');
    expect(row.displayNew).toContain('Draft client request (not sent)');
    expect(row.heldReason).toBeUndefined();
    expect(row.newValue).toBe('Vikram Shah resigned');
  });

  it('holds an event for a company that is not incorporated, or dated in the future', async () => {
    getEngagementById.mockResolvedValue({ ...ACME, incorporationDate: null, stage: 'Pre-Incorporation' });
    expect((await recordEvent.preview(actx(lead), input))!.rows[0]!.heldReason).toMatch(/not incorporated/);
    getEngagementById.mockResolvedValue(ACME);
    expect((await recordEvent.preview(actx(lead), { ...input, occurredOn: '2026-11-20' }))!.rows[0]!.heldReason).toMatch(/future/);
  });

  it('holds a proposal that was already confirmed', async () => {
    getComplianceEvent.mockResolvedValue({ id: 'ev-9', engagementId: ACME.id, status: 'tracked' });
    const row = (await recordEvent.preview(actx(lead), { ...input, eventId: '99999999-9999-4999-8999-999999999999' }))!.rows[0]!;
    expect(row.heldReason).toMatch(/already confirmed/);
  });

  it('for a lead: creates a Work board task, drafts the request list and records the event', async () => {
    const result = await recordEvent.execute(actx(lead), input);
    expect(result.ok).toBe(true);
    expect(createWorkTask).toHaveBeenCalledWith(lead, expect.objectContaining({ engagementId: ACME.id, dueAt: '2026-12-09', assigneeId: 'u-lead' }));
    expect(createComplianceTask).not.toHaveBeenCalled();
    expect(createRequestList).toHaveBeenCalledWith(lead, expect.objectContaining({ engagementId: ACME.id, dueOn: '2026-11-17' }));
    expect(recordComplianceEvent).toHaveBeenCalledWith(
      lead,
      expect.objectContaining({ kind: 'director_resigned', dueOn: '2026-12-09', taskId: 'wt-1', taskKind: 'work', requestListId: 'rl-1', source: 'manual' }),
      NOW,
    );
  });

  it('for a manager: creates a compliance task with the due date', async () => {
    await recordEvent.execute(actx(manager), { ...input, kind: 'auditor_appointed', details: { firm: 'K & Co' } });
    expect(createComplianceTask).toHaveBeenCalledWith(manager, expect.objectContaining({ dueDate: '2026-11-24', urgency: 'Critical', visibility: 'firm', activityId: null }));
  });

  it('still records the event when the request list cannot be drafted', async () => {
    createRequestList.mockRejectedValue(new Error('no table'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await recordEvent.execute(actx(lead), input);
    err.mockRestore();
    expect(result.ok).toBe(true);
    expect(recordComplianceEvent).toHaveBeenCalledWith(lead, expect.objectContaining({ requestListId: null }), NOW);
  });

  it('never drafts the request list for after the filing is due', () => {
    expect(requestDueOn('2026-11-10', { dueOn: '2026-11-12' })).toBe('2026-11-12');
    expect(requestDueOn('2026-11-10', { dueOn: '2026-10-01' })).toBe('2026-11-10');
  });
});

describe('Ask picker mapping', () => {
  const picked = {
    action: 'filing.recordEvent',
    company: 'Acme',
    step: '',
    title: 'Vikram Shah resigned yesterday',
    status: '',
    dueDate: '',
    note: '',
    subject: '',
    body: '',
    assignToMe: false,
    event: { kind: 'director_resigned', occurredOn: '2026-11-09', person: 'Vikram Shah' },
  };

  it('maps the event fields onto the action input, which parses', () => {
    const mapped = inputForPicked('filing.recordEvent', picked, { engagementId: ACME.id });
    expect(mapped).toEqual({
      engagementId: ACME.id,
      kind: 'director_resigned',
      occurredOn: '2026-11-09',
      details: { person: 'Vikram Shah' },
      source: 'ask',
      value: 'Vikram Shah resigned yesterday',
    });
    expect(recordEvent.input.safeParse(mapped).success).toBe(true);
  });

  const provider = (reply: Record<string, unknown>): LlmProvider => ({
    name: 'mock',
    async complete() {
      return { model: 'mock', content: [{ type: 'text', text: JSON.stringify({ ...picked, ...reply }) }] as never, stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  });
  const run = (reply: Record<string, unknown> = {}) =>
    pickAndPrepare({ ctx: lead, message: 'Vikram Shah of Acme resigned yesterday', onScreen: null, conversationId: 'c1', provider: provider(reply), model: 'haiku', now: NOW });

  it('puts the event on a T2 card and saves nothing else', async () => {
    const answer = await run();
    expect(answer?.changesetId).toBe('33333333-3333-4333-8333-333333333333');
    expect(createAskChangeset).toHaveBeenCalledTimes(1);
    expect(recordComplianceEvent).not.toHaveBeenCalled();
    expect(createWorkTask).not.toHaveBeenCalled();
  });

  it('asks for the date when the person gave none', async () => {
    const answer = await run({ event: { kind: 'director_resigned', occurredOn: '', person: 'Vikram Shah' } });
    expect(answer?.line).toMatch(/the date it happened/);
    expect(createAskChangeset).not.toHaveBeenCalled();
  });
});
