import 'server-only';

import { and, asc, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { announcementSources } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager } from '@/lib/auth';
import { isWatchStaff } from '@/lib/watch/recipients';
import { everyMinutes, type WatchSourceSeed } from '@/lib/watch/sources-seed';
import type { RegSourceHealth, RegSourceType, WatchSourceStatus } from '@/lib/watch/types';

/**
 * Watch sources are `announcement_sources` rows with the Watch columns. `system*` is job-only, like
 * the other job readers: it has no session and must not be called from a request handler.
 */
export type WatchSourceRow = typeof announcementSources.$inferSelect;

function toStatus(row: WatchSourceRow): WatchSourceStatus {
  return {
    id: row.id,
    name: row.name,
    url: row.feedUrl,
    type: row.sourceType as RegSourceType,
    area: row.area,
    audience: row.audience,
    health: row.health as RegSourceHealth,
    lastCheckedAt: row.lastFetchedAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    nextCheckAt: row.nextCheckAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

/** Idempotent: a deploy with a new seed line needs no script, and check state is left alone. */
export async function systemEnsureWatchSources(seeds: readonly WatchSourceSeed[]): Promise<void> {
  for (const seed of seeds) {
    const fields = {
      name: seed.name,
      sourceType: seed.type,
      adapter: seed.adapter,
      area: seed.area,
      audience: seed.audience,
      checkEveryMinutes: everyMinutes(seed.type),
    };
    await db
      .insert(announcementSources)
      .values({ feedUrl: seed.url, ...fields })
      .onConflictDoUpdate({ target: announcementSources.feedUrl, set: fields });
  }
}

/** Sources to read now. A blocked source stays out until a person asks for a retest. */
export async function systemDueWatchSources(now: Date): Promise<WatchSourceRow[]> {
  return db
    .select()
    .from(announcementSources)
    .where(
      and(
        eq(announcementSources.enabled, true),
        inArray(announcementSources.sourceType, ['feed', 'page']),
        ne(announcementSources.health, 'blocked'),
        or(isNull(announcementSources.nextCheckAt), lte(announcementSources.nextCheckAt, now)),
      ),
    )
    .orderBy(asc(announcementSources.name));
}

export async function systemGetWatchSource(id: string): Promise<WatchSourceRow | null> {
  const [row] = await db.select().from(announcementSources).where(eq(announcementSources.id, id)).limit(1);
  return row ?? null;
}

export async function systemSaveSourceCheck(
  id: string,
  patch: Partial<
    Pick<
      WatchSourceRow,
      'health' | 'lastSuccessAt' | 'lastError' | 'nextCheckAt' | 'consecutiveFailures' | 'etag' | 'lastModified' | 'contentHash'
    >
  >,
): Promise<void> {
  await db
    .update(announcementSources)
    .set({ ...patch, lastFetchedAt: new Date() })
    .where(eq(announcementSources.id, id));
}

/** Every source and its health, for staff and for the honest line in chat. Clients do not call it. */
export async function listWatchSources(ctx: AuthContext): Promise<WatchSourceStatus[]> {
  if (!isWatchStaff(ctx.role)) throw new Error('not permitted');
  const rows = await db
    .select()
    .from(announcementSources)
    .where(inArray(announcementSources.sourceType, ['feed', 'page', 'manual', 'email']))
    .orderBy(asc(announcementSources.name));
  return rows.map(toStatus);
}

/** Names and last checks a client may see: never the staff-only sources. */
export async function listPublicSourceStatus(): Promise<WatchSourceStatus[]> {
  const rows = await db
    .select()
    .from(announcementSources)
    .where(and(eq(announcementSources.enabled, true), eq(announcementSources.audience, 'everyone')))
    .orderBy(asc(announcementSources.name));
  return rows.map(toStatus);
}

/** A person asks for one more check, for example after a site unblocks us. It is never automatic. */
export async function requestSourceRetest(ctx: AuthContext, id: string): Promise<boolean> {
  if (!isAdminOrManager(ctx.role)) throw new Error('not permitted');
  const updated = await db
    .update(announcementSources)
    .set({ health: 'unknown', nextCheckAt: new Date(), etag: null, lastModified: null, contentHash: null, consecutiveFailures: 0 })
    .where(and(eq(announcementSources.id, id), inArray(announcementSources.sourceType, ['feed', 'page'])))
    .returning({ id: announcementSources.id });
  return updated.length > 0;
}
