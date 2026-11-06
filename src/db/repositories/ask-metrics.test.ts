import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/**
 * Cross-tenant scoping for the Ask metric reads:
 *   super_admin / admin — the firm
 *   manager / intern — the engagements in their scope
 *   client — own engagements for requests; tasks, reviews and invoices never
 * Every list here starts from `scopeIds`, or `listMySheets` for invoices, and a caller with no
 * scope gets nothing without a query.
 */

const wheres: SQL[] = [];
let results: unknown[][] = [];
let selects = 0;

function chain(): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    leftJoin: () => c,
    innerJoin: () => c,
    orderBy: () => c,
    where: (w: SQL) => {
      wheres.push(w);
      return c;
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}

vi.mock('@/db/client', () => ({
  db: {
    select: () => {
      selects += 1;
      return chain();
    },
  },
}));

const scopeIds = vi.fn();
vi.mock('@/db/repositories/compliance-tasks/shared', () => ({ scopeIds: (...a: unknown[]) => scopeIds(...a) }));
const listMySheets = vi.fn();
vi.mock('@/db/repositories/receivables/sheets', () => ({ listMySheets: (...a: unknown[]) => listMySheets(...a) }));

const { listDocumentsPendingReview, listOpenInvoicesForMetrics, listOpenRequestsForMetrics, listOpenTasksForMetrics } = await import('./ask-metrics');

const ctx = (role: AuthContext['role']): AuthContext => ({ userId: `user-${role}`, email: `${role}@x.test`, name: role, role });
const dialect = new PgDialect();
const render = () => dialect.sqlToQuery(wheres.at(-1)!);

beforeEach(() => {
  vi.clearAllMocks();
  wheres.length = 0;
  results = [];
  selects = 0;
});

describe('listOpenRequestsForMetrics', () => {
  it('filters to the scoped engagements', async () => {
    scopeIds.mockResolvedValue(['eng-a', 'eng-b']);
    await listOpenRequestsForMetrics(ctx('intern'));
    expect(scopeIds).toHaveBeenCalledWith(expect.objectContaining({ role: 'intern' }), undefined);
    expect(render().params).toEqual(expect.arrayContaining(['eng-a', 'eng-b']));
  });

  it('asks the scope for one engagement when named, so a client cannot widen it', async () => {
    scopeIds.mockResolvedValue(['eng-own']);
    await listOpenRequestsForMetrics(ctx('client'), 'eng-own');
    expect(scopeIds).toHaveBeenCalledWith(expect.objectContaining({ role: 'client' }), 'eng-own');
    expect(render().params).toEqual(expect.arrayContaining(['eng-own']));
    expect(render().params).not.toContain('eng-other');
  });

  it('runs no query for an empty scope', async () => {
    scopeIds.mockResolvedValue([]);
    await expect(listOpenRequestsForMetrics(ctx('manager'))).resolves.toEqual([]);
    expect(selects).toBe(0);
  });
});

describe('listOpenTasksForMetrics', () => {
  it('refuses a client before any read', async () => {
    await expect(listOpenTasksForMetrics(ctx('client'))).resolves.toEqual([]);
    expect(scopeIds).not.toHaveBeenCalled();
    expect(selects).toBe(0);
  });

  it('scopes a manager and a lead to their engagements, and leaves out personal to-dos', async () => {
    for (const role of ['manager', 'intern'] as const) {
      scopeIds.mockResolvedValue(['eng-a']);
      await listOpenTasksForMetrics(ctx(role));
      const { sql, params } = render();
      expect(params).toContain('eng-a');
      expect(params).toContain('todo:%');
      expect(sql).toContain('"tasks"."engagement_id" in');
    }
  });

  it('lets a firm-wide admin read everything, but only through a live engagement', async () => {
    for (const role of ['admin', 'super_admin'] as const) {
      await listOpenTasksForMetrics(ctx(role));
      expect(scopeIds).not.toHaveBeenCalled();
      const { sql } = render();
      expect(sql).not.toContain('"tasks"."engagement_id" in');
      expect(sql).toContain('"engagements"."deleted_at" is null');
    }
  });

  it('scopes a firm-wide admin to one company when one is named', async () => {
    scopeIds.mockResolvedValue(['eng-a']);
    await listOpenTasksForMetrics(ctx('admin'), 'eng-a');
    expect(scopeIds).toHaveBeenCalledWith(expect.anything(), 'eng-a');
    expect(render().sql).toContain('"tasks"."engagement_id" in');
  });

  it('runs no query for an empty scope', async () => {
    scopeIds.mockResolvedValue([]);
    await expect(listOpenTasksForMetrics(ctx('intern'))).resolves.toEqual([]);
    expect(selects).toBe(0);
  });
});

describe('listDocumentsPendingReview', () => {
  it('refuses a client before any read', async () => {
    await expect(listDocumentsPendingReview(ctx('client'))).resolves.toEqual([]);
    expect(scopeIds).not.toHaveBeenCalled();
  });

  it('counts current files on scoped engagements only', async () => {
    scopeIds.mockResolvedValue(['eng-a']);
    await listDocumentsPendingReview(ctx('manager'));
    const { sql, params } = render();
    expect(params).toEqual(expect.arrayContaining(['pending', 'eng-a']));
    expect(sql).toContain('"documents"."deleted_at" is null');
    expect(sql).toContain('"documents"."replaced_at" is null');
  });
});

describe('listOpenInvoicesForMetrics', () => {
  it.each(['client', 'intern'] as const)('refuses a %s before any read', async (role) => {
    await expect(listOpenInvoicesForMetrics(ctx(role))).resolves.toEqual([]);
    expect(listMySheets).not.toHaveBeenCalled();
    expect(selects).toBe(0);
  });

  it('reads only the sheets the caller may edit, and marks live disputes', async () => {
    listMySheets.mockResolvedValue([{ id: 'sheet-mine' }]);
    results = [
      [
        { clientName: 'A', invoiceNo: '1', dueDate: '2026-10-01', amountInr: '10', disputedAt: new Date(), disputeResolvedAt: null },
        { clientName: 'B', invoiceNo: '2', dueDate: '2026-10-02', amountInr: '20', disputedAt: new Date(), disputeResolvedAt: new Date() },
      ],
    ];
    const rows = await listOpenInvoicesForMetrics(ctx('manager'));
    expect(render().params).toEqual(expect.arrayContaining(['open', 'sheet-mine']));
    expect(rows.map((r) => r.disputed)).toEqual([true, false]);
  });

  it('runs no query with no sheets', async () => {
    listMySheets.mockResolvedValue([]);
    await expect(listOpenInvoicesForMetrics(ctx('admin'))).resolves.toEqual([]);
    expect(selects).toBe(0);
  });
});
