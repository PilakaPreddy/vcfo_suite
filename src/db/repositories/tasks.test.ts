import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import type { AuthContext } from '@/auth/guards';

/**
 * Tasks (product default, Path A):
 *   admin / super_admin — all engagement tasks
 *   manager / intern / client — tasks on engagements in their role scope
 *   unscoped (null engagement) tasks — admin / manager only
 *   clients never create or update
 * Personal todos (`todo:` step ids, null engagement) are excluded from the
 * engagement task surface and follow their own rules: intern sees own,
 * manager sees self + reports + people on scoped engagements, firm-wide staff
 * see all staff, clients none; only the owner may mutate.
 */

type Call = { op: string; where?: SQL; values?: unknown; set?: unknown; limit?: number };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    innerJoin: () => c,
    orderBy: () => c,
    limit: (n: number) => {
      call.limit = n;
      return c;
    },
    returning: () => c,
    where: (w: SQL) => {
      call.where = w;
      return c;
    },
    values: (v: unknown) => {
      call.values = v;
      return c;
    },
    set: (s: unknown) => {
      call.set = s;
      return c;
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}
function op(name: string) {
  return () => {
    const call: Call = { op: name };
    calls.push(call);
    return chain(call);
  };
}

vi.mock('@/db/client', () => ({
  db: { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') },
}));

const listScopedEngagementIds = vi.fn();
const assertEngagementAccess = vi.fn();
const listEngagements = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  listScopedEngagementIds: (...a: unknown[]) => listScopedEngagementIds(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
  listEngagements: (...a: unknown[]) => listEngagements(...a),
}));

const repo = await import('@/db/repositories/tasks');

const dialect = new PgDialect();
const OWN = '11111111-1111-1111-1111-111111111101';
const OTHER = '22222222-2222-2222-2222-222222222202';

function ctx(role: AuthContext['role']): AuthContext {
  return {
    userId: `user-${role}`,
    email: `${role}@vcfo.local`,
    name: role,
    role,
    internId: role === 'intern' ? 'i1' : undefined,
    clientId: role === 'client' ? 'c1' : undefined,
  };
}

function q(call: Call | undefined) {
  return dialect.sqlToQuery(call!.where!);
}

function taskRow(engagementId: string | null, stepId: string | null = 'step-1') {
  return {
    id: 't-1',
    engagementId,
    stepId,
    title: 'T',
    status: 'open',
    assignedTo: null,
    deadline: null,
    description: null,
    updatedAt: new Date(),
  };
}

function todoJoined(ownerId: string) {
  return {
    task: { ...taskRow(null, 'todo:pin-1'), assignedTo: ownerId },
    ownerName: 'Owner',
    ownerEmail: 'owner@vcfo.local',
    ownerRole: 'intern',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
  listScopedEngagementIds.mockResolvedValue([OWN]);
  listEngagements.mockResolvedValue([]);
});

describe('listTasks', () => {
  it.each(['admin', 'super_admin'] as const)(
    '%s reads firm-wide, still excluding personal todos',
    async (role) => {
      await repo.listTasks(ctx(role));
      expect(listScopedEngagementIds).not.toHaveBeenCalled();
      const w = q(calls[0]);
      expect(w.sql).not.toContain('engagement_id');
      expect(w.sql).toContain('not like');
      expect(w.params).toEqual(['todo:%']);
    },
  );

  it.each(['manager', 'intern', 'client'] as const)(
    '%s only sees tasks on scoped engagements',
    async (role) => {
      await repo.listTasks(ctx(role));
      const w = q(calls[0]);
      expect(w.sql).toContain('"tasks"."engagement_id" in');
      expect(w.params).toEqual([OWN, 'todo:%']);
      expect(calls[0].limit).toBe(repo.TASK_LIST_LIMIT);
    },
  );

  it.each(['manager', 'intern', 'client'] as const)(
    '%s with no engagements gets [] and no query',
    async (role) => {
      listScopedEngagementIds.mockResolvedValue([]);
      expect(await repo.listTasks(ctx(role))).toEqual([]);
      expect(calls).toHaveLength(0);
    },
  );
});

