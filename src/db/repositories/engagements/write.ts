import 'server-only';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { engagementStepEvents, engagements } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { normalizeParentIndianRelationship } from '@/data/engagements';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { isFirmWideAdmin } from '@/lib/auth';
import { ensureEngagementClientMember } from '@/db/repositories/engagement-clients';
import { ensureEngagementLead } from '@/db/repositories/engagement-leads-membership';
import { ensureEngagementManager } from '@/db/repositories/engagement-managers-membership';
import type { EngagementDbRow } from './scope';
import { getEngagementById } from './read';
import { writeStepEvents } from '@/db/repositories/step-events';
import { markAskedFieldsAnswered } from '@/db/repositories/step-field-answers';
import { stepHolders } from '@/lib/metrics/step-holder';
import { holderChanges } from '@/lib/metrics/client-holder-trend';
import { diffStepChanges } from '@/lib/metrics/step-timing';
import { newlyAwaitingReview, queueStaffAlert } from '@/lib/notify/staff-alerts';

/** Engagement row writes: create, checklist_state, metadata, progress CC, soft delete and restore. */

/** Admin or manager may create. Callers must have passed requireAdminOrManager(). */
export async function createEngagement(
  ctx: AuthContext,
  input: typeof engagements.$inferInsert,
) {
  if (!isFirmWideAdmin(ctx.role) && ctx.role !== 'manager') {
    throw new Error('Only admins or managers may create engagements');
  }
  const [row] = await db.insert(engagements).values(input).returning();
  if (row.clientUserId) {
    await ensureEngagementClientMember({
      engagementDbId: row.id,
      userId: row.clientUserId,
      memberRole: 'owner',
      invitedBy: ctx.userId,
    });
  }
  if (row.internId?.trim()) {
    await ensureEngagementLead({
      engagementDbId: row.id,
      internId: row.internId,
      invitedBy: ctx.userId,
    });
  }
  if (row.managerId) {
    await ensureEngagementManager({
      engagementDbId: row.id,
      managerId: row.managerId,
      invitedBy: ctx.userId,
    });
  }
  return row;
}

/**
 * Update checklist_state. Managers/interns may update assigned engagements;
 * clients may only update their own engagement's checklist_state (the old
 * engagements_guard_client_update trigger enforced column-level limits —
 * reproduce that guard here or in the calling route).
 *
 * Pass a function to change the state safely while other saves run. The row is
 * locked (`select … for update`) inside one transaction, the function gets the
 * state as stored at that moment, and its result is written before the lock is
 * released. Two saves of one project therefore run one after the other, and the
 * second always starts from what the first wrote. Before this, a save read the
 * row, merged in memory and wrote the whole state back, so an autosave that read
 * just before a submit could put the old state back over it and drop the
 * submit's "submitted" mark (UAT T-09 and D-T13-02, 10 Nov 2026).
 *
 * Passing a finished state object still works and still writes inside the lock,
 * but it cannot merge with a save that ran meanwhile; new callers pass a function.
 */
export async function updateChecklistState(
  ctx: AuthContext,
  id: string,
  next: Record<string, unknown> | ((current: Record<string, unknown> | null) => Record<string, unknown>),
) {
  const existing = await getEngagementById(ctx, id);
  if (!existing) throw new Error('Engagement not found or not permitted');

  const result = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ checklistState: engagements.checklistState })
      .from(engagements)
      .where(eq(engagements.id, existing.id))
      .for('update');
    const before = (locked?.checklistState ?? null) as Record<string, unknown> | null;
    const nextState = typeof next === 'function' ? next(before) : next;

    // A status or review change also writes one engagement_step_events row per step, in the
    // same transaction, so "opened at", "days in step" and the review history never disagree
    // with the stored state.
    const diff = diffStepChanges(before, nextState);
    // Each event also keeps who holds the step now (migration 0028), on the client home's rule.
    const holders = diff.length ? stepHolders(nextState, diff.map((c) => c.stepId)) : {};
    // A gated step can change hands without a status change of its own, so holder-only rows are
    // added for those; the first save with no holder history writes a baseline for every model
    // step (client home trend lines, `client-holder-trend.ts`).
    const [hasHolders] = await tx
      .select({ id: engagementStepEvents.id })
      .from(engagementStepEvents)
      .where(and(eq(engagementStepEvents.engagementId, existing.id), isNotNull(engagementStepEvents.holder)))
      .limit(1);
    const changes = [
      ...diff.map((c) => ({ ...c, holder: holders[c.stepId] ?? null })),
      ...holderChanges(before, nextState, new Set(diff.map((c) => c.stepId)), !hasHolders),
    ];
    const now = new Date();
    const [row] = await tx
      .update(engagements)
      .set({ checklistState: nextState, updatedAt: now })
      .where(eq(engagements.id, existing.id))
      .returning();
    if (changes.length) await writeStepEvents(ctx, tx, existing.id, changes, now);
    return { row, before, nextState, changes };
  });

  // S-497: a client's save turns the fields staff asked for into "answered". Best effort.
  if (ctx.role === 'client') await markAskedFieldsAnswered(existing.id, result.before, result.nextState);
  // An approval that starts waiting emails the engagement's managers (queued, never blocks).
  const waiting = result.changes.length ? newlyAwaitingReview(result.before, result.changes) : [];
  if (waiting.length) void queueStaffAlert({ kind: 'approval', engagementDbId: existing.id, stepIds: waiting });
  return result.row;
}

