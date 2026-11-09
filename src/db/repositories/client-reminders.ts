import 'server-only';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditEvents,
  notificationDeliveries,
  complianceEvents,
  complianceInstances,
  complianceObligations,
  documentRequests,
  tasks,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { getItem } from '@/data/checklist';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { isMessageStaff } from '@/db/repositories/client-messages';
import { appEngagementId, engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { clientIncorporationPath } from '@/lib/projects/project-step-path';
import { isUuid } from '@/lib/slug';
import { parseItemKey } from '@/lib/work/item-key';
import { titleWithPeriod } from '@/lib/compliance/period-title';

/**
 * CLIENT REMINDERS REPOSITORY (G-15). Read side of `POST /api/engagements/:id/remind`.
 *
 * >>> ACCESS CONTROL <<<
 *   Staff only (lead, manager, admin, super admin), on an engagement in their scope
 *   (`assertEngagementAccess`). The item must belong to that engagement: a filing, request
 *   or task id from another engagement resolves to null, so its title never leaks.
 *   Clients and developers get null before any query.
 *
 * The rate limit (one reminder per item per 24 hours) reads the audit trail: every sent
 * reminder writes an `audit_events` row with action `REMINDER_AUDIT_ACTION` and the item key
 * in its metadata.
 */

export const REMINDER_AUDIT_ACTION = 'client.reminder_sent';
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ReminderTarget {
  engagementDbId: string;
  /** App id (legacy `e1` or the uuid) for links and fan-out helpers. */
  engagementId: string;
  companyName: string;
  itemKey: string;
  itemTitle: string;
  /** Client portal page the reminder links to. */
  clientPath: string;
  /** Kind of item, for the WhatsApp template choice. */
  kind: 'step' | 'filing' | 'event' | 'request' | 'task';
}

export type ResolveReminderResult =
  | { ok: true; target: ReminderTarget }
  | { ok: false; reason: 'not_found' | 'invalid_item' };

const FILINGS_PATH = '/app/client/compliances/filings';

export async function resolveReminderTarget(
  ctx: AuthContext,
  engagementId: string,
  itemKey: string,
): Promise<ResolveReminderResult> {
  if (!isMessageStaff(ctx.role)) return { ok: false, reason: 'not_found' };
  const ref = parseItemKey(itemKey);
  if (!ref) return { ok: false, reason: 'invalid_item' };

  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) return { ok: false, reason: 'not_found' };
  const base = {
    engagementDbId: access.dbId,
    engagementId: appEngagementId(access.dbId),
    companyName: access.row.companyName,
    itemKey,
  };

  if (ref.kind === 'step') {
    if (engagementDbId(ref.engagementId) !== access.dbId) return { ok: false, reason: 'invalid_item' };
    const def = getItem(ref.stepId);
    if (!def) return { ok: false, reason: 'invalid_item' };
    return {
      ok: true,
      target: { ...base, kind: 'step', itemTitle: def.title, clientPath: clientIncorporationPath(def.id) },
    };
  }

  if (!isUuid(ref.id)) return { ok: false, reason: 'invalid_item' };

  if (ref.kind === 'filing') {
    const [row] = await db
      .select({
        engagementId: complianceInstances.engagementId,
        particular: complianceObligations.particular,
        periodLabel: complianceInstances.periodLabel,
      })
      .from(complianceInstances)
      .innerJoin(complianceObligations, eq(complianceObligations.id, complianceInstances.obligationId))
      .where(and(eq(complianceInstances.id, ref.id), eq(complianceInstances.engagementId, access.dbId)))
      .limit(1);
    if (!row) return { ok: false, reason: 'invalid_item' };
    const itemTitle = titleWithPeriod(row.particular, row.periodLabel);
    return { ok: true, target: { ...base, kind: 'filing', itemTitle, clientPath: FILINGS_PATH } };
  }

  if (ref.kind === 'event') {
    const [row] = await db
      .select({ particular: complianceEvents.particular })
      .from(complianceEvents)
      .where(and(eq(complianceEvents.id, ref.id), eq(complianceEvents.engagementId, access.dbId)))
      .limit(1);
    if (!row) return { ok: false, reason: 'invalid_item' };
    return { ok: true, target: { ...base, kind: 'event', itemTitle: row.particular, clientPath: FILINGS_PATH } };
  }

  if (ref.kind === 'request') {
    const [row] = await db
      .select({ title: documentRequests.title })
      .from(documentRequests)
      .where(and(eq(documentRequests.id, ref.id), eq(documentRequests.engagementId, access.dbId)))
      .limit(1);
    if (!row) return { ok: false, reason: 'invalid_item' };
    return {
      ok: true,
      target: { ...base, kind: 'request', itemTitle: row.title, clientPath: '/app/client/documents' },
    };
  }

  const [row] = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.id, ref.id), eq(tasks.engagementId, access.dbId)))
    .limit(1);
  if (!row) return { ok: false, reason: 'invalid_item' };
  return { ok: true, target: { ...base, kind: 'task', itemTitle: row.title, clientPath: '/app/client/overview' } };
}

/**
 * When the last reminder for this item went out, if inside the 24-hour window. Takes a
 * target that `resolveReminderTarget` already scoped, so it adds no access check of its own.
 */
export async function lastReminderWithinWindow(
  ctx: AuthContext,
  target: Pick<ReminderTarget, 'engagementDbId' | 'itemKey'>,
  now: Date = new Date(),
): Promise<Date | null> {
  if (!isMessageStaff(ctx.role)) return null;
  const since = new Date(now.getTime() - REMINDER_WINDOW_MS);
  const [row] = await db
    .select({ at: auditEvents.createdAt })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.engagementId, target.engagementDbId),
        eq(auditEvents.action, REMINDER_AUDIT_ACTION),
        sql`${auditEvents.metadata} ->> 'itemKey' = ${target.itemKey}`,
        gt(auditEvents.createdAt, since),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);
  return row?.at ?? null;
}

export interface ReminderDeliveryInput {
  recipientProfileId: string | null;
  channel: 'email' | 'whatsapp';
  toAddress: string | null;
  providerMessageId?: string | null;
  status: 'sent' | 'failed' | 'skipped' | 'queued';
  skipReason?: 'no_phone' | 'no_consent' | 'opted_out' | 'no_template' | 'disabled' | null;
  errorCode?: string | null;
}

/**
 * One `notification_deliveries` row per reminder send, written against the target that
 * `resolveReminderTarget` scoped. Queued WhatsApp sends are recorded by the background job,
 * so callers pass only the email results and the WhatsApp sends that were not queued.
 * Never throws: the reminder already went out.
 */
export async function recordReminderDeliveries(
  ctx: AuthContext,
  target: Pick<ReminderTarget, 'engagementDbId'>,
  rows: ReminderDeliveryInput[],
): Promise<void> {
  if (!isMessageStaff(ctx.role) || rows.length === 0) return;
  try {
    await db.insert(notificationDeliveries).values(
      rows.map((r) => ({
        engagementId: target.engagementDbId,
        recipientProfileId: r.recipientProfileId,
        eventType: 'client_reminder',
        channel: r.channel,
        toAddress: r.toAddress,
        providerMessageId: r.providerMessageId ?? null,
        status: r.status,
        skipReason: r.skipReason ?? null,
        errorCode: r.errorCode ?? null,
      })),
    );
  } catch (err) {
    console.error('[client-reminders] delivery rows failed', err);
  }
}
