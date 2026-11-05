import 'server-only';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificationDeliveries, notificationPrefs, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { DEFAULT_NOTIFICATION_PREFS } from '@/lib/client-portal/notification-prefs';
import { isUuid } from '@/lib/slug';

/**
 * WEEKLY DIGEST REPOSITORY — who gets the Monday digest, and the record of each send.
 *
 * >>> SYSTEM READERS AND WRITERS (documented deviation) <<<
 * Every function here takes no AuthContext: the only caller is the Inngest cron
 * `src/jobs/weekly-digest.ts`, which has no session. They are kept narrow:
 *   - `systemListWeeklyDigestRecipients` returns the people whose digest is on, each as the
 *     AuthContext their own sign-in would get (the rules `currentContext` applies: active
 *     status, a known role, an intern only with an `intern_id`). Developers are never listed.
 *     The job then reads each person's week through the ordinary scoped repositories with that
 *     context, so a digest never shows more than the person sees in the app.
 *   - `systemListDigestRecordedProfileIds` and `systemRecordDigestDelivery` read and write
 *     `notification_deliveries` rows with `event_type = 'weekly_digest'`, the same log the
 *     WhatsApp job and staff reminders write. The row's `template_sid` holds the ISO week
 *     (`2026-W45`); one `sent` or `skipped` row per person per week makes the job idempotent,
 *     so a person is never sent two digests for the same week.
 *
 * A person who never saved notification preferences gets the default the Settings screens
 * show them (`DEFAULT_NOTIFICATION_PREFS.email.weeklyDigest`, on).
 */

const DIGEST_EVENT = 'weekly_digest';

/** The roles that get a digest. Developers are left out on purpose. */
const DIGEST_ROLES = ['super_admin', 'admin', 'manager', 'intern', 'client'] as const;
type DigestRole = (typeof DIGEST_ROLES)[number];

function isDigestRole(role: string): role is DigestRole {
  return (DIGEST_ROLES as readonly string[]).includes(role);
}

/** The stored switch, falling back to what Settings shows when nothing was saved. */
export function weeklyDigestOn(email: Record<string, unknown> | null | undefined): boolean {
  const v = email?.weeklyDigest;
  return typeof v === 'boolean' ? v : DEFAULT_NOTIFICATION_PREFS.email.weeklyDigest;
}

/** SYSTEM READER — see the header note. */
export async function systemListWeeklyDigestRecipients(): Promise<AuthContext[]> {
  const rows = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      internId: profiles.internId,
      clientId: profiles.clientId,
      status: profiles.status,
      removedAt: profiles.removedAt,
      prefsEmail: notificationPrefs.email,
    })
    .from(profiles)
    .leftJoin(notificationPrefs, eq(notificationPrefs.profileId, profiles.id))
    .where(
      and(
        eq(profiles.status, 'active'),
        isNull(profiles.removedAt),
        inArray(profiles.role, [...DIGEST_ROLES]),
      ),
    );

  const out: AuthContext[] = [];
  for (const row of rows) {
    // Belt and braces: the same rules again, so a loose WHERE can never widen the list.
    if (row.status !== 'active' || row.removedAt) continue;
    if (!isDigestRole(row.role)) continue;
    if (row.role === 'intern' && !row.internId?.trim()) continue;
    if (!row.email?.trim()) continue;
    if (!weeklyDigestOn(row.prefsEmail)) continue;
    out.push({
      userId: row.id,
      email: row.email,
      name: row.name?.trim() || row.email.split('@')[0] || 'there',
      role: row.role,
      internId: row.internId ?? undefined,
      clientId: row.clientId ?? undefined,
    });
  }
  return out;
}

/**
 * SYSTEM READER — the people who already have a `sent` or `skipped` digest row for one ISO
 * week (`2026-W45`). A `failed` row does not count, so a failed send is tried again on the
 * next run in the same week.
 */
export async function systemListDigestRecordedProfileIds(weekKey: string): Promise<string[]> {
  const key = weekKey.trim();
  if (!/^\d{4}-W\d{2}$/.test(key)) return [];
  const rows = await db
    .select({ id: notificationDeliveries.recipientProfileId })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.eventType, DIGEST_EVENT),
        eq(notificationDeliveries.channel, 'email'),
        eq(notificationDeliveries.templateSid, key),
        inArray(notificationDeliveries.status, ['sent', 'skipped']),
      ),
    );
  return [...new Set(rows.map((r) => r.id).filter((id): id is string => Boolean(id)))];
}

export type DigestDeliveryStatus = 'sent' | 'skipped' | 'failed';
/** `empty`: nothing to say this week. `disabled`: no email provider is set (local runs). */
export type DigestSkipReason = 'empty' | 'disabled';

/** SYSTEM WRITER — one row per person per run. Never throws. */
export async function systemRecordDigestDelivery(input: {
  profileId: string;
  toAddress: string;
  status: DigestDeliveryStatus;
  skipReason?: DigestSkipReason | null;
  errorCode?: string | null;
  /**
   * The ISO week key. It is stored in `template_sid`, which an email row does not otherwise
   * use, so the week is the idempotency key without a schema change.
   */
  weekKey: string;
}): Promise<boolean> {
  const id = input.profileId.trim();
  if (!isUuid(id)) return false;
  try {
    await db.insert(notificationDeliveries).values({
      engagementId: null,
      recipientProfileId: id,
      eventType: DIGEST_EVENT,
      channel: 'email',
      toAddress: input.toAddress.trim() || null,
      templateSid: input.weekKey,
      status: input.status,
      skipReason: input.skipReason ?? null,
      errorCode: input.errorCode?.trim().slice(0, 200) || null,
    });
    return true;
  } catch (err) {
    console.error('[weekly-digest] delivery row failed', id, err);
    return false;
  }
}
