import 'server-only';
import { and, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import {
  complianceInstances,
  complianceObligations,
  engagements,
  itemWindowRequests,
  profiles,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { checklistItemLabel } from '@/lib/audit/audit-log';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { canSetScheduleWindows, normalizeEngagementSchedule, windowForStep } from '@/lib/projects/schedule-windows';
import { parseItemKey } from '@/lib/work/item-key';
import { canRequestWindowChange } from '@/lib/work/work-access';
import {
  isWindowRequestStatus,
  resolveRequestedWindow,
  windowKindOf,
  type WindowRequestDto,
  type WindowRequestStatus,
} from '@/lib/work/window-requests';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { assertEngagementAccess, listScopedEngagementIds } from '@/db/repositories/engagements';
import { currentItemWindow, resolveWorkItem } from '@/db/repositories/work-items';
import { setComplianceInstanceWindow, setEngagementWindow } from '@/db/repositories/schedule';
import { titleWithPeriod } from '@/lib/compliance/period-title';

/**
 * ITEM WINDOW REQUESTS — a lead asks the manager to move a manager-set date window on
 * one step or filing (G-17), table `item_window_requests`.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   create   — project lead only, on an item they can resolve (`resolveWorkItem`) that
 *              has a manager-set window today; one pending request per item per lead.
 *   list     — lead: their own requests on engagements still in their scope;
 *              manager: requests on engagements in their scope; admin / super admin:
 *              every request. Client / developer: nothing.
 *   decide   — manager on their engagement, admin, super admin
 *              (`canSetScheduleWindows`). Approve applies the window through the
 *              schedule repository (`setEngagementWindow` or
 *              `setComplianceInstanceWindow`), which re-checks the same rule.
 *              Reject needs a note.
 *   withdraw — the lead who asked, while the request is pending.
 */

type Row = typeof itemWindowRequests.$inferSelect;

const decider = alias(profiles, 'decider');

export interface CreateWindowRequestInput {
  itemKey: string;
  fromDate?: string | null;
  toDate: string;
  reason: string;
}

async function itemTitles(rows: Row[]): Promise<Map<string, { title: string; window: { from: string; to: string } | null }>> {
  const out = new Map<string, { title: string; window: { from: string; to: string } | null }>();
  const filingIds: string[] = [];
  for (const row of rows) {
    const ref = parseItemKey(row.itemKey);
    if (ref?.kind === 'filing') filingIds.push(ref.id);
  }
  if (filingIds.length === 0) return out;
  const instances = await db
    .select({
      id: complianceInstances.id,
      particular: complianceObligations.particular,
      periodLabel: complianceInstances.periodLabel,
      windowFrom: complianceInstances.windowFrom,
      windowTo: complianceInstances.windowTo,
    })
    .from(complianceInstances)
    .innerJoin(complianceObligations, eq(complianceObligations.id, complianceInstances.obligationId))
    .where(inArray(complianceInstances.id, [...new Set(filingIds)]));
  for (const inst of instances) {
    out.set(`filing:${inst.id}`, {
      title: titleWithPeriod(inst.particular, inst.periodLabel),
      window: inst.windowFrom && inst.windowTo ? { from: inst.windowFrom, to: inst.windowTo } : null,
    });
  }
  return out;
}

export async function listWindowRequests(
  ctx: AuthContext,
  options: { status?: WindowRequestStatus | 'all'; itemKey?: string } = {},
): Promise<WindowRequestDto[]> {
  if (ctx.role !== 'intern' && ctx.role !== 'manager' && !isFirmWideAdmin(ctx.role)) return [];

  const conds: SQL[] = [isNull(engagements.deletedAt)];
  if (!isFirmWideAdmin(ctx.role)) {
    const ids = await listScopedEngagementIds(ctx);
    if (ids.length === 0) return [];
    conds.push(inArray(itemWindowRequests.engagementId, ids));
  }
  if (ctx.role === 'intern') conds.push(eq(itemWindowRequests.requestedBy, ctx.userId));
  const status = options.status ?? 'pending';
  if (status !== 'all') conds.push(eq(itemWindowRequests.status, status));
  if (options.itemKey) {
    const item = await resolveWorkItem(ctx, options.itemKey);
    if (!item) return [];
    conds.push(eq(itemWindowRequests.itemKey, item.key));
  }

  const rows = await db
    .select({
      request: itemWindowRequests,
      companyName: engagements.companyName,
      schedule: engagements.schedule,
      requestedByName: profiles.name,
      decidedByName: decider.name,
    })
    .from(itemWindowRequests)
    .innerJoin(engagements, eq(engagements.id, itemWindowRequests.engagementId))
    .leftJoin(profiles, eq(profiles.id, itemWindowRequests.requestedBy))
    .leftJoin(decider, eq(decider.id, itemWindowRequests.decidedBy))
    .where(and(...conds))
    .orderBy(desc(itemWindowRequests.createdAt))
    .limit(200);

  const filings = await itemTitles(rows.map((r) => r.request));
  return rows.map((r) => {
    const row = r.request;
    const ref = parseItemKey(row.itemKey);
    let itemTitle = row.itemKey;
    let currentWindow: { from: string; to: string } | null = null;
    if (ref?.kind === 'step') {
      itemTitle = checklistItemLabel(ref.stepId);
      const w = windowForStep(normalizeEngagementSchedule(r.schedule), ref.stepId);
      currentWindow = w ? { from: w.from, to: w.to } : null;
    } else if (ref?.kind === 'filing') {
      const f = filings.get(row.itemKey);
      itemTitle = f?.title ?? 'Filing';
      currentWindow = f?.window ?? null;
    }
    return {
      id: row.id,
      engagementId: appEngagementId(row.engagementId),
      companyName: r.companyName,
      itemKey: row.itemKey,
      itemTitle,
      requestedBy: row.requestedBy,
      requestedByName: r.requestedByName ?? null,
      fromDate: row.fromDate,
      toDate: row.toDate,
      reason: row.reason,
      status: isWindowRequestStatus(row.status) ? row.status : 'pending',
      decidedByName: r.decidedByName ?? null,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      decisionNote: row.decisionNote,
      createdAt: row.createdAt.toISOString(),
      currentWindow,
    };
  });
}

export async function createWindowRequest(ctx: AuthContext, input: CreateWindowRequestInput): Promise<Row | null> {
  if (!canRequestWindowChange(ctx.role)) throw new Error('forbidden');
  const reason = input.reason.trim().slice(0, 1000);
  if (!reason) throw new Error('invalid_reason');
  if (!windowKindOf(input.itemKey)) throw new Error('invalid_item');
  const item = await resolveWorkItem(ctx, input.itemKey);
  if (!item) return null;
  const current = await currentItemWindow(item);
  if (!current) throw new Error('invalid_no_window');
  const window = resolveRequestedWindow(current, { from: input.fromDate ?? null, to: input.toDate });
  if (!window) throw new Error('invalid_window');
  if (window.from === current.from && window.to === current.to) throw new Error('invalid_same_window');

  const [pending] = await db
    .select({ id: itemWindowRequests.id })
    .from(itemWindowRequests)
    .where(
      and(
        eq(itemWindowRequests.itemKey, item.key),
        eq(itemWindowRequests.requestedBy, ctx.userId),
        eq(itemWindowRequests.status, 'pending'),
      ),
    )
    .limit(1);
  if (pending) throw new Error('request_pending');

  const [row] = await db
    .insert(itemWindowRequests)
    .values({
      engagementId: item.engagementId,
      itemKey: item.key,
      requestedBy: ctx.userId,
      fromDate: window.from,
      toDate: window.to,
      reason,
    })
    .returning();
  if (!row) return null;
  void recordAuditEvent(ctx, {
    engagementId: item.engagementId,
    action: 'schedule.window.requested',
    summary: `Date change requested ${window.from} → ${window.to}`,
    metadata: { itemKey: item.key, requestId: row.id, window, current },
  });
  return row;
}

async function loadRow(id: string): Promise<Row | null> {
  const [row] = await db.select().from(itemWindowRequests).where(eq(itemWindowRequests.id, id)).limit(1);
  return row ?? null;
}

/** Manager / admin approve (apply the window) or reject (note required) a pending request. */
export async function decideWindowRequest(
  ctx: AuthContext,
  id: string,
  decision: { action: 'approve' | 'reject'; note?: string | null },
): Promise<Row | null> {
  if (!canSetScheduleWindows(ctx.role)) throw new Error('forbidden');
  const row = await loadRow(id);
  if (!row) return null;
  const access = await assertEngagementAccess(ctx, row.engagementId);
  if (!access.ok) return null;
  if (row.status !== 'pending') throw new Error('request_closed');
  const note = decision.note?.trim().slice(0, 1000) || null;
  if (decision.action === 'reject' && !note) throw new Error('invalid_note');

  const ref = parseItemKey(row.itemKey);
  if (decision.action === 'approve') {
    const window = { from: row.fromDate ?? row.toDate, to: row.toDate };
    if (ref?.kind === 'step') {
      await setEngagementWindow(ctx, access.dbId, { kind: 'step', itemId: ref.stepId }, window);
    } else if (ref?.kind === 'filing') {
      await setComplianceInstanceWindow(ctx, ref.id, window);
    } else {
      throw new Error('invalid_item');
    }
  }

  const [updated] = await db
    .update(itemWindowRequests)
    .set({
      status: decision.action === 'approve' ? 'approved' : 'rejected',
      decidedBy: ctx.userId,
      decidedAt: new Date(),
      decisionNote: note,
    })
    .where(and(eq(itemWindowRequests.id, row.id), eq(itemWindowRequests.status, 'pending')))
    .returning();
  void recordAuditEvent(ctx, {
    engagementId: access.dbId,
    action: decision.action === 'approve' ? 'schedule.window.request.approved' : 'schedule.window.request.rejected',
    summary:
      decision.action === 'approve'
        ? `Date change approved ${row.fromDate ?? row.toDate} → ${row.toDate}`
        : `Date change rejected: ${note}`,
    metadata: { itemKey: row.itemKey, requestId: row.id },
  });
  return updated ?? null;
}

/** The lead who asked withdraws a pending request. Anyone else's request reads as null. */
export async function withdrawWindowRequest(ctx: AuthContext, id: string): Promise<Row | null> {
  if (!canRequestWindowChange(ctx.role)) throw new Error('forbidden');
  const row = await loadRow(id);
  if (!row || row.requestedBy !== ctx.userId) return null;
  const access = await assertEngagementAccess(ctx, row.engagementId);
  if (!access.ok) return null;
  if (row.status !== 'pending') throw new Error('request_closed');
  const [updated] = await db
    .update(itemWindowRequests)
    .set({ status: 'withdrawn', decidedAt: new Date() })
    .where(
      and(
        eq(itemWindowRequests.id, row.id),
        eq(itemWindowRequests.requestedBy, ctx.userId),
        eq(itemWindowRequests.status, 'pending'),
      ),
    )
    .returning();
  void recordAuditEvent(ctx, {
    engagementId: access.dbId,
    action: 'schedule.window.request.withdrawn',
    summary: 'Date change request withdrawn',
    metadata: { itemKey: row.itemKey, requestId: row.id },
  });
  return updated ?? null;
}