describe('getTaskById', () => {
  it.each(['manager', 'intern', 'client'] as const)(
    '%s gets null for a task on another firm’s engagement',
    async (role) => {
      results = [[taskRow(OTHER)]];
      assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
      expect(await repo.getTaskById(ctx(role), 't-1')).toBeNull();
      expect(assertEngagementAccess).toHaveBeenCalledWith(ctx(role), OTHER);
    },
  );

  it('returns a task on an accessible engagement', async () => {
    results = [[taskRow(OWN)]];
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: {} });
    expect(await repo.getTaskById(ctx('client'), 't-1')).toMatchObject({ id: 't-1' });
  });

  it.each(['intern', 'client'] as const)('%s cannot read an unscoped task', async (role) => {
    results = [[taskRow(null)]];
    expect(await repo.getTaskById(ctx(role), 't-1')).toBeNull();
  });

  it.each(['super_admin', 'admin', 'manager'] as const)('%s can read an unscoped task', async (role) => {
    results = [[taskRow(null)]];
    expect(await repo.getTaskById(ctx(role), 't-1')).not.toBeNull();
  });

  it('never exposes a personal todo through the task surface, even to admin', async () => {
    results = [[taskRow(null, 'todo:pin-1')]];
    expect(await repo.getTaskById(ctx('admin'), 't-1')).toBeNull();
  });
});

describe('createTask / updateTask', () => {
  it('client may not create', async () => {
    await expect(repo.createTask(ctx('client'), { engagementId: OWN })).rejects.toThrow(
      /clients may not/i,
    );
    expect(calls).toHaveLength(0);
  });

  it.each(['manager', 'intern'] as const)(
    '%s cannot create on another firm’s engagement',
    async (role) => {
      assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
      await expect(repo.createTask(ctx(role), { engagementId: OTHER })).rejects.toThrow(
        /not found or not permitted/i,
      );
      expect(calls).toHaveLength(0);
    },
  );

  it('creates against the approved engagement id', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: {} });
    results = [[taskRow(OWN)]];
    await repo.createTask(ctx('intern'), { engagementId: 'e1', title: 'Collect PAN' });
    expect((calls[0]!.values as { engagementId: string }).engagementId).toBe(OWN);
  });

  it('update on another firm’s task returns null and writes nothing', async () => {
    results = [[taskRow(OTHER)]];
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    expect(await repo.updateTask(ctx('manager'), 't-1', { notes: 'x' })).toBeNull();
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it.each(['manager', 'intern'] as const)(
    '%s cannot move a task onto another firm’s engagement; nothing is written',
    async (role) => {
      results = [[taskRow(OWN)]];
      assertEngagementAccess.mockImplementation(async (_c: unknown, id: string) =>
        id === OWN
          ? { ok: true, dbId: OWN, row: {} }
          : { ok: false, dbId: OTHER, forbidden: true },
      );
      expect(await repo.updateTask(ctx(role), 't-1', { engagementId: OTHER })).toBeNull();
      expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), OTHER);
      expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    },
  );

  it('moving a task to an accessible engagement writes the target db id', async () => {
    const TARGET = '33333333-3333-3333-3333-333333333303';
    results = [[taskRow(OWN)], [taskRow(TARGET)]];
    assertEngagementAccess.mockImplementation(async (_c: unknown, id: string) => ({
      ok: true,
      dbId: id,
      row: {},
    }));
    const out = await repo.updateTask(ctx('manager'), 't-1', { engagementId: TARGET });
    expect(out?.engagementId).toBe(TARGET);
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), TARGET);
    const update = calls.find((c) => c.op === 'update');
    expect((update!.set as { engagementId: string }).engagementId).toBe(TARGET);
  });

  it('stamps completed_at when a task moves to done, and clears it when it reopens', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: {} });
    results = [[taskRow(OWN, null)], [{ ...taskRow(OWN, null), status: 'done' }]];
    await repo.updateTask(ctx('intern'), 't-1', { status: 'completed' });
    const done = calls.find((c) => c.op === 'update')!.set as { status: string; completedAt: Date };
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeInstanceOf(Date);

    calls.length = 0;
    results = [[{ ...taskRow(OWN, null), status: 'done' }], [taskRow(OWN, null)]];
    await repo.updateTask(ctx('intern'), 't-1', { status: 'in-progress' });
    expect((calls.find((c) => c.op === 'update')!.set as { completedAt: Date | null }).completedAt).toBeNull();
  });

  it('a second done keeps the first completion time', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: {} });
    results = [[{ ...taskRow(OWN, null), status: 'done' }], [{ ...taskRow(OWN, null), status: 'done' }]];
    await repo.updateTask(ctx('manager'), 't-1', { status: 'completed' });
    expect(calls.find((c) => c.op === 'update')!.set).not.toHaveProperty('completedAt');
  });

  it('a task created as done is stamped at once', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: {} });
    results = [[{ ...taskRow(OWN), status: 'done' }]];
    await repo.createTask(ctx('manager'), { engagementId: 'e1', status: 'completed' });
    expect((calls[0]!.values as { completedAt: Date }).completedAt).toBeInstanceOf(Date);
  });

  it('stamps assigned_by with the caller when the task goes to someone else', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: {} });
    results = [[{ ...taskRow(OWN), assignedTo: 'lead-1', assignedBy: 'user-manager' }]];
    await repo.createTask(ctx('manager'), { engagementId: 'e1', assigneeId: 'lead-1' });
    expect((calls[0]!.values as { assignedBy: string }).assignedBy).toBe('user-manager');

    calls.length = 0;
    results = [[taskRow(OWN, null)], [taskRow(OWN, null)]];
    await repo.updateTask(ctx('manager'), 't-1', { assigneeId: 'lead-2' });
    expect((calls.find((c) => c.op === 'update')!.set as { assignedBy: string }).assignedBy).toBe('user-manager');
  });

  it('client may not update, even a visible task', async () => {
    results = [[taskRow(OWN)]];
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: {} });
    await expect(repo.updateTask(ctx('client'), 't-1', { notes: 'x' })).rejects.toThrow(
      /clients may not/i,
    );
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });
});

