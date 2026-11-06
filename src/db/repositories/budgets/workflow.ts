import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { budgetChanges, budgetComments, budgetSectionOwners, budgetSections, budgets, budgetVersions } from '@/db/schema';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { computeBudget, sumSeries } from '@/lib/budget/engine';
import { fyName, type BudgetSection, type BudgetSettings } from '@/lib/budget/model';
import { BudgetError, assertEditable, loadBudget, loadRows, stateOf, type LoadedBudget } from './shared';

/**
 * The budget's path: tabs are filled and marked done, staff review and publish a frozen version,
 * the client approves it and the budget locks. A revision opens a new draft, and earlier versions
 * stay as they were.
 */

const noteOnLog = (budgetId: string, section: string, field: string, note: string | null | undefined, ctx: AuthContext) => ({
  budgetId,
  section,
  field,
  newValue: note ? { note } : null,
  actorId: ctx.userId,
  actorName: ctx.name,
});

/** Who fills a tab and by when. Owners must be people on this client. Returns the newly added owners. */
export async function setSectionOwners(ctx: AuthContext, budgetId: string, section: BudgetSection, input: { userIds: string[]; dueDate: string | null }, allowedUserIds: string[]): Promise<string[]> {
  const loaded = await loadBudget(ctx, budgetId);
  if (!loaded.access.canManage) throw new BudgetError('forbidden', 403);
  if (input.userIds.some((id) => !allowedUserIds.includes(id))) throw new BudgetError('owner_not_on_client', 400);
  const before = await db.select({ userId: budgetSectionOwners.userId }).from(budgetSectionOwners).where(and(eq(budgetSectionOwners.budgetId, budgetId), eq(budgetSectionOwners.section, section)));
  await db.transaction(async (tx) => {
    await tx.delete(budgetSectionOwners).where(and(eq(budgetSectionOwners.budgetId, budgetId), eq(budgetSectionOwners.section, section)));
    if (input.userIds.length) await tx.insert(budgetSectionOwners).values(input.userIds.map((userId) => ({ budgetId, section, userId })));
    await tx.update(budgetSections).set({ dueDate: input.dueDate, updatedAt: new Date() }).where(and(eq(budgetSections.budgetId, budgetId), eq(budgetSections.section, section)));
    await tx.insert(budgetChanges).values(noteOnLog(budgetId, section, 'owners changed', null, ctx));
  });
  const had = new Set(before.map((b) => b.userId));
  return input.userIds.filter((id) => !had.has(id));
}

/** An owner marks their tab done, or opens it again. A tab with errors cannot be marked done. */
export async function markSection(ctx: AuthContext, budgetId: string, section: BudgetSection, done: boolean): Promise<void> {
  const loaded = await loadBudget(ctx, budgetId);
  assertEditable(loaded, section);
  if (done) {
    const result = computeBudget(stateOf(loaded.row, await loadRows(budgetId)));
    const errors = result.issues.filter((i) => i.section === section && i.severity === 'error');
    if (errors.length) throw new BudgetError('section_has_errors', 409, { issues: errors.map((e) => e.message) });
  }
  await db
    .update(budgetSections)
    .set({ status: done ? 'done' : 'in_progress', note: done ? null : undefined, updatedAt: new Date() })
    .where(and(eq(budgetSections.budgetId, budgetId), eq(budgetSections.section, section)));
  await db.insert(budgetChanges).values(noteOnLog(budgetId, section, done ? 'marked done' : 'opened again', null, ctx));
}

/** A reviewer returns a tab to its owner, with the reason. */
export async function sendBackSection(ctx: AuthContext, budgetId: string, section: BudgetSection, note: string): Promise<void> {
  const loaded = await loadBudget(ctx, budgetId);
  if (!loaded.access.canManage) throw new BudgetError('forbidden', 403);
  if (loaded.row.status !== 'draft') throw new BudgetError('budget_locked', 409);
  await db.transaction(async (tx) => {
    await tx.update(budgetSections).set({ status: 'sent_back', note, updatedAt: new Date() }).where(and(eq(budgetSections.budgetId, budgetId), eq(budgetSections.section, section)));
    await tx.insert(budgetComments).values({ budgetId, section, body: note, authorId: ctx.userId, authorName: ctx.name });
    await tx.insert(budgetChanges).values(noteOnLog(budgetId, section, 'sent back', note, ctx));
  });
}

