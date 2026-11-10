import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * Two saves of one project must not undo each other (UAT T-09 and D-T13-02, 10 Nov 2026).
 *
 * The race: an autosave reads the project, the client's Submit then stores the "submitted"
 * mark, and the autosave writes its older copy back. The fix merges each save inside a
 * locked transaction, on the state as stored at that moment. These tests give the save an
 * old copy (what it read before) while the locked row already holds the newer write.
 */

const ENG = '33333333-3333-3333-3333-333333333301';

let stored: Record<string, unknown> = {};
let staleRow: Record<string, unknown> = {};
const written: Record<string, unknown>[] = [];
const calls: string[] = [];

function chain(result: () => unknown[]) {
  const c: Record<string, unknown> = {
    from: () => c,
    where: () => c,
    limit: () => c,
    for: (strength: string) => {
      calls.push(`for ${strength}`);
      return c;
    },
    set: (v: { checklistState: Record<string, unknown> }) => {
      written.push(v.checklistState);
      stored = v.checklistState;
      return c;
    },
    returning: () => c,
    then: (resolve: (v: unknown[]) => unknown) => resolve(result()),
  };
  return c;
}

vi.mock('@/db/client', () => {
  const tx = {
    select: (cols: Record<string, unknown>) =>
      chain(() => ('checklistState' in cols ? [{ checklistState: stored }] : [])),
    update: () => chain(() => [{ id: ENG, checklistState: stored }]),
  };
  return {
    db: {
      transaction: async (fn: (t: typeof tx) => unknown) => {
        calls.push('transaction');
        return fn(tx);
      },
    },
  };
});
vi.mock('@/db/repositories/engagements/read', () => ({
  getEngagementById: vi.fn(async () => staleRow),
  checklistStateFromRow: (row: { checklistState?: Record<string, never> }) => row.checklistState ?? {},
  toAppEngagement: vi.fn(),
  assertEngagementAccess: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/db/repositories/step-events', () => ({ writeStepEvents: vi.fn() }));
vi.mock('@/db/repositories/step-field-answers', () => ({ markAskedFieldsAnswered: vi.fn() }));
vi.mock('@/lib/notify/staff-alerts', () => ({ newlyAwaitingReview: () => [], queueStaffAlert: vi.fn() }));
vi.mock('@/db/repositories/audit-events', () => ({ auditChecklistItemPatch: vi.fn() }));
vi.mock('@/db/repositories/engagement-clients', () => ({ ensureEngagementClientMember: vi.fn() }));
vi.mock('@/db/repositories/engagement-leads-membership', () => ({ ensureEngagementLead: vi.fn() }));
vi.mock('@/db/repositories/engagement-managers-membership', () => ({ ensureEngagementManager: vi.fn() }));

const { patchChecklistItem, mergeChecklistItemPatch } = await import('./checklist-workflow');

const client: AuthContext = { userId: 'u-client', email: 'c@x.test', name: 'Anika Weber', role: 'client', clientId: 'c-1' };

beforeEach(() => {
  written.length = 0;
  calls.length = 0;
  const before = { 'pre-1': { status: 'in-progress', responses: { proposedName1: 'Sahyadri Robotics India Private Limited' } } };
  // What the autosave read a moment ago: no submit yet.
  staleRow = { id: ENG, checklistState: before };
  // What the database holds now: the client's Submit landed in between.
  stored = {
    'pre-1': {
      ...before['pre-1'],
      waitingOnLeadAt: '2026-11-10T01:30:00.000Z',
      waitingOnLeadByName: 'Anika Weber',
    },
  };
});

describe('checklist saves run one after the other', () => {
  it('keeps the submit that landed after the autosave read the project', async () => {
    await patchChecklistItem(client, ENG, 'pre-1', { responses: { businessDescription: 'Robot integration' } });
    const pre1 = (written.at(-1) as Record<string, Record<string, unknown>>)['pre-1'];
    expect(pre1.waitingOnLeadAt).toBe('2026-11-10T01:30:00.000Z');
    expect(pre1.waitingOnLeadByName).toBe('Anika Weber');
    expect(pre1.responses).toMatchObject({
      proposedName1: 'Sahyadri Robotics India Private Limited',
      businessDescription: 'Robot integration',
    });
  });

  it('reads the state under a row lock inside one transaction', async () => {
    await patchChecklistItem(client, ENG, 'pre-1', { responses: { businessDescription: 'x' } });
    expect(calls).toEqual(['transaction', 'for update']);
  });

  it('merges answers field by field and leaves other steps alone', () => {
    const next = mergeChecklistItemPatch(
      { 'pre-1': { status: 'in-progress', responses: { a: '1' } }, 'pre-2': { status: 'completed' } },
      'pre-1',
      { responses: { b: '2' } },
    );
    expect(next['pre-1']).toEqual({ status: 'in-progress', responses: { a: '1', b: '2' } });
    expect(next['pre-2']).toEqual({ status: 'completed' });
  });
});