describe('personal todos — read scope', () => {
  it('client sees none and nothing is queried', async () => {
    expect(await repo.listPersonalTodos(ctx('client'))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('intern sees only its own todos', async () => {
    results = [[todoJoined('user-intern')]];
    const out = await repo.listPersonalTodos(ctx('intern'));
    expect(out).toHaveLength(1);
    const w = q(calls[0]);
    expect(w.sql).toContain('"tasks"."assigned_to" in');
    expect(w.params).toContain('user-intern');
    expect(w.params).not.toContain('user-other-intern');
  });

  it.each(['admin', 'super_admin'] as const)('%s sees all staff todos', async (role) => {
    await repo.listPersonalTodos(ctx(role));
    const w = q(calls[0]);
    expect(w.sql).toContain('"profiles"."role" in');
    expect(w.sql).not.toContain('assigned_to" in');
  });

  it('manager sees self + direct reports, not unrelated staff', async () => {
    // listEngagements → [] so the only extra owners come from reports_to.
    results = [[{ id: 'user-report' }], []];
    await repo.listPersonalTodos(ctx('manager'));
    const w = q(calls.at(-1));
    expect(w.sql).toContain('"tasks"."assigned_to" in');
    expect(w.params).toEqual(expect.arrayContaining(['user-manager', 'user-report']));
    expect(w.params).not.toContain('user-unrelated');
    expect(listEngagements).toHaveBeenCalledWith(ctx('manager'));
  });
});

describe('personal todos — owner-only mutation', () => {
  it.each(['super_admin', 'admin', 'manager', 'intern'] as const)(
    '%s cannot update or delete someone else’s todo',
    async (role) => {
      results = [[todoJoined('user-owner')], [todoJoined('user-owner')]];
      await expect(repo.updatePersonalTodo(ctx(role), 't-1', { done: true })).rejects.toThrow(
        'not permitted',
      );
      await expect(repo.deletePersonalTodo(ctx(role), 't-1')).rejects.toThrow('not permitted');
      expect(calls.filter((c) => c.op === 'update' || c.op === 'delete')).toHaveLength(0);
    },
  );

  it('owner can delete its own todo', async () => {
    results = [[todoJoined('user-intern')]];
    expect(await repo.deletePersonalTodo(ctx('intern'), 't-1')).toBe(true);
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(1);
  });

  it('client cannot create a todo', async () => {
    await expect(repo.upsertPersonalTodo(ctx('client'), { title: 'x' })).rejects.toThrow(
      'not permitted',
    );
    expect(calls).toHaveLength(0);
  });

  it('upsert always writes the caller as owner', async () => {
    results = [[], [taskRow(null, 'todo:pin-1')], [todoJoined('user-manager')]];
    await repo.upsertPersonalTodo(ctx('manager'), { title: 'Call bank', entryId: 'pin-1' });
    const lookup = q(calls[0]);
    expect(lookup.params).toContain('user-manager');
    const insert = calls.find((c) => c.op === 'insert')!;
    expect((insert.values as { assignedTo: string }).assignedTo).toBe('user-manager');
    expect((insert.values as { engagementId: unknown }).engagementId).toBeNull();
  });
});
