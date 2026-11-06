import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { budgetChanges, budgetRows, budgetSections } from '@/db/schema';
import { changedFields } from '@/lib/budget/diff';
import { ROW_SECTION, blankRow, type BudgetRow, type BudgetSection, type RoleData, type RowKind } from '@/lib/budget/model';
import { ROW_SCHEMAS } from '@/lib/budget/wire';
import { BudgetError, assertEditable, loadBudget } from './shared';

const labelOf = (data: unknown): string => {
  const d = data as Partial<RoleData> & { name?: string };
  return d.role || d.name || '';
};

const toRow = (r: typeof budgetRows.$inferSelect): BudgetRow => ({ id: r.id, kind: r.kind as RowKind, position: r.position, version: r.version, data: r.data as BudgetRow['data'] });

async function markStarted(budgetId: string, section: BudgetSection) {
  await db
    .update(budgetSections)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(and(eq(budgetSections.budgetId, budgetId), eq(budgetSections.section, section), eq(budgetSections.status, 'not_started')));
}

export async function addRow(ctx: AuthContext, budgetId: string, kind: RowKind, data?: unknown): Promise<BudgetRow> {
  const section = ROW_SECTION[kind];
  assertEditable(await loadBudget(ctx, budgetId), section);
  const clean = ROW_SCHEMAS[kind].parse({ ...blankRow(kind), ...((data as object) ?? {}) });
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${budgetRows.position}), -1) + 1` }).from(budgetRows).where(eq(budgetRows.budgetId, budgetId));
  const [row] = await db.insert(budgetRows).values({ budgetId, kind, position: Number(next), data: clean, updatedBy: ctx.userId }).returning();
  await markStarted(budgetId, section);
  return toRow(row);
}

/**
 * Save one row. The version the screen last saw must still be the current one; otherwise the row
 * comes back as a conflict with the other person's values, and nothing is overwritten.
 */
export async function updateRow(ctx: AuthContext, budgetId: string, rowId: string, input: { version: number; data: unknown }): Promise<BudgetRow> {
  const loaded = await loadBudget(ctx, budgetId);
  const [current] = await db.select().from(budgetRows).where(and(eq(budgetRows.id, rowId), eq(budgetRows.budgetId, budgetId))).limit(1);
  if (!current) throw new BudgetError('not_found', 404);
  const kind = current.kind as RowKind;
  const section = ROW_SECTION[kind];
  assertEditable(loaded, section);
  const clean = ROW_SCHEMAS[kind].parse(input.data);
  const [row] = await db
    .update(budgetRows)
    .set({ data: clean, version: input.version + 1, updatedBy: ctx.userId, updatedAt: new Date() })
    .where(and(eq(budgetRows.id, rowId), eq(budgetRows.version, input.version)))
    .returning();
  if (!row) throw new BudgetError('conflict', 409, toRow(current));
  const changes = changedFields(current.data as object, clean as object);
  if (changes.length) {
    await db.insert(budgetChanges).values(
      changes.map((c) => ({ budgetId, section, rowId, rowLabel: labelOf(clean), field: c.field, oldValue: c.before, newValue: c.after, actorId: ctx.userId, actorName: ctx.name })),
    );
    await markStarted(budgetId, section);
  }
  return toRow(row);
}

export async function deleteRow(ctx: AuthContext, budgetId: string, rowId: string): Promise<void> {
  const loaded = await loadBudget(ctx, budgetId);
  const [current] = await db.select().from(budgetRows).where(and(eq(budgetRows.id, rowId), eq(budgetRows.budgetId, budgetId))).limit(1);
  if (!current) throw new BudgetError('not_found', 404);
  const section = ROW_SECTION[current.kind as RowKind];
  assertEditable(loaded, section);
  await db.delete(budgetRows).where(eq(budgetRows.id, rowId));
  await db.insert(budgetChanges).values({ budgetId, section, rowId, rowLabel: labelOf(current.data), field: 'row removed', oldValue: current.data, actorId: ctx.userId, actorName: ctx.name });
}

/**
 * Replace the rows of the given kinds from an imported workbook. Staff or the tab's owner only,
 * and only for the tabs this person may edit. Returns the number of rows written.
 */
export async function replaceRows(ctx: AuthContext, budgetId: string, incoming: { kind: RowKind; data: unknown }[]): Promise<number> {
  const loaded = await loadBudget(ctx, budgetId);
  const kinds = [...new Set(incoming.map((r) => r.kind))];
  for (const kind of kinds) assertEditable(loaded, ROW_SECTION[kind]);
  if (!kinds.length) return 0;
  const clean = incoming.map((r, i) => ({ budgetId, kind: r.kind, position: i, data: ROW_SCHEMAS[r.kind].parse({ ...blankRow(r.kind), ...(r.data as object) }), updatedBy: ctx.userId }));
  await db.transaction(async (tx) => {
    await tx.delete(budgetRows).where(and(eq(budgetRows.budgetId, budgetId), inArray(budgetRows.kind, kinds)));
    await tx.insert(budgetRows).values(clean);
    await tx.insert(budgetChanges).values(
      [...new Set(kinds.map((k) => ROW_SECTION[k]))].map((section) => ({ budgetId, section, field: 'imported from Excel', newValue: { rows: clean.filter((c) => ROW_SECTION[c.kind] === section).length }, actorId: ctx.userId, actorName: ctx.name })),
    );
  });
  for (const section of new Set(kinds.map((k) => ROW_SECTION[k]))) await markStarted(budgetId, section);
  return clean.length;
}
