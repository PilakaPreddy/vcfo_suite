import 'server-only';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditEvents } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { auditResultOf, checklistItemLabel } from '@/lib/audit/audit-log';
import type { AuditEventRow, RecordAuditEventInput } from '@/lib/audit/audit-log';

/**
 * AUDIT EVENTS REPOSITORY — the write/read half of src/lib/audit/audit-log.ts.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Predicate: `src/lib/audit/audit-event-access.ts`.
 *   admin / super_admin — unrestricted (firm-wide)
 *   manager — events whose engagement_id is in owned/assigned set
 *             (`manager_id` + `engagement_managers` + legacy admin_id).
 *             Null engagement_id rows are dropped.
 *   intern  — actor_user_id = self OR engagement_id in assigned set
 *             (`intern_id` + `engagement_leads`). Own actor always.
 *             Unrelated-company and unscoped admin noise stay hidden.
 *   client  — engagement_id in own set (primary + `engagement_clients`).
 *
 * Insert: any authenticated user; actor_user_id forced to session user.
 */

function toRow(r: typeof auditEvents.$inferSelect): AuditEventRow {
  return {
    id: r.id,
    created_at: r.createdAt.toISOString(),
    actor_user_id: r.actorUserId,
    actor_role: r.actorRole,
    actor_email: r.actorEmail,
    actor_name: r.actorName,
    engagement_id: r.engagementId,
    action: r.action,
    summary: r.summary,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    result: auditResultOf({ result: r.result as AuditEventRow['result'] }),
  };
}

/**
 * Best-effort audit write; failures are logged and never thrown to callers.
 * That contract is deliberate and preserved from the original — an audit
 * failure must not roll back or block the user action it was describing.
 */
export async function recordAuditEvent(
  ctx: AuthContext,
  input: RecordAuditEventInput,
): Promise<void> {
  try {
    // Actor is ALWAYS the session user (the old WITH CHECK clause).
    const engagementUuid = input.engagementId
      ? engagementDbId(input.engagementId)
      : null;

    await db.insert(auditEvents).values({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: input.actorEmail ?? ctx.email ?? null,
      actorName: input.actorName ?? ctx.name ?? null,
      engagementId: engagementUuid,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata ?? {},
      result: input.result ?? 'ok',
    });
  } catch (err) {
    console.warn('[audit] record threw', err instanceof Error ? err.message : err);
  }
}

export interface ListAuditEventsOptions {
  engagementId?: string | null;
  /** Keyset pagination cursor — return events strictly older than this. */
  before?: Date;
  /**
   * Tie-break for `before`: the id of the last row already shown. With it, rows in the same
   * millisecond as the cursor are split by id, so a page boundary never skips or repeats one.
   */
  beforeId?: string;
  limit?: number;
}

/**
 * `created_at` to the millisecond. A JS Date carries milliseconds and Postgres keeps
 * microseconds, so the cursor compares and orders on the truncated value, then on id.
 */
const createdMs = sql`date_trunc('milliseconds', ${auditEvents.createdAt})`;

