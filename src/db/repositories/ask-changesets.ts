import 'server-only';

import { and, asc, eq, gt, inArray, max } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { askChangesetRows, askChangesets } from '@/db/schema-ask';
import { isAdminOrManager } from '@/lib/auth';
import { AskForbiddenError, assertAskRole } from '@/lib/ask/access';
import { changesetHash } from '@/lib/ask/changeset/hash';
import type { ChangesetDraft, ChangesetRowDraft, ChangesetStatus, JsonValue } from '@/lib/ask/changeset/types';

/**
 * Review cards. A card belongs to the person it was prepared for, inside an engagement they can
 * still reach. A manager or firm admin on that engagement also reads a card that holds a row only
 * they may approve. Nobody else sees one, whatever their role. `getAskChangesetForDecision` holds
 * raw values for the code that applies them; anything shown to a person goes through
 * `getAskChangesetSummary`, whose rows carry `displayOld` and `displayNew` only.
 */
export type AskChangesetRow = typeof askChangesets.$inferSelect;
export type AskChangesetRowRow = typeof askChangesetRows.$inferSelect;
export type AskChangesetRowSummary = Omit<AskChangesetRowRow, 'oldValue' | 'newValue' | 'undoData'>;

export interface ChangesetAccess {
  changeset: AskChangesetRow;
  rows: AskChangesetRowRow[];
  companyName: string;
  viewerId: string;
  /** Prepared for this person. */
  owner: boolean;
  /** May approve a row that only a manager may approve. */
  manager: boolean;
}

export const rowNeedsManager = (row: Pick<AskChangesetRowRow, 'target'>): boolean => row.target.needsManager === true;

export async function createAskChangeset(
  ctx: AuthContext,
  input: { draft: ChangesetDraft; contentHash: string; conversationId: string | null; runId: string | null; expiresAt: Date },
): Promise<string | null> {
  assertAskRole(ctx);
  const access = input.draft.engagementId ? await assertEngagementAccess(ctx, input.draft.engagementId) : null;
  if (access && !access.ok) return null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(askChangesets)
      .values({
        profileId: ctx.userId,
        conversationId: input.conversationId,
        runId: input.runId,
        engagementId: access?.ok ? access.dbId : null,
        title: input.draft.title,
        tier: input.draft.tier,
        contentHash: input.contentHash,
        recipients: input.draft.recipients,
        expiresAt: input.expiresAt,
      })
      .returning({ id: askChangesets.id });
    await tx.insert(askChangesetRows).values(
      input.draft.rows.map((draft, ordinal) => ({
        changesetId: row!.id,
        ordinal,
        action: draft.action,
        target: draft.target,
        label: draft.label,
        oldValue: draft.oldValue,
        newValue: draft.newValue,
        displayOld: draft.displayOld,
        displayNew: draft.displayNew,
        sensitive: draft.sensitive,
        source: draft.source,
        checks: draft.checks,
        status: draft.heldReason ? 'held' : 'proposed',
        heldReason: draft.heldReason,
      })),
    );
    return row!.id;
  });
}

/**
 * Adds rows to the caller's own card while it still waits for its first decision, for the drop's
 * "Where should these go?" reply. The content hash is recomputed over every row, so a person looking
 * at the card before the rows arrived is asked to look again before accepting. Returns false, adding
 * nothing, when the card is not the caller's, was decided, or has expired.
 */
export async function appendAskChangesetRows(
  ctx: AuthContext,
  id: string,
  drafts: readonly ChangesetRowDraft[],
  now: Date,
  opts: { title?: (rows: ReadonlyArray<{ action: string }>) => string } = {},
): Promise<boolean> {
  assertAskRole(ctx);
  if (drafts.length === 0) return true;
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select({ id: askChangesets.id })
      .from(askChangesets)
      .where(and(eq(askChangesets.id, id), eq(askChangesets.profileId, ctx.userId), eq(askChangesets.status, 'proposed'), gt(askChangesets.expiresAt, now)))
      .for('update')
      .limit(1);
    if (!open) return false;
    const [last] = await tx.select({ ordinal: max(askChangesetRows.ordinal) }).from(askChangesetRows).where(eq(askChangesetRows.changesetId, id));
    const start = (last?.ordinal ?? -1) + 1;
    await tx.insert(askChangesetRows).values(
      drafts.map((draft, i) => ({
        changesetId: id,
        ordinal: start + i,
        action: draft.action,
        target: draft.target,
        label: draft.label,
        oldValue: draft.oldValue,
        newValue: draft.newValue,
        displayOld: draft.displayOld,
        displayNew: draft.displayNew,
        sensitive: draft.sensitive,
        source: draft.source,
        checks: draft.checks,
        status: draft.heldReason ? 'held' : 'proposed',
        heldReason: draft.heldReason,
      })),
    );
    const rows = await tx.select().from(askChangesetRows).where(eq(askChangesetRows.changesetId, id)).orderBy(asc(askChangesetRows.ordinal));
    const contentHash = changesetHash(rows.map((r) => ({ action: r.action, target: r.target as JsonValue, newValue: r.newValue as JsonValue })));
    // The title counts every row, so a card that gained rows from a reply says so.
    await tx.update(askChangesets).set({ contentHash, ...(opts.title ? { title: opts.title(rows) } : {}) }).where(eq(askChangesets.id, id));
    return true;
  });
}

