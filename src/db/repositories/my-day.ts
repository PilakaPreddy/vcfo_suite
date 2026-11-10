import 'server-only';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificationPrefs, profiles } from '@/db/schema';
import type { AppRole, AuthContext } from '@/auth/guards';

/**
 * SYSTEM READER — the "My day" morning email job (IDEAS-PLAN section F; documented deviation like
 * the other scheduled jobs). The job has no session, so it lists the active staff members who
 * turned the "My day email" on (`notification_prefs.email ->> 'myDayEmail'`, off by default) and
 * returns each one's own AuthContext. The plan is then gathered under that context, so the email
 * never shows more than the person sees on their Today page. Nothing here writes.
 */

const STAFF_ROLES: AppRole[] = ['super_admin', 'admin', 'manager', 'intern'];

export interface MyDaySubscriber {
  ctx: AuthContext;
  quiet: { quietHours: boolean; quietStart: string; quietEnd: string; tz: string };
}

export async function systemListMyDaySubscribers(): Promise<MyDaySubscriber[]> {
  const rows = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      internId: profiles.internId,
      quietHours: notificationPrefs.quietHours,
      quietStart: notificationPrefs.quietStart,
      quietEnd: notificationPrefs.quietEnd,
      tz: notificationPrefs.tz,
    })
    .from(notificationPrefs)
    .innerJoin(profiles, eq(profiles.id, notificationPrefs.profileId))
    .where(
      and(
        sql`(${notificationPrefs.email} ->> 'myDayEmail') = 'true'`,
        eq(profiles.status, 'active'),
        isNull(profiles.removedAt),
        inArray(profiles.role, STAFF_ROLES as never[]),
      ),
    );
  return rows
    .filter((r) => Boolean(r.email))
    .map((r) => ({
      ctx: {
        userId: r.id,
        email: r.email,
        name: r.name?.trim() || r.email,
        role: r.role as AppRole,
        ...(r.internId ? { internId: r.internId } : {}),
      },
      quiet: { quietHours: r.quietHours, quietStart: r.quietStart, quietEnd: r.quietEnd, tz: r.tz || 'Asia/Kolkata' },
    }));
}
