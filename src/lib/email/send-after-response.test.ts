import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Email after the response (audit 2026-11-04, finding 8): the route gets an empty dispatch at
 * once and the provider call waits for `after`; the sender's bell gets the outcome. An event
 * whose answer must carry the compose draft still sends in the request.
 */

const pending: Array<() => unknown> = [];
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void pending.push(fn) }));
const createNotificationsForUsers = vi.fn();
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: (...a: unknown[]) => createNotificationsForUsers(...a) }));
const notifyEngagementEvent = vi.fn();
vi.mock('@/lib/email/notify-engagement-event', () => ({ notifyEngagementEvent: (...a: unknown[]) => notifyEngagementEvent(...a) }));
const notifyTeamAssignments = vi.fn();
vi.mock('@/lib/email/notify-team-assignment', () => ({ notifyTeamAssignment: vi.fn(), notifyTeamAssignments: (...a: unknown[]) => notifyTeamAssignments(...a) }));

const { notifyEngagementEventSoon, notifyTeamAssignmentsSoon } = await import('@/lib/email/send-after-response');

const sent = { attempted: 1, sent: ['lead@sbc.in'], skipped: [], failed: [], subjects: ['Step submitted'] };

beforeEach(() => {
  pending.length = 0;
  vi.clearAllMocks();
});

describe('notifyEngagementEventSoon', () => {
  it('answers with an empty dispatch and sends only after the response', async () => {
    notifyEngagementEvent.mockResolvedValue(sent);
    const email = await notifyEngagementEventSoon({ engagementId: 'e1', itemId: 'pre-4', event: 'client_submitted', actorUserId: 'u1' });
    expect(email.attempted).toBe(0);
    expect(notifyEngagementEvent).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);
    await pending[0]!();
    expect(notifyEngagementEvent).toHaveBeenCalledTimes(1);
    expect(createNotificationsForUsers).toHaveBeenCalledWith([expect.objectContaining({ userId: 'u1', kind: 'email.sent', itemId: 'pre-4' })]);
  });

  it('a failed send still lands in the bell, and a throw is only logged', async () => {
    notifyEngagementEvent.mockResolvedValueOnce({ ...sent, sent: [], failed: ['lead@sbc.in'] });
    await notifyEngagementEventSoon({ engagementId: 'e1', itemId: 'pre-4', event: 'client_submitted', actorUserId: 'u1' });
    await pending[0]!();
    expect(createNotificationsForUsers.mock.calls[0]![0][0]).toMatchObject({ kind: 'email.failed' });

    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyEngagementEvent.mockRejectedValueOnce(new Error('provider down'));
    await notifyEngagementEventSoon({ engagementId: 'e1', itemId: 'pre-4', event: 'client_submitted', actorUserId: 'u1' });
    await expect(pending[1]!()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('an event that opens the client compose draft is still sent in the request', async () => {
    notifyEngagementEvent.mockResolvedValue({ ...sent, outgoingDraft: { to: ['c@x.in'], subject: 's', html: '', text: '' } });
    const email = await notifyEngagementEventSoon({ engagementId: 'e1', itemId: 'pre-4', event: 'review_accepted', actorUserId: 'u1' });
    expect(email.outgoingDraft).toBeTruthy();
    expect(pending).toHaveLength(0);
  });
});

describe('notifyTeamAssignmentsSoon', () => {
  it('defers the team emails and tells the actor', async () => {
    notifyTeamAssignments.mockResolvedValue(sent);
    const email = await notifyTeamAssignmentsSoon({ engagementAppId: 'a', companyName: 'Acme', actor: { userId: 'boss', name: 'Boss' }, assigned: [] });
    expect(email.attempted).toBe(0);
    expect(notifyTeamAssignments).not.toHaveBeenCalled();
    await pending[0]!();
    expect(createNotificationsForUsers).toHaveBeenCalledWith([expect.objectContaining({ userId: 'boss' })]);
  });
});
