import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import type { AuthContext } from '@/auth/guards';

/**
 * Cross-tenant scoping for the engagements repository — the reference seam.
 *
 * Every other repository leans on `scopeFor()` (via list/get) or
 * `assertEngagementAccess()`, so these two carry the whole RLS table row for
 * `engagements` (src/db/repositories/README.md):
 *   admin / super_admin — all (not deleted)
 *   manager  — manager_id = self (legacy: manager_id null + admin_id = self) + co-manager membership
 *   intern   — intern_id = ctx.internId + lead membership
 *   client   — client_user_id = self OR client_id = ctx.clientId + client membership
 * The WHERE clause is rendered with PgDialect so we assert the real SQL.
 */

const listClientMemberEngagementIds = vi.fn();
const listLeadMemberEngagementIds = vi.fn();
const listManagerMemberEngagementIds = vi.fn();

const wheres: SQL[] = [];
let selectRows: unknown[] = [];
const writes: string[] = [];

function chain(): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    where: (w: SQL) => {
      wheres.push(w);
      return c;
    },
    limit: () => c,
    orderBy: () => c,
    set: () => c,
    values: () => c,
    returning: () => c,
    onConflictDoNothing: () => c,
    then: (resolve: (v: unknown[]) => unknown) => resolve(selectRows),
  };
  return c;
}

vi.mock('@/db/client', () => ({
  db: {
    select: () => chain(),
    update: () => {
      writes.push('update');
      return chain();
    },
    insert: () => {
      writes.push('insert');
      return chain();
    },
    delete: () => {
      writes.push('delete');
      return chain();
    },
  },
}));

vi.mock('@/db/repositories/engagement-clients', () => ({
  listClientMemberEngagementIds: (...a: unknown[]) => listClientMemberEngagementIds(...a),
  ensureEngagementClientMember: vi.fn(),
}));
vi.mock('@/db/repositories/engagement-leads-membership', () => ({
  listLeadMemberEngagementIds: (...a: unknown[]) => listLeadMemberEngagementIds(...a),
  listLeadIdsByEngagementIds: vi.fn(async () => new Map()),
  ensureEngagementLead: vi.fn(),
}));
vi.mock('@/db/repositories/engagement-managers-membership', () => ({
  listManagerMemberEngagementIds: (...a: unknown[]) => listManagerMemberEngagementIds(...a),
  ensureEngagementManager: vi.fn(),
}));
vi.mock('@/db/repositories/audit-events', () => ({
  auditChecklistItemPatch: vi.fn(),
}));

const repo = await import('@/db/repositories/engagements');

const dialect = new PgDialect();
function lastWhere() {
  const w = wheres.at(-1);
  if (!w) throw new Error('no WHERE captured');
  return dialect.sqlToQuery(w);
}

const ENG = '33333333-3333-3333-3333-333333333301';
const OTHER = '44444444-4444-4444-4444-444444444402';

function ctx(role: AuthContext['role'], extra: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: `user-${role}`,
    email: `${role}@vcfo.local`,
    name: role,
    role,
    ...(role === 'intern' ? { internId: 'i-own' } : {}),
    ...(role === 'client' ? { clientId: 'c-own' } : {}),
    ...extra,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ENG,
    slug: 'acme',
    companyName: 'Acme',
    managerId: null,
    adminId: null,
    internId: null,
    clientId: null,
    clientUserId: null,
    deletedAt: null,
    checklistState: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  wheres.length = 0;
  writes.length = 0;
  selectRows = [];
  listClientMemberEngagementIds.mockResolvedValue([]);
  listLeadMemberEngagementIds.mockResolvedValue([]);
  listManagerMemberEngagementIds.mockResolvedValue([]);
});

