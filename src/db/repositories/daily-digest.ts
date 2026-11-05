import 'server-only';

import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificationDeliveries, notificationPrefs, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isUuid } from '@/lib/slug';
import type { DigestTimePrefs } from '@/lib/digest/daily-digest';

/**
 * DAILY DIGEST REPOSITORY — who set a daily digest time, and the record of each send.
 *
 * >>> SYSTEM READERS AND WRITERS (documented deviation, as the weekly digest) <<<
 * The only caller is the hourly Inngest cron `src/jobs/daily-digest.ts`, which has no
 * session.
 *   - `systemListDailyDigestCandidates` returns every active person with a digest time, each
 *     as the AuthContext their own sign-in would get (active status, a known role, an intern
 *     only with an `intern_id`), with their time and quiet hours. Developers are never listed.
 *     The job reads each person's open items through the ordinary scoped repositories with
 *     that context, so a digest never shows more than the person sees in the app.
 *   - `systemListDailyDigestRecordedProfileIds` and `systemRecordDailyDigestDelivery` use
 *     `notification_deliveries` rows with `event_type = 'daily_digest'` and the person's
 *     local day in `template_sid`; one `sent` or `skipped` row per person per day makes the
 *     job idempotent.
 */

const DAILY_DIGEST_EVENT = 'daily_digest';

const DIGEST_ROLES = ['super_admin', 'admin', 'manager', 'intern', 'client'] as const;

export interface DailyDigestCandidate {
  ctx: AuthContext;
  prefs: DigestTimePrefs;
}

/** SYSTEM READER — see the header note. */
export async function systemListDailyDigestCandidates(): Promise<DailyDigestCandidate[]> {
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
      digestTime: notificationPrefs.digestTime,
      quietHours: notificationPrefs.quietHours,
      quietStart: notificationPrefs.quietStart,
      quietEnd: notificationPrefs.quietEnd,
      tz: notificationPrefs.tz,
    })
    .from(profiles)
    .innerJoin(notificationPrefs, eq(notificationPrefs.profileId, profiles.id))
    .where(
      and(
        eq(profiles.status, 'active'),
        isNull(profiles.removedAt),
        inArray(profiles.role, [...DIGEST_ROLES]),
        isNotNull(notificationPrefs.digestTime),
      ),
    );
  const out: DailyDigestCandidate[] = [];
  for (const r of rows) {
    // Belt and braces: the same rules again, so a loose WHERE can never widen the list.
    if (r.status !== 'active' || r.removedAt) continue;
    if (!(DIGEST_ROLES as readonly string[]).includes(r.role)) continue;
    if (r.role === 'intern' && !r.internId?.trim()) continue;
    if (!r.email?.trim() || !r.digestTime) continue;
    out.push({
      ctx: {
        userId: r.id,
        email: r.email,
        name: r.name?.trim() || r.email.split('@')[0] || 'there',
        role: r.role,
        internId: r.internId ?? undefined,
        clientId: r.clientId ?? undefined,
      },
      prefs: {
        digestTime: r.digestTime,
        quietHours: r.quietHours ?? true,
        quietStart: r.quietStart ?? '21:00',
        quietEnd: r.quietEnd ?? '08:00',
        tz: r.tz || 'Asia/Kolkata',
      },
    });
  }
  return out;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** SYSTEM READER — people with a `sent` or `skipped` daily digest row for one local day. */
export async function systemListDailyDigestRecordedProfileIds(days: string[]): Promise<Array<{ profileId: string; day: string }>> {
  const keys = [...new Set(days.filter((d) => DAY.test(d)))];
  if (keys.length === 0) return [];
  const rows = await db
    .select({ id: notificationDeliveries.recipientProfileId, day: notificationDeliveries.templateSid })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.eventType, DAILY_DIGEST_EVENT),
        eq(notificationDeliveries.channel, 'email'),
        inArray(notificationDeliveries.templateSid, keys),
        inArray(notificationDeliveries.status, ['sent', 'skipped']),
      ),
    );
  return rows.filter((r) => r.id && r.day).map((r) => ({ profileId: r.id!, day: r.day! }));
}

/** SYSTEM WRITER — one row per person per day. Never throws. */
export async function systemRecordDailyDigestDelivery(input: {
  profileId: string;
  toAddress: string;
  status: 'sent' | 'skipped' | 'failed';
  skipReason?: 'empty' | 'disabled' | null;
  errorCode?: string | null;
  day: string;
}): Promise<boolean> {
  const id = input.profileId.trim();
  if (!isUuid(id) || !DAY.test(input.day)) return false;
  try {
    await db.insert(notificationDeliveries).values({
      engagementId: null,
      recipientProfileId: id,
      eventType: DAILY_DIGEST_EVENT,
      channel: 'email',
      toAddress: input.toAddress.trim() || null,
      templateSid: input.day,
      status: input.status,
      skipReason: input.skipReason ?? null,
      errorCode: input.errorCode?.trim().slice(0, 200) || null,
    });
    return true;
  } catch (err) {
    console.error('[daily-digest] delivery row failed', id, err);
    return false;
  }
}