/** Freeze the budget as the next version. A budget with errors or unmapped rows cannot be published. */
export async function publishBudget(ctx: AuthContext, budgetId: string, note: string | null): Promise<{ version: number; grandTotal: number }> {
  const loaded = await loadBudget(ctx, budgetId);
  if (!loaded.access.canPublish) throw new BudgetError('forbidden', 403);
  if (loaded.row.status !== 'draft') throw new BudgetError('budget_locked', 409);
  const rows = await loadRows(budgetId);
  const state = stateOf(loaded.row, rows);
  const result = computeBudget(state);
  const errors = result.issues.filter((i) => i.severity === 'error').map((e) => e.message);
  for (const u of result.unmapped) errors.push(`${u.name}: choose a Master Budget line.`);
  if (errors.length) throw new BudgetError('has_errors', 409, { issues: [...new Set(errors)] });
  const version = loaded.row.currentVersion + 1;
  const grandTotal = sumSeries(result.grandTotal);
  await db.transaction(async (tx) => {
    await tx.insert(budgetVersions).values({ budgetId, version, snapshot: state, grandTotal, note, publishedBy: ctx.userId, publishedByName: ctx.name });
    await tx.update(budgets).set({ status: 'published', currentVersion: version, approvedBy: null, approvedByName: null, approvedAt: null, updatedAt: new Date() }).where(eq(budgets.id, budgetId));
    await tx.insert(budgetChanges).values(noteOnLog(budgetId, 'settings', `published version ${version}`, note, ctx));
  });
  await audit(ctx, loaded, 'budget.published', `Published version ${version} of the ${fyName(loaded.row.settings as BudgetSettings)} budget`, { version, grandTotal });
  return { version, grandTotal };
}

/** The client approves the published version, or a firm-wide admin records their approval. It locks. */
export async function approveBudget(ctx: AuthContext, budgetId: string, note: string | null): Promise<void> {
  const loaded = await loadBudget(ctx, budgetId);
  if (!loaded.access.canApprove) throw new BudgetError('forbidden', 403);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(budgets).set({ status: 'approved', approvedBy: ctx.userId, approvedByName: ctx.name, approvedAt: now, updatedAt: now }).where(eq(budgets.id, budgetId));
    await tx.update(budgetVersions).set({ approvedByName: ctx.name, approvedAt: now }).where(and(eq(budgetVersions.budgetId, budgetId), eq(budgetVersions.version, loaded.row.currentVersion)));
    await tx.insert(budgetChanges).values(noteOnLog(budgetId, 'settings', `approved version ${loaded.row.currentVersion}`, note, ctx));
  });
  await audit(ctx, loaded, 'budget.approved', `Approved version ${loaded.row.currentVersion} of the ${fyName(loaded.row.settings as BudgetSettings)} budget`, { version: loaded.row.currentVersion, note });
}

/** The approver returns the published version with a reason. The budget becomes a draft again. */
export async function rejectBudget(ctx: AuthContext, budgetId: string, note: string): Promise<void> {
  const loaded = await loadBudget(ctx, budgetId);
  if (!loaded.access.canApprove) throw new BudgetError('forbidden', 403);
  await db.transaction(async (tx) => {
    await tx.update(budgets).set({ status: 'draft', updatedAt: new Date() }).where(eq(budgets.id, budgetId));
    await tx.insert(budgetComments).values({ budgetId, section: 'settings', body: note, authorId: ctx.userId, authorName: ctx.name });
    await tx.insert(budgetChanges).values(noteOnLog(budgetId, 'settings', `returned version ${loaded.row.currentVersion}`, note, ctx));
  });
  await audit(ctx, loaded, 'budget.returned', `Returned version ${loaded.row.currentVersion} of the budget`, { note });
}

/** Open a controlled revision of a published or approved budget. Frozen versions do not change. */
export async function startRevision(ctx: AuthContext, budgetId: string, note: string): Promise<void> {
  const loaded = await loadBudget(ctx, budgetId);
  if (!loaded.access.canPublish) throw new BudgetError('forbidden', 403);
  if (loaded.row.status === 'draft') return;
  await db.transaction(async (tx) => {
    await tx.update(budgets).set({ status: 'draft', approvedBy: null, approvedByName: null, approvedAt: null, updatedAt: new Date() }).where(eq(budgets.id, budgetId));
    await tx.update(budgetSections).set({ status: 'in_progress', updatedAt: new Date() }).where(and(eq(budgetSections.budgetId, budgetId), inArray(budgetSections.status, ['done', 'sent_back'])));
    await tx.insert(budgetChanges).values(noteOnLog(budgetId, 'settings', 'revision started', note, ctx));
  });
  await audit(ctx, loaded, 'budget.revision', 'Started a revision of the budget', { note });
}

async function audit(ctx: AuthContext, loaded: LoadedBudget, action: string, summary: string, metadata: Record<string, unknown>) {
  await recordAuditEvent(ctx, { engagementId: loaded.row.engagementId, action, summary, metadata: { budgetId: loaded.row.id, ...metadata } });
}

/** Record an export in the audit log; the file holds salary totals and client figures. */
export async function recordBudgetExport(ctx: AuthContext, budgetId: string, format: string): Promise<void> {
  const loaded = await loadBudget(ctx, budgetId);
  await audit(ctx, loaded, 'budget.exported', `Exported the budget as ${format}`, { format });
}

