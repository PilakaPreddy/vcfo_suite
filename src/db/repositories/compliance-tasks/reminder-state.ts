import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceReminderLog, complianceReminderOverrides, notifications } from '@/db/schema';
import {
  isReminderKey,
  reminderSchedule,
  type ReminderOverride,
  type ReminderRowOut,
  type ReminderSend,
} from '@/lib/compliance-tasks/model';

/**
 * The stored side of the six reminders: per-occurrence overrides and what was sent. No scope
 * check here: every caller resolved the item through its own scoped read first.
 */

export type ReminderSubjectKind = 'statutory' | 'task';

async function loadOverrides(kind: ReminderSubjectKind, subjectId: string): Promise<ReminderOverride[]> {
  const rows = await db
    .select({ key: complianceReminderOverrides.reminderKey, offsetDays: complianceReminderOverrides.offsetDays, enabled: complianceReminderOverrides.enabled })
    .from(complianceReminderOverrides)
    .where(and(eq(complianceReminderOverrides.subjectKind, kind), eq(complianceReminderOverrides.subjectId, subjectId)));
  return rows.filter((r) => isReminderKey(r.key)).map((r) => ({ key: r.key as ReminderOverride['key'], offsetDays: r.offsetDays, enabled: r.enabled }));
}

/** Sends of one item, newest first; read = the bell row it created was read. */
async function loadSends(kind: ReminderSubjectKind, subjectId: string): Promise<ReminderSend[]> {
  const rows = await db
    .select({ key: complianceReminderLog.reminderKey, createdAt: complianceReminderLog.createdAt, status: notifications.status })
    .from(complianceReminderLog)
    .leftJoin(notifications, eq(notifications.id, complianceReminderLog.notificationId))
    .where(and(eq(complianceReminderLog.subjectKind, kind), eq(complianceReminderLog.subjectId, subjectId)))
    .orderBy(desc(complianceReminderLog.createdAt));
  return rows
    .filter((r) => isReminderKey(r.key))
    .map((r) => ({
      key: r.key as ReminderSend['key'],
      sentAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      read: r.status === 'read',
    }));
}

/** The six rows of one item; a client never gets the escalations (D-4). */
export async function remindersFor(
  kind: ReminderSubjectKind,
  subjectId: string,
  input: { dueDate: string; notifyDays: number; done: boolean; blocked: boolean; forClient: boolean },
): Promise<ReminderRowOut[]> {
  const [overrides, sends] = await Promise.all([loadOverrides(kind, subjectId), loadSends(kind, subjectId)]);
  const rows = reminderSchedule({ ...input, overrides, sends });
  return input.forClient ? rows.filter((r) => !r.internal) : rows;
}

/** Overrides of many items at once (the reminder job). */
export async function loadOverridesFor(kind: ReminderSubjectKind, ids: string[]): Promise<Map<string, ReminderOverride[]>> {
  const out = new Map<string, ReminderOverride[]>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      subjectId: complianceReminderOverrides.subjectId,
      key: complianceReminderOverrides.reminderKey,
      offsetDays: complianceReminderOverrides.offsetDays,
      enabled: complianceReminderOverrides.enabled,
    })
    .from(complianceReminderOverrides)
    .where(and(eq(complianceReminderOverrides.subjectKind, kind), inArray(complianceReminderOverrides.subjectId, ids)));
  for (const r of rows) {
    if (!isReminderKey(r.key)) continue;
    const list = out.get(r.subjectId) ?? [];
    list.push({ key: r.key, offsetDays: r.offsetDays, enabled: r.enabled });
    out.set(r.subjectId, list);
  }
  return out;
}
