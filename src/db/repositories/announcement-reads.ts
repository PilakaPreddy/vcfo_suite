import 'server-only';

import { and, count, eq, inArray, notExists, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { announcementReads, announcements } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';

/**
 * ANNOUNCEMENT READS (client portal v7).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Announcements are readable by every signed-in role (`listAnnouncements`).
 * Read marks belong to the caller only: every query and write is keyed by
 * `ctx.userId`; no caller-supplied profile id exists.
 */

export async function listReadAnnouncementIds(ctx: AuthContext, ids?: string[]): Promise<Set<string>> {
  const where = ids?.length
    ? and(eq(announcementReads.profileId, ctx.userId), inArray(announcementReads.announcementId, ids))
    : eq(announcementReads.profileId, ctx.userId);
  const rows = await db.select({ id: announcementReads.announcementId }).from(announcementReads).where(where);
  return new Set(rows.map((r) => r.id));
}

export async function markAnnouncementsRead(ctx: AuthContext, ids: string[]): Promise<number> {
  const clean = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 200);
  if (!clean.length) return 0;
  // only ids that exist (the FK would reject the rest)
  const real = await db.select({ id: announcements.id }).from(announcements).where(inArray(announcements.id, clean));
  if (!real.length) return 0;
  await db
    .insert(announcementReads)
    .values(real.map((r) => ({ profileId: ctx.userId, announcementId: r.id })))
    .onConflictDoNothing();
  return real.length;
}

export async function markAnnouncementUnread(ctx: AuthContext, id: string): Promise<void> {
  await db
    .delete(announcementReads)
    .where(and(eq(announcementReads.profileId, ctx.userId), eq(announcementReads.announcementId, id)));
}

/** Unread = published in the last 90 days and not opened by the caller. */
export async function countUnreadAnnouncements(ctx: AuthContext): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(announcements)
    .where(
      and(
        sql`${announcements.publishedAt} > now() - interval '90 days'`,
        ctx.role === 'client' ? eq(announcements.audience, 'everyone') : undefined,
        notExists(
          db
            .select({ one: sql`1` })
            .from(announcementReads)
            .where(
              and(eq(announcementReads.profileId, ctx.userId), eq(announcementReads.announcementId, announcements.id)),
            ),
        ),
      ),
    );
  return Number(row?.n ?? 0);
}