describe('scopeFor via listEngagements / getEngagementById', () => {
  it.each(['admin', 'super_admin'] as const)('%s is firm-wide but never sees soft-deleted rows', async (role) => {
    await repo.listEngagements(ctx(role));
    const q = lastWhere();
    expect(q.sql).toBe('"engagements"."deleted_at" is null');
    expect(q.params).toEqual([]);
  });

  it('manager is scoped to manager_id = self with the legacy admin_id fallback', async () => {
    await repo.listEngagements(ctx('manager'));
    const q = lastWhere();
    expect(q.sql).toContain('"engagements"."deleted_at" is null');
    expect(q.sql).toContain('"engagements"."manager_id" = $1');
    expect(q.sql).toContain('"engagements"."manager_id" is null and "engagements"."admin_id" = $2');
    expect(q.params).toEqual(['user-manager', 'user-manager']);
    expect(q.sql).not.toMatch(/intern_id|client_id|client_user_id/);
    expect(listManagerMemberEngagementIds).toHaveBeenCalledWith('user-manager');
  });

  it('manager co-manager membership widens scope to exactly those ids', async () => {
    listManagerMemberEngagementIds.mockResolvedValue([OTHER]);
    await repo.listScopedEngagementIds(ctx('manager'));
    const q = lastWhere();
    expect(q.sql).toContain('"engagements"."id" in ($3)');
    expect(q.params).toEqual(['user-manager', 'user-manager', OTHER]);
  });

  it('intern is scoped to intern_id = ctx.internId plus lead membership', async () => {
    listLeadMemberEngagementIds.mockResolvedValue([OTHER]);
    await repo.listEngagements(ctx('intern'));
    const q = lastWhere();
    expect(q.sql).toContain('"engagements"."intern_id" = $1');
    expect(q.sql).toContain('"engagements"."id" in ($2)');
    expect(q.params).toEqual(['i-own', OTHER]);
    expect(q.sql).not.toMatch(/manager_id|client_id|client_user_id/);
    expect(listLeadMemberEngagementIds).toHaveBeenCalledWith('i-own');
  });

  it('intern without an internId matches nothing', async () => {
    await repo.listEngagements(ctx('intern', { internId: undefined }));
    const q = lastWhere();
    expect(q.sql).toBe('"engagements"."id" = $1');
    expect(q.params).toEqual(['__none__']);
    expect(listLeadMemberEngagementIds).not.toHaveBeenCalled();
  });

  it('client is scoped to client_user_id = self OR client_id = ctx.clientId plus membership', async () => {
    listClientMemberEngagementIds.mockResolvedValue([OTHER]);
    await repo.listEngagements(ctx('client'));
    const q = lastWhere();
    expect(q.sql).toContain('"engagements"."deleted_at" is null');
    expect(q.sql).toContain('"engagements"."client_user_id" = $1');
    expect(q.sql).toContain('"engagements"."client_id" = $2');
    expect(q.sql).toContain('"engagements"."id" in ($3)');
    expect(q.params).toEqual(['user-client', 'c-own', OTHER]);
    expect(q.sql).not.toMatch(/manager_id|intern_id/);
    expect(listClientMemberEngagementIds).toHaveBeenCalledWith('user-client');
  });

  it('client without a clientId never matches on a null client_id', async () => {
    await repo.listEngagements(ctx('client', { clientId: undefined }));
    const q = lastWhere();
    expect(q.sql).not.toContain('"client_id"');
    expect(q.params).toEqual(['user-client']);
  });

  it('getEngagementById ANDs the id with the role scope and returns null when nothing matches', async () => {
    selectRows = [];
    await expect(repo.getEngagementById(ctx('client'), OTHER)).resolves.toBeNull();
    const q = lastWhere();
    expect(q.sql.startsWith('("engagements"."id" = $1 and (')).toBe(true);
    expect(q.params).toEqual([OTHER, 'user-client', 'c-own']);
  });

  it('getEngagementBySlug ANDs the slug with the role scope', async () => {
    await expect(repo.getEngagementBySlug(ctx('intern'), 'other-co')).resolves.toBeNull();
    const q = lastWhere();
    expect(q.sql).toContain('"engagements"."slug" = $1 and');
    expect(q.params).toEqual(['other-co', 'i-own']);
  });

  it('listChecklistIndex uses the same role scope', async () => {
    await repo.listChecklistIndex(ctx('manager'));
    expect(lastWhere().params).toEqual(['user-manager', 'user-manager']);
  });
});

