import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * systemDeliverComplianceBells writes the day's send log and bells in one statement each
 * (audit 2026-11-04, finding 15), skips rows already logged today, and links each log row
 * to its bell in one update.
 */

type Call = { op: string; values?: unknown; set?: Record<string, unknown>; where?: SQL };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    leftJoin: () => c,
    onConflictDoNothing: () => c,
    returning: () => c,
    values: (v: unknown) => ((call.values = v), c),
    set: (s: Record<string, unknown>) => ((call.set = s), c),
    where: (w: SQL) => ((call.where = w), c),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}
const op = (name: string) => () => {
  const call: Call = { op: name };
  calls.push(call);
  return chain(call);
};

vi.mock('server-only', () => ({}));
vi.mock('@/db/client', () => ({ db: { select: op('select'), insert: op('insert'), update: op('update') } }));
const createNotificationsForUsers = vi.fn();
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: (...a: unknown[]) => createNotificationsForUsers(...a) }));

const { systemDeliverComplianceBells } = await import('@/db/repositories/compliance-reminder-schedule');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const T1 = '33333333-3333-4333-8333-333333333333';
const T2 = '44444444-4444-4444-8444-444444444444';
const person = (id: string, email: string) => ({ id, email, name: id === A ? 'Asha' : 'Bala', role: 'manager', quietHours: null, quietStart: null, quietEnd: null, tz: null });
const reminder = (id: string) => ({ kind: 'task' as const, id, engagementId: 'e1', companyName: 'Acme', title: `Task ${id.slice(0, 1)}`, dueDate: '2026-11-10', key: 'due' as never, label: 'Due', obligationId: null, recipientIds: [A, B] });

beforeEach(() => {
  calls.length = 0;
  results = [];
  createNotificationsForUsers.mockReset();
});

describe('systemDeliverComplianceBells', () => {
  it('logs, rings and links in one statement each, skipping what was already sent today', async () => {
    results = [
      [person(A, 'asha@sbc.in'), person(B, '')],
      // T2 for B was already logged today, so the insert returns three of four rows.
      [
        { id: 'l1', subjectKind: 'task', subjectId: T1, reminderKey: 'due', recipientId: A },
        { id: 'l2', subjectKind: 'task', subjectId: T1, reminderKey: 'due', recipientId: B },
        { id: 'l3', subjectKind: 'task', subjectId: T2, reminderKey: 'due', recipientId: A },
      ],
      [],
    ];
    createNotificationsForUsers.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }]);
    const out = await systemDeliverComplianceBells('2026-11-04', [reminder(T1), reminder(T2)]);

    const inserts = calls.filter((c) => c.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toHaveLength(4);
    expect(createNotificationsForUsers).toHaveBeenCalledTimes(1);
    expect(createNotificationsForUsers.mock.calls[0]![0].map((n: { userId: string }) => n.userId)).toEqual([A, B, A]);
    const updates = calls.filter((c) => c.op === 'update');
    expect(updates).toHaveLength(1);
    const q = new PgDialect().sqlToQuery(updates[0]!.set!.notificationId as SQL);
    expect(q.params).toEqual(['l1', 'n1', 'l2', 'n2', 'l3', 'n3']);
    // B has no email address: bells only. A gets one email listing both tasks.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ profileId: A, logIds: ['l1', 'l3'] });
  });

  it('writes no bell when everything was already sent today', async () => {
    results = [[person(A, 'asha@sbc.in')], []];
    expect(await systemDeliverComplianceBells('2026-11-04', [reminder(T1)])).toEqual([]);
    expect(createNotificationsForUsers).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });
});