/** Admin/super (all), manager (owned clients), intern (own actor + shared clients). */
export async function listAuditEvents(
  ctx: AuthContext,
  options: ListAuditEventsOptions = {},
): Promise<AuditEventRow[]> {
  const { isAdminOrManager, isFirmWideAdmin } = await import('@/lib/auth');

  if (!isAdminOrManager(ctx.role) && ctx.role !== 'intern' && ctx.role !== 'client') {
    return [];
  }

  // Dynamic import avoids circular init with engagements → auditChecklistItemPatch.
  const { listScopedEngagementIds } = await import('@/db/repositories/engagements');
  const { engagementDbId } = await import('@/lib/projects/legacy-engagement-ids');

  const conds = [];
  if (options.engagementId) {
    const dbId = engagementDbId(options.engagementId);
    // Path A allowlist (includes lead/manager membership, not only primary pointer).
    if (!isFirmWideAdmin(ctx.role)) {
      const ids = await listScopedEngagementIds(ctx);
      if (!ids.includes(dbId)) return [];
    }
    conds.push(eq(auditEvents.engagementId, dbId));
  } else if (isFirmWideAdmin(ctx.role)) {
    // Firm-wide: no extra predicate.
  } else if (ctx.role === 'intern') {
    const ids = await listScopedEngagementIds(ctx);
    const internScope =
      ids.length > 0
        ? or(eq(auditEvents.actorUserId, ctx.userId), inArray(auditEvents.engagementId, ids))
        : eq(auditEvents.actorUserId, ctx.userId);
    conds.push(internScope);
  } else {
    const ids = await listScopedEngagementIds(ctx);
    if (ids.length === 0) return [];
    conds.push(inArray(auditEvents.engagementId, ids));
  }

  // A client sees only the client-visible actions, the same allowlist as the portal's own
  // Audit page (`client-audit.ts`), never staff-only actions on their engagement.
  const clientAudit = ctx.role === 'client' ? await import('@/db/repositories/client-audit') : null;
  if (clientAudit) conds.push(clientAudit.clientVisibleAuditPredicate());

  if (options.before && !Number.isNaN(options.before.getTime())) {
    if (options.beforeId) {
      // Sargable bound first, then the exact (millisecond, id) keyset.
      conds.push(lt(auditEvents.createdAt, new Date(options.before.getTime() + 1)));
      conds.push(
        or(
          sql`${createdMs} < ${options.before}`,
          and(sql`${createdMs} = ${options.before}`, lt(auditEvents.id, options.beforeId)),
        ),
      );
    } else {
      conds.push(lt(auditEvents.createdAt, options.before));
    }
  }

  // 501 so a route can ask for one more than its page and know whether an older page exists.
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 501);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(createdMs), desc(auditEvents.id))
    .limit(limit);

  if (clientAudit) {
    // Client-safe projection: no staff e-mail addresses, ids or metadata.
    return rows.map((r) => ({
      ...toRow(r),
      actor_email: null,
      summary: clientAudit.scrubForClient(r.summary),
      metadata: {},
    }));
  }
  return rows.map(toRow);
}

function isMilestoneDocStoragePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return false;
  const parts = trimmed.split('/');
  if (parts.length < 3) return false;
  const segment = parts[parts.length - 1] ?? '';
  const dash = segment.indexOf('-');
  return dash > 0 && /^\d+$/.test(segment.slice(0, dash));
}

function fileNameFromMilestonePath(path: string): string {
  const segment = path.split('/').pop() ?? path;
  const dash = segment.indexOf('-');
  if (dash > 0 && /^\d+$/.test(segment.slice(0, dash))) {
    return segment.slice(dash + 1);
  }
  return segment;
}

/**
 * Log deliver / milestone-document-remove side effects after a checklist patch.
 * Fire-and-forget, exactly as before — callers do not await this.
 */
export function auditChecklistItemPatch(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  patch: {
    deliveredToClientAt?: string;
    responses?: Record<string, string>;
  },
  previous?: Record<string, { responses?: Record<string, string> }>,
): void {
  if (patch.deliveredToClientAt?.trim()) {
    void recordAuditEvent(ctx, {
      engagementId: appEngagementId,
      action: 'checklist.deliver',
      summary: `Delivered milestone to client: ${checklistItemLabel(itemId)}`,
      metadata: { itemId },
    });
  }

  if (!patch.responses || !previous) return;

  const prevResponses = previous[itemId]?.responses ?? {};
  for (const [fieldId, newVal] of Object.entries(patch.responses)) {
    const oldVal = (prevResponses[fieldId] ?? '').trim();
    const nextVal = (newVal ?? '').trim();
    if (oldVal && isMilestoneDocStoragePath(oldVal) && !nextVal) {
      void recordAuditEvent(ctx, {
        engagementId: appEngagementId,
        action: 'milestone_document.remove',
        summary: `Removed milestone document: ${fileNameFromMilestonePath(oldVal)}`,
        metadata: { itemId, fieldId, previousPath: oldVal },
      });
    }
  }
}