describe('assertEngagementAccess', () => {
  it('resolves a slug (staff project URLs) to its row and still checks the role', async () => {
    selectRows = [row({ managerId: 'user-other' })];
    const asAdmin = await repo.assertEngagementAccess(ctx('super_admin'), 'acme');
    expect(asAdmin).toMatchObject({ ok: true, dbId: ENG });
    expect(lastWhere().sql).toContain('"slug"');
    expect(lastWhere().params).toContain('acme');

    listManagerMemberEngagementIds.mockResolvedValue([]);
    await expect(repo.assertEngagementAccess(ctx('manager'), 'acme')).resolves.toMatchObject({ ok: false, forbidden: true });
  });

  it('looks an id up by id, never by slug', async () => {
    selectRows = [row()];
    await repo.assertEngagementAccess(ctx('admin'), ENG);
    expect(lastWhere().sql).toContain('"id"');
    expect(lastWhere().sql).not.toContain('"slug"');
  });

  it('missing or soft-deleted is notFound — even for a firm admin', async () => {
    selectRows = [];
    await expect(repo.assertEngagementAccess(ctx('admin'), ENG)).resolves.toMatchObject({
      ok: false,
      notFound: true,
    });
    selectRows = [row({ deletedAt: new Date() })];
    await expect(repo.assertEngagementAccess(ctx('super_admin'), ENG)).resolves.toMatchObject({
      ok: false,
      notFound: true,
    });
  });

  it.each(['admin', 'super_admin'] as const)('%s may access any live engagement', async (role) => {
    selectRows = [row({ managerId: 'someone-else' })];
    await expect(repo.assertEngagementAccess(ctx(role), ENG)).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ['owns via manager_id', { managerId: 'user-manager' }, true],
    ['owns via legacy admin_id', { managerId: null, adminId: 'user-manager' }, true],
    ['another manager’s project', { managerId: 'user-other' }, false],
    ['legacy admin_id ignored once manager_id is set', { managerId: 'user-other', adminId: 'user-manager' }, false],
  ])('manager: %s', async (_label, overrides, ok) => {
    selectRows = [row(overrides)];
    const out = await repo.assertEngagementAccess(ctx('manager'), ENG);
    expect(out.ok).toBe(ok);
    if (!ok) expect(out).toMatchObject({ forbidden: true });
  });

  it('manager: co-manager membership (engagement_managers) is allowed, like scopeFor', async () => {
    selectRows = [row({ managerId: 'user-other' })];
    listManagerMemberEngagementIds.mockResolvedValue([ENG]);
    const out = await repo.assertEngagementAccess(ctx('manager'), ENG);
    expect(out).toMatchObject({ ok: true, dbId: ENG });
    expect(listManagerMemberEngagementIds).toHaveBeenCalledWith('user-manager');
  });

  it('manager: membership of a different engagement does not admit an unrelated manager', async () => {
    selectRows = [row({ managerId: 'user-other' })];
    listManagerMemberEngagementIds.mockResolvedValue([OTHER]);
    const out = await repo.assertEngagementAccess(ctx('manager'), ENG);
    expect(out).toMatchObject({ ok: false, forbidden: true });
  });

  it('intern: own intern_id ok, lead membership ok, anything else forbidden', async () => {
    selectRows = [row({ internId: 'i-own' })];
    expect((await repo.assertEngagementAccess(ctx('intern'), ENG)).ok).toBe(true);

    selectRows = [row({ internId: 'i-other' })];
    listLeadMemberEngagementIds.mockResolvedValue([ENG]);
    expect((await repo.assertEngagementAccess(ctx('intern'), ENG)).ok).toBe(true);

    listLeadMemberEngagementIds.mockResolvedValue([OTHER]);
    await expect(repo.assertEngagementAccess(ctx('intern'), ENG)).resolves.toMatchObject({
      ok: false,
      forbidden: true,
    });
  });

  it('intern without an internId is forbidden', async () => {
    selectRows = [row({ internId: null })];
    await expect(
      repo.assertEngagementAccess(ctx('intern', { internId: undefined }), ENG),
    ).resolves.toMatchObject({ ok: false, forbidden: true });
  });

  it('client: primary pointer, org clientId, or membership; another tenant forbidden', async () => {
    selectRows = [row({ clientUserId: 'user-client' })];
    expect((await repo.assertEngagementAccess(ctx('client'), ENG)).ok).toBe(true);

    selectRows = [row({ clientId: 'c-own' })];
    expect((await repo.assertEngagementAccess(ctx('client'), ENG)).ok).toBe(true);

    selectRows = [row({ clientId: 'c-other', clientUserId: 'user-other' })];
    listClientMemberEngagementIds.mockResolvedValue([ENG]);
    expect((await repo.assertEngagementAccess(ctx('client'), ENG)).ok).toBe(true);

    listClientMemberEngagementIds.mockResolvedValue([]);
    await expect(repo.assertEngagementAccess(ctx('client'), ENG)).resolves.toMatchObject({
      ok: false,
      forbidden: true,
    });
  });

  it('client with no clientId does not match a row whose client_id is null', async () => {
    selectRows = [row({ clientId: null, clientUserId: 'user-other' })];
    await expect(
      repo.assertEngagementAccess(ctx('client', { clientId: undefined }), ENG),
    ).resolves.toMatchObject({ ok: false, forbidden: true });
  });
});