export async function updateEngagement(
  ctx: AuthContext,
  id: string,
  patch: Partial<typeof engagements.$inferInsert>,
) {
  if (ctx.role === 'client') {
    throw new Error('Clients may not edit engagement metadata');
  }
  const existing = await getEngagementById(ctx, id);
  if (!existing) throw new Error('Engagement not found or not permitted');
  const touchesOwnership =
    patch.ownershipType !== undefined ||
    patch.companyType !== undefined ||
    patch.parentIndianRelationship !== undefined;
  if (touchesOwnership) {
    // Only when ownership is being edited: a legacy Indian-subsidiary row with no
    // role chosen must still accept unrelated patches (stage, lead, …).
    const next = normalizeParentIndianRelationship({
      ownershipType: patch.ownershipType ?? existing.ownershipType,
      companyType: patch.companyType ?? existing.companyType,
      parentIndianRelationship:
        patch.parentIndianRelationship !== undefined
          ? patch.parentIndianRelationship
          : existing.parentIndianRelationship,
    });
    if (next.missing) throw new Error('parent_indian_relationship_required');
    patch = { ...patch, parentIndianRelationship: next.value };
  }
  const [row] = await db
    .update(engagements)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(engagements.id, id))
    .returning();
  if (patch.internId !== undefined && patch.internId?.trim()) {
    await ensureEngagementLead({
      engagementDbId: id,
      internId: patch.internId,
      invitedBy: ctx.userId,
    });
  }
  if (patch.managerId !== undefined) {
    if (patch.managerId) {
      await ensureEngagementManager({
        engagementDbId: id,
        managerId: patch.managerId,
        invitedBy: ctx.userId,
      });
    }
  }
  return row;
}

export async function updateProgressCcEmails(
  ctx: AuthContext,
  appOrDbId: string,
  emails: string[],
): Promise<string[]> {
  if (ctx.role === 'client') {
    throw new Error('Clients may not update progress CC');
  }
  const existing = await getEngagementById(ctx, engagementDbId(appOrDbId));
  if (!existing) throw new Error('Engagement not found or not permitted');
  const [row] = await db
    .update(engagements)
    .set({ progressCcEmails: emails, updatedAt: new Date() })
    .where(eq(engagements.id, existing.id))
    .returning({ progressCcEmails: engagements.progressCcEmails });
  return row?.progressCcEmails ?? emails;
}

/* ── Soft delete ────────────────────────────────────────────────────────────
   `scopeFor()` already excludes rows with a non-null deleted_at, so setting it
   removes the project from every list, detail page, and client portal at once
   without destroying documents, checklist history, or the audit trail. Only a
   firm-wide admin may delete or restore; managers go through a change request. */

export async function softDeleteEngagement(
  ctx: AuthContext,
  appOrDbId: string,
): Promise<EngagementDbRow> {
  if (!isFirmWideAdmin(ctx.role)) {
    throw new Error('Only firm admins may delete projects');
  }
  const dbId = engagementDbId(appOrDbId);
  const [row] = await db
    .update(engagements)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(engagements.id, dbId), isNull(engagements.deletedAt)))
    .returning();
  if (!row) throw new Error('Engagement not found');
  return row;
}

export async function restoreEngagement(
  ctx: AuthContext,
  appOrDbId: string,
): Promise<EngagementDbRow> {
  if (!isFirmWideAdmin(ctx.role)) {
    throw new Error('Only firm admins may restore projects');
  }
  const dbId = engagementDbId(appOrDbId);
  const [row] = await db
    .update(engagements)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(engagements.id, dbId))
    .returning();
  if (!row) throw new Error('Engagement not found');
  return row;
}
