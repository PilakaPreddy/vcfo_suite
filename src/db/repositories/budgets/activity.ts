import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { budgetActuals, budgetAttachments, budgetChanges, budgetComments, budgetRows, budgets } from '@/db/schema';
import { bucketKey, deleteObject, putObject, signedDownloadUrl } from '@/storage/s3';
import { fyIndexOfPeriod, ROW_SECTION, type BudgetSection, type BudgetSettings, type RowKind } from '@/lib/budget/model';
import type { ActualRow, AttachmentEntry, ChangeEntry, CommentEntry } from '@/lib/budget/wire';
import { BudgetError, loadBudget } from './shared';
import { assertActualsUnlocked } from './variance';

/** The change log. A client sees only the tabs they can see, and no CTC history without HR access. */
export async function listChanges(ctx: AuthContext, budgetId: string, input: { rowId?: string | null } = {}): Promise<ChangeEntry[]> {
  const { access } = await loadBudget(ctx, budgetId);
  const rows = await db
    .select()
    .from(budgetChanges)
    .where(and(eq(budgetChanges.budgetId, budgetId), input.rowId ? eq(budgetChanges.rowId, input.rowId) : undefined))
    .orderBy(desc(budgetChanges.createdAt))
    .limit(300);
  return rows
    .filter((r) => access.visibleSections.includes(r.section as BudgetSection))
    .filter((r) => access.canSeeCtc || r.section !== 'hiring')
    .map((r) => ({ id: r.id, section: r.section, rowId: r.rowId, rowLabel: r.rowLabel, field: r.field, oldValue: r.oldValue, newValue: r.newValue, actorName: r.actorName, createdAt: r.createdAt.toISOString() }));
}

export async function listComments(ctx: AuthContext, budgetId: string): Promise<CommentEntry[]> {
  const { access } = await loadBudget(ctx, budgetId);
  const rows = await db.select().from(budgetComments).where(eq(budgetComments.budgetId, budgetId)).orderBy(desc(budgetComments.createdAt));
  return rows
    .filter((r) => access.visibleSections.includes(r.section as BudgetSection))
    .map((r) => ({ id: r.id, section: r.section, rowId: r.rowId, body: r.body, authorName: r.authorName, resolvedAt: r.resolvedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }));
}

export async function addComment(ctx: AuthContext, budgetId: string, input: { section: BudgetSection; rowId?: string | null; body: string }): Promise<void> {
  const { access } = await loadBudget(ctx, budgetId);
  if (!access.visibleSections.includes(input.section)) throw new BudgetError('forbidden', 403);
  if (input.rowId) await assertRow(budgetId, input.rowId);
  await db.insert(budgetComments).values({ budgetId, section: input.section, rowId: input.rowId ?? null, body: input.body, authorId: ctx.userId, authorName: ctx.name });
}

export async function resolveComment(ctx: AuthContext, budgetId: string, commentId: string): Promise<void> {
  const { access } = await loadBudget(ctx, budgetId);
  const [comment] = await db.select().from(budgetComments).where(and(eq(budgetComments.id, commentId), eq(budgetComments.budgetId, budgetId))).limit(1);
  if (!comment) throw new BudgetError('not_found', 404);
  if (!access.isStaff && comment.authorId !== ctx.userId) throw new BudgetError('forbidden', 403);
  await db.update(budgetComments).set({ resolvedAt: new Date() }).where(eq(budgetComments.id, commentId));
}

async function assertRow(budgetId: string, rowId: string) {
  const [row] = await db.select({ kind: budgetRows.kind }).from(budgetRows).where(and(eq(budgetRows.id, rowId), eq(budgetRows.budgetId, budgetId))).limit(1);
  if (!row) throw new BudgetError('not_found', 404);
  return ROW_SECTION[row.kind as RowKind];
}

/* ------------------------------------------------------------------ actual cost */

export async function listActuals(ctx: AuthContext, budgetId: string): Promise<ActualRow[]> {
  const { access } = await loadBudget(ctx, budgetId);
  if (!access.canSeeActuals) return [];
  const rows = await db.select().from(budgetActuals).where(eq(budgetActuals.budgetId, budgetId));
  return rows.map((r) => ({ period: r.period, lineId: r.lineId, amount: r.amount, reason: r.reason, source: r.source }));
}