describe('writes refuse out-of-scope engagements before writing', () => {
  it('updateEngagement: clients refused outright; unseen engagement is not found', async () => {
    await expect(repo.updateEngagement(ctx('client'), ENG, { stage: 'Post-Incorporation' })).rejects.toThrow(
      /Clients may not/,
    );
    selectRows = [];
    await expect(repo.updateEngagement(ctx('manager'), OTHER, { stage: 'Post-Incorporation' })).rejects.toThrow(
      /not found or not permitted/,
    );
    expect(writes).toEqual([]);
  });

  it('updateProgressCcEmails: clients refused; unseen engagement is not found', async () => {
    await expect(repo.updateProgressCcEmails(ctx('client'), ENG, [])).rejects.toThrow(/Clients/);
    await expect(repo.updateProgressCcEmails(ctx('intern'), OTHER, [])).rejects.toThrow(
      /not found or not permitted/,
    );
    expect(writes).toEqual([]);
  });

  it('patchChecklistItem: an engagement outside scope is not found and nothing is written', async () => {
    selectRows = [];
    await expect(
      repo.patchChecklistItem(ctx('client'), OTHER, 'pre-1', { status: 'completed' }),
    ).rejects.toThrow(/not found or not permitted/);
    expect(writes).toEqual([]);
  });

  it('submitChecklistItem: foreign engagement refused; staff may not submit', async () => {
    selectRows = [row({ clientUserId: 'user-other', clientId: 'c-other' })];
    await expect(repo.submitChecklistItem(ctx('client'), ENG, 'pre-1', {})).rejects.toThrow(
      /not found or not permitted/,
    );
    selectRows = [row()];
    await expect(repo.submitChecklistItem(ctx('admin'), ENG, 'pre-1', {})).rejects.toThrow(
      /Only clients/,
    );
    expect(writes).toEqual([]);
  });

  it.each(['client', 'intern'] as const)('reviewChecklistItem refuses %s', async (role) => {
    await expect(repo.reviewChecklistItem(ctx(role), ENG, 'pre-1', 'accept')).rejects.toThrow();
    expect(wheres).toHaveLength(0);
  });

  it.each(['client', 'manager', 'admin'] as const)('requestClientFill refuses %s', async (role) => {
    await expect(repo.requestClientFill(ctx(role), ENG, 'pre-1')).rejects.toThrow(/project lead/);
    expect(wheres).toHaveLength(0);
  });

  it.each(['client', 'intern'] as const)('decideClientFillRequest refuses %s', async (role) => {
    await expect(
      repo.decideClientFillRequest(ctx(role), ENG, 'pre-1', 'approve'),
    ).rejects.toThrow(/project manager or admin/);
    expect(wheres).toHaveLength(0);
  });

  it('unlockChecklistFields refuses clients', async () => {
    await expect(repo.unlockChecklistFields(ctx('client'), ENG, 'pre-1', ['a'])).rejects.toThrow(
      /Clients/,
    );
    expect(writes).toEqual([]);
  });

  it.each(['intern', 'client'] as const)('createProjectWithClient refuses %s', async (role) => {
    await expect(
      repo.createProjectWithClient(ctx(role), {
        companyName: 'X',
        companyType: 'foreign',
        clientEmail: 'x@x.test',
        clientPassword: 'password1',
      }),
    ).rejects.toThrow(/Only admins or managers/);
    expect(writes).toEqual([]);
  });
});