/**
 * The caller's own cards for one run, each with its client and the attachments its rows came from.
 * A retried drop step uses it to keep the cards an earlier try already made, rather than make them
 * twice.
 */
export async function listAskRunChangesets(
  ctx: AuthContext,
  runId: string,
): Promise<Array<{ id: string; engagementId: string; companyName: string; attachmentIds: string[] }>> {
  assertAskRole(ctx);
  const cards = await db
    .select({ id: askChangesets.id, engagementId: askChangesets.engagementId })
    .from(askChangesets)
    .where(and(eq(askChangesets.runId, runId), eq(askChangesets.profileId, ctx.userId)))
    .orderBy(asc(askChangesets.createdAt));
  if (cards.length === 0) return [];
  const rows = await db
    .select({ changesetId: askChangesetRows.changesetId, source: askChangesetRows.source })
    .from(askChangesetRows)
    .where(inArray(askChangesetRows.changesetId, cards.map((c) => c.id)));
  const out: Array<{ id: string; engagementId: string; companyName: string; attachmentIds: string[] }> = [];
  for (const card of cards) {
    if (!card.engagementId) continue;
    const access = await assertEngagementAccess(ctx, card.engagementId);
    if (!access.ok) continue;
    const attachmentIds = [...new Set(rows.filter((r) => r.changesetId === card.id).flatMap((r) => (r.source?.attachmentId ? [r.source.attachmentId] : [])))];
    out.push({ id: card.id, engagementId: access.dbId, companyName: access.row.companyName, attachmentIds });
  }
  return out;
}

export async function getAskChangesetForDecision(ctx: AuthContext, id: string): Promise<ChangesetAccess | null> {
  assertAskRole(ctx);
  const [changeset] = await db.select().from(askChangesets).where(eq(askChangesets.id, id)).limit(1);
  if (!changeset) return null;
  const access = changeset.engagementId ? await assertEngagementAccess(ctx, changeset.engagementId) : null;
  if (access && !access.ok) return null;
  const rows = await db.select().from(askChangesetRows).where(eq(askChangesetRows.changesetId, id)).orderBy(asc(askChangesetRows.ordinal));
  const owner = changeset.profileId === ctx.userId;
  const manager = isAdminOrManager(ctx.role) && access !== null;
  if (!owner && !(manager && rows.some(rowNeedsManager))) return null;
  return { changeset, rows, companyName: access?.ok ? access.row.companyName : '', viewerId: ctx.userId, owner, manager };
}

export type ChangesetSummary = Omit<ChangesetAccess, 'rows'> & { rows: AskChangesetRowSummary[] };

export async function getAskChangesetSummary(ctx: AuthContext, id: string): Promise<ChangesetSummary | null> {
  const found = await getAskChangesetForDecision(ctx, id);
  if (!found) return null;
  return { ...found, rows: found.rows.map(({ oldValue: _old, newValue: _new, undoData: _undo, ...row }) => row) };
}

/** Writes below take the access just read for this person, so a card cannot be changed by anyone else. */
function assertDecider(ctx: AuthContext, found: ChangesetAccess): void {
  if (found.viewerId !== ctx.userId) throw new AskForbiddenError('This card belongs to someone else.');
}

/** The one moment a card is approved: this exact content, still open, by one click only. */
export async function claimAskChangeset(ctx: AuthContext, found: ChangesetAccess, contentHash: string, now: Date): Promise<boolean> {
  assertDecider(ctx, found);
  const rows = await db
    .update(askChangesets)
    .set({ status: 'approved', decidedById: ctx.userId, decidedAt: now })
    .where(
      and(
        eq(askChangesets.id, found.changeset.id),
        inArray(askChangesets.status, ['proposed', 'partly_applied']),
        eq(askChangesets.contentHash, contentHash),
        gt(askChangesets.expiresAt, now),
      ),
    )
    .returning({ id: askChangesets.id });
  return rows.length > 0;
}

export async function setAskChangesetStatus(
  ctx: AuthContext,
  found: ChangesetAccess,
  status: ChangesetStatus,
  patch: { appliedAt?: Date; undoneAt?: Date; decidedAt?: Date } = {},
): Promise<void> {
  assertDecider(ctx, found);
  await db
    .update(askChangesets)
    .set({ status, ...patch, ...(patch.decidedAt ? { decidedById: ctx.userId } : {}) })
    .where(eq(askChangesets.id, found.changeset.id));
}

export async function updateAskChangesetRows(
  ctx: AuthContext,
  found: ChangesetAccess,
  updates: ReadonlyArray<{ id: string; patch: Partial<Pick<AskChangesetRowRow, 'status' | 'checks' | 'heldReason' | 'error' | 'undoData' | 'appliedAt' | 'newValue' | 'oldValue' | 'displayOld' | 'displayNew' | 'target'>> }>,
  contentHash?: string,
): Promise<void> {
  assertDecider(ctx, found);
  for (const { id, patch } of updates) {
    await db
      .update(askChangesetRows)
      .set(patch)
      .where(and(eq(askChangesetRows.id, id), eq(askChangesetRows.changesetId, found.changeset.id)));
  }
  if (contentHash) await db.update(askChangesets).set({ contentHash }).where(eq(askChangesets.id, found.changeset.id));
}