/** Set actual cost for line and month pairs. Amounts of 0 with no reason remove the entry. */
export async function saveActuals(ctx: AuthContext, budgetId: string, entries: { period: string; lineId: string; amount: number; reason?: string | null }[], source = 'manual'): Promise<number> {
  const { access, row } = await loadBudget(ctx, budgetId);
  if (!access.canEnterActuals) throw new BudgetError('forbidden', 403);
  const settings = row.settings as BudgetSettings;
  const known = new Set(settings.lines.map((l) => l.id));
  const valid = entries.filter((e) => known.has(e.lineId) && fyIndexOfPeriod(settings, e.period) >= 0);
  /* A month submitted or approved on the Variance tab changes only through that tab. */
  await assertActualsUnlocked(budgetId, settings, valid.map((e) => e.period));
  await db.transaction(async (tx) => {
    for (const e of valid) {
      const key = and(eq(budgetActuals.budgetId, budgetId), eq(budgetActuals.period, e.period), eq(budgetActuals.lineId, e.lineId));
      if (!e.amount && !e.reason) {
        await tx.delete(budgetActuals).where(key);
        continue;
      }
      await tx
        .insert(budgetActuals)
        .values({ budgetId, period: e.period, lineId: e.lineId, amount: e.amount, reason: e.reason ?? null, source, updatedBy: ctx.userId })
        .onConflictDoUpdate({ target: [budgetActuals.budgetId, budgetActuals.period, budgetActuals.lineId], set: { amount: e.amount, reason: e.reason ?? null, source, updatedBy: ctx.userId, updatedAt: new Date() } });
    }
  });
  return valid.length;
}

/** Remember which ledger of the client's accounts belongs to which budget line. */
export async function saveLedgerMap(ctx: AuthContext, budgetId: string, map: Record<string, string>): Promise<void> {
  const { access, row } = await loadBudget(ctx, budgetId);
  if (!access.canEnterActuals) throw new BudgetError('forbidden', 403);
  const settings = row.settings as BudgetSettings;
  await db.update(budgets).set({ settings: { ...settings, ledgerMap: { ...settings.ledgerMap, ...map } } }).where(eq(budgets.id, budgetId));
}

/* ------------------------------------------------------------------ supporting documents */

async function assertRowVisible(ctx: AuthContext, budgetId: string, rowId: string) {
  const { access } = await loadBudget(ctx, budgetId);
  const section = await assertRow(budgetId, rowId);
  if (!access.visibleSections.includes(section)) throw new BudgetError('forbidden', 403);
  return { access, section };
}

export async function listAttachments(ctx: AuthContext, budgetId: string, rowId: string): Promise<AttachmentEntry[]> {
  await assertRowVisible(ctx, budgetId, rowId);
  const rows = await db.select().from(budgetAttachments).where(and(eq(budgetAttachments.budgetId, budgetId), eq(budgetAttachments.rowId, rowId), isNull(budgetAttachments.deletedAt))).orderBy(desc(budgetAttachments.createdAt));
  return rows.map((r) => ({ id: r.id, rowId: r.rowId, fileName: r.fileName, size: r.size, createdAt: r.createdAt.toISOString() }));
}

export async function addAttachment(ctx: AuthContext, budgetId: string, rowId: string, file: { name: string; type: string; bytes: Uint8Array }): Promise<void> {
  const { access, section } = await assertRowVisible(ctx, budgetId, rowId);
  if (!access.editableSections.includes(section)) throw new BudgetError('forbidden', 403);
  const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(-120);
  const storageKey = bucketKey('engagement-documents', `budgets/${budgetId}/${rowId}/${randomUUID()}-${safe}`);
  await putObject(storageKey, Buffer.from(file.bytes), file.type || 'application/octet-stream');
  await db.insert(budgetAttachments).values({ budgetId, rowId, fileName: file.name.slice(-200), contentType: file.type || null, size: file.bytes.byteLength, storageKey, uploadedBy: ctx.userId });
}

export async function attachmentDownloadUrl(ctx: AuthContext, budgetId: string, attachmentId: string): Promise<string> {
  const [a] = await db.select().from(budgetAttachments).where(and(eq(budgetAttachments.id, attachmentId), eq(budgetAttachments.budgetId, budgetId), isNull(budgetAttachments.deletedAt))).limit(1);
  if (!a) throw new BudgetError('not_found', 404);
  await assertRowVisible(ctx, budgetId, a.rowId);
  return signedDownloadUrl(a.storageKey);
}

export async function removeAttachment(ctx: AuthContext, budgetId: string, attachmentId: string): Promise<void> {
  const [a] = await db.select().from(budgetAttachments).where(and(eq(budgetAttachments.id, attachmentId), eq(budgetAttachments.budgetId, budgetId), isNull(budgetAttachments.deletedAt))).limit(1);
  if (!a) throw new BudgetError('not_found', 404);
  const { access, section } = await assertRowVisible(ctx, budgetId, a.rowId);
  if (!access.editableSections.includes(section)) throw new BudgetError('forbidden', 403);
  await db.update(budgetAttachments).set({ deletedAt: new Date() }).where(eq(budgetAttachments.id, attachmentId));
  await deleteObject(a.storageKey).catch(() => undefined);
}