describe('admin-only surfaces', () => {
  it.each(['manager', 'intern', 'client'] as const)('%s cannot delete, restore or see the recycle bin', async (role) => {
    await expect(repo.softDeleteEngagement(ctx(role), ENG)).rejects.toThrow(/firm admins/);
    await expect(repo.restoreEngagement(ctx(role), ENG)).rejects.toThrow(/firm admins/);
    await expect(repo.listDeletedEngagements(ctx(role))).resolves.toEqual([]);
    await expect(repo.getEngagementIncludingDeleted(ctx(role), ENG)).resolves.toBeNull();
    expect(writes).toEqual([]);
    expect(wheres).toHaveLength(0);
  });

  it('getMyEngagement is client-only', async () => {
    for (const role of ['admin', 'manager', 'intern'] as const) {
      await expect(repo.getMyEngagement(ctx(role))).resolves.toBeNull();
    }
    expect(wheres).toHaveLength(0);
  });

  it.each(['intern', 'client'] as const)('getClientProfileForEngagement refuses %s', async (role) => {
    await expect(repo.getClientProfileForEngagement(ctx(role), 'user-x')).resolves.toBeNull();
    expect(wheres).toHaveLength(0);
  });

  it('getClientProfileForEngagement: manager reads a client on an engagement in scope', async () => {
    const profile = { id: 'user-x', email: 'x@client.test', name: 'X' };
    selectRows = [profile];
    listClientMemberEngagementIds.mockResolvedValue([ENG]);
    await expect(repo.getClientProfileForEngagement(ctx('manager'), 'user-x')).resolves.toEqual(profile);
    expect(listClientMemberEngagementIds).toHaveBeenCalledWith('user-x');
    // First WHERE is the scope check: manager scope AND (client_user_id = X OR membership).
    const scopeCheck = dialect.sqlToQuery(wheres[0]!);
    expect(scopeCheck.sql).toContain('"engagements"."manager_id" =');
    expect(scopeCheck.sql).toContain('"engagements"."client_user_id" =');
    expect(scopeCheck.params).toContain('user-manager');
    expect(scopeCheck.params).toContain('user-x');
    expect(scopeCheck.params).toContain(ENG);
    expect(wheres).toHaveLength(2);
  });

  it('getClientProfileForEngagement: manager cannot read a client outside scope', async () => {
    selectRows = [];
    await expect(repo.getClientProfileForEngagement(ctx('manager'), 'user-x')).resolves.toBeNull();
    // The profile itself is never queried.
    expect(wheres).toHaveLength(1);
  });

  // Regression (2026-10-22): super_admin used to get null here (the guard tested
  // `admin` and `manager` only), so "Resend welcome email" failed for super admin.
  it.each(['admin', 'super_admin'] as const)('getClientProfileForEngagement: %s stays firm-wide (no engagement scope check)', async (role) => {
    const profile = { id: 'user-x', email: 'x@client.test', name: 'X' };
    selectRows = [profile];
    await expect(repo.getClientProfileForEngagement(ctx(role), 'user-x')).resolves.toEqual(profile);
    expect(wheres).toHaveLength(1);
    expect(listClientMemberEngagementIds).not.toHaveBeenCalled();
  });
});
