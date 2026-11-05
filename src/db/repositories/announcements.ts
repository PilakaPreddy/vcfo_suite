import 'server-only';

import { and, count, desc, eq, max } from 'drizzle-orm';
import { db } from '@/db/client';
import { announcementSources, announcements, regUpdates } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import {
  assertSafeFeedUrl,
  assertSafeHttpsUrl,
  canManageAnnouncementSources,
  canWriteAnnouncements,
  inferAnnouncementKind,
  parseAnnouncementKind,
  safePortalLinkPath,
  type Announcement,
  type AnnouncementKind,
  type AnnouncementOrigin,
  type AnnouncementSource,
  type ParsedFeedItem,
} from '@/lib/notifications/announcements';
import { audienceFor } from '@/lib/watch/recipients';
import { boardBody, boardKind } from '@/lib/watch/board';
import type { RegImportance } from '@/lib/watch/types';

type AnnouncementRow = typeof announcements.$inferSelect;
type SourceRow = typeof announcementSources.$inferSelect;

function assertCanWrite(ctx: AuthContext) {
  if (!canWriteAnnouncements(ctx.role)) throw new Error('not permitted');
}

function assertCanManageSources(ctx: AuthContext) {
  if (!canManageAnnouncementSources(ctx.role)) throw new Error('not permitted');
}

function mapAnnouncement(
  row: AnnouncementRow,
  sourceName: string | null,
): Announcement {
  const origin: AnnouncementOrigin = row.origin === 'feed' ? 'feed' : 'manual';
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? '',
    kind: parseAnnouncementKind(row.kind),
    origin,
    sourceId: row.sourceId,
    sourceName: origin === 'feed' ? sourceName : null,
    sourceUrl: row.sourceUrl,
    linkPath: safePortalLinkPath(row.linkPath),
    unreviewed: row.unreviewed,
    authorId: row.authorId,
    authorName: row.authorName,
    authorRole: row.authorRole,
    publishedAt: row.publishedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapSource(row: SourceRow): AnnouncementSource {
  return {
    id: row.id,
    name: row.name,
    feedUrl: row.feedUrl,
    homepageUrl: row.homepageUrl,
    enabled: row.enabled,
    lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A client never sees a staff row: an unreviewed Watch update or a professional-body notice. */
function visibleTo(ctx: AuthContext) {
  return ctx.role === 'client' ? eq(announcements.audience, 'everyone') : undefined;
}

export async function listAnnouncements(
  ctx: AuthContext,
  limit = 80,
): Promise<Announcement[]> {
  const cap = Math.min(Math.max(1, limit), 120);
  const rows = await db
    .select({
      announcement: announcements,
      sourceName: announcementSources.name,
    })
    .from(announcements)
    .leftJoin(announcementSources, eq(announcements.sourceId, announcementSources.id))
    .where(visibleTo(ctx))
    .orderBy(desc(announcements.publishedAt))
    .limit(cap);
  return rows.map((row) => mapAnnouncement(row.announcement, row.sourceName));
}

/** Cheap board signal for the 4s live poll — no announcement bodies. */
export async function getAnnouncementBoardHead(
  ctx: AuthContext,
): Promise<{ latestId: string | null; latestCreatedAt: string | null; latestUpdatedAt: string | null; count: number }> {
  const [latest] = await db
    .select({ id: announcements.id, createdAt: announcements.createdAt })
    .from(announcements)
    .where(visibleTo(ctx))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(1);
  const [agg] = await db.select({ n: count(), updatedAt: max(announcements.updatedAt) }).from(announcements).where(visibleTo(ctx));
  return {
    latestId: latest?.id ?? null,
    latestCreatedAt: latest?.createdAt.toISOString() ?? null,
    // A reviewed update keeps its id, and staff should see its mark go.
    latestUpdatedAt: agg?.updatedAt?.toISOString() ?? null,
    count: Number(agg?.n ?? 0),
  };
}

export async function createAnnouncement(
  ctx: AuthContext,
  input: { title?: string; body?: string; sourceUrl?: string | null; linkPath?: string | null; kind?: AnnouncementKind },
): Promise<Announcement> {
  assertCanWrite(ctx);
  const body = (input.body ?? '').trim().slice(0, 8000);
  const title = (input.title?.trim() || body).slice(0, 200);
  if (!title) throw new Error('invalid_body');
  let sourceUrl: string | null = null;
  if (input.sourceUrl?.trim()) {
    sourceUrl = assertSafeHttpsUrl(input.sourceUrl, 'link').href;
  }
  const authorName = ctx.name.trim() || ctx.email.split('@')[0] || 'Staff';
  const kind = parseAnnouncementKind(input.kind);
  const [row] = await db
    .insert(announcements)
    .values({
      title,
      body: body || title,
      kind,
      origin: 'manual',
      sourceUrl,
      linkPath: safePortalLinkPath(input.linkPath),
      authorId: ctx.userId,
      authorName,
      authorRole: ctx.role,
      publishedAt: new Date(),
    })
    .returning();
  return mapAnnouncement(row, null);
}

export async function deleteAnnouncement(ctx: AuthContext, id: string): Promise<boolean> {
  assertCanWrite(ctx);
  const deleted = await db.delete(announcements).where(eq(announcements.id, id)).returning({
    id: announcements.id,
  });
  return deleted.length > 0;
}

export async function listAnnouncementSources(ctx: AuthContext): Promise<AnnouncementSource[]> {
  assertCanManageSources(ctx);
  const rows = await db
    .select()
    .from(announcementSources)
    .orderBy(desc(announcementSources.createdAt));
  return rows.map(mapSource);
}

export async function createAnnouncementSource(
  ctx: AuthContext,
  input: { name: string; feedUrl: string; homepageUrl?: string | null },
): Promise<AnnouncementSource> {
  assertCanManageSources(ctx);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('invalid_body');
  const feedUrl = assertSafeFeedUrl(input.feedUrl).href;
  let homepageUrl: string | null = null;
  if (input.homepageUrl?.trim()) {
    homepageUrl = assertSafeHttpsUrl(input.homepageUrl, 'link').href;
  }
  try {
    const [row] = await db
      .insert(announcementSources)
      .values({
        name,
        feedUrl,
        homepageUrl,
        enabled: true,
        createdById: ctx.userId,
      })
      .returning();
    return mapSource(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('announcement_sources_feed_url_uidx') || message.includes('duplicate')) {
      throw new Error('feed_already_added', { cause: err });
    }
    throw err;
  }
}

export async function deleteAnnouncementSource(ctx: AuthContext, id: string): Promise<boolean> {
  assertCanManageSources(ctx);
  const deleted = await db
    .delete(announcementSources)
    .where(eq(announcementSources.id, id))
    .returning({ id: announcementSources.id });
  return deleted.length > 0;
}

export async function getAnnouncementSourceForWrite(
  ctx: AuthContext,
  id: string,
): Promise<AnnouncementSource | null> {
  assertCanManageSources(ctx);
  const [row] = await db
    .select()
    .from(announcementSources)
    .where(eq(announcementSources.id, id))
    .limit(1);
  return row ? mapSource(row) : null;
}

/** Job-only: persist a source after a catalog URL has already parsed as RSS/Atom. */
export async function systemGetOrCreateAnnouncementSource(input: {
  name: string;
  feedUrl: string;
}): Promise<AnnouncementSource> {
  const feedUrl = assertSafeFeedUrl(input.feedUrl).href;
  const [existing] = await db
    .select()
    .from(announcementSources)
    .where(eq(announcementSources.feedUrl, feedUrl))
    .limit(1);
  if (existing) return mapSource(existing);
  const name = input.name.trim().slice(0, 120) || 'Official feed';
  try {
    const [row] = await db
      .insert(announcementSources)
      .values({ name, feedUrl, enabled: true })
      .returning();
    return mapSource(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('announcement_sources_feed_url_uidx') || message.includes('duplicate')) {
      const [again] = await db
        .select()
        .from(announcementSources)
        .where(eq(announcementSources.feedUrl, feedUrl))
        .limit(1);
      if (again) return mapSource(again);
    }
    throw err;
  }
}

/** Job-only: enabled sources, no session. Do not call from request handlers. */
export async function systemListEnabledAnnouncementSources(): Promise<AnnouncementSource[]> {
  const rows = await db
    .select()
    .from(announcementSources)
    .where(eq(announcementSources.enabled, true));
  return rows.map(mapSource);
}

export async function systemMarkAnnouncementSourceFetch(
  id: string,
  result: { error?: string | null },
): Promise<void> {
  await db
    .update(announcementSources)
    .set({
      lastFetchedAt: new Date(),
      lastError: result.error?.slice(0, 500) ?? null,
    })
    .where(eq(announcementSources.id, id));
}

export async function systemUpsertFeedAnnouncements(
  source: AnnouncementSource,
  items: ParsedFeedItem[],
): Promise<{ inserted: number }> {
  if (items.length === 0) return { inserted: 0 };
  const existing = await db
    .select({ externalId: announcements.externalId })
    .from(announcements)
    .where(and(eq(announcements.sourceId, source.id), eq(announcements.origin, 'feed')));
  const seen = new Set(existing.map((row) => row.externalId).filter(Boolean));
  const fresh = items.filter((item) => !seen.has(item.externalId));
  if (fresh.length === 0) return { inserted: 0 };

  await db
    .insert(announcements)
    .values(
      fresh.map((item) => ({
        title: item.title,
        body: item.body,
        kind: inferAnnouncementKind(item.title, source.name),
        origin: 'feed' as const,
        sourceId: source.id,
        externalId: item.externalId,
        sourceUrl: item.link,
        authorId: null,
        authorName: source.name,
        authorRole: null,
        publishedAt: item.publishedAt,
      })),
    )
    .onConflictDoNothing({
      target: [announcements.sourceId, announcements.externalId],
    });
  return { inserted: fresh.length };
}

type BoardUpdate = typeof regUpdates.$inferSelect;

/** Watch's staff-only row, marked "Not yet reviewed", which raises the same live popup as any post. */
export async function systemPostWatchBoardRow(update: BoardUpdate, sourceName: string | null): Promise<string> {
  const [row] = await db
    .insert(announcements)
    .values({
      title: update.title.slice(0, 200),
      body: boardBody(update),
      kind: boardKind(update),
      origin: 'feed',
      sourceId: update.sourceId,
      externalId: `reg:${update.id}`,
      sourceUrl: update.sourceUrl,
      audience: 'staff',
      unreviewed: true,
      authorName: sourceName ?? 'Official update',
    })
    .onConflictDoUpdate({
      target: [announcements.sourceId, announcements.externalId],
      set: { body: boardBody(update), kind: boardKind(update), updatedAt: new Date() },
    })
    .returning({ id: announcements.id });
  return row!.id;
}

/** After review the same row opens to its audience, so staff do not get a second popup. */
export async function systemPublishWatchBoardRow(update: BoardUpdate, sourceName: string | null): Promise<void> {
  const announcementId = update.announcementId ?? (await systemPostWatchBoardRow(update, sourceName));
  const now = new Date();
  await db
    .update(announcements)
    .set({
      title: update.title.slice(0, 200),
      body: boardBody(update),
      kind: boardKind(update),
      audience: audienceFor((update.importance ?? 'normal') as RegImportance),
      unreviewed: false,
      publishedAt: now,
      updatedAt: now,
    })
    .where(eq(announcements.id, announcementId));
  if (!update.announcementId) await db.update(regUpdates).set({ announcementId }).where(eq(regUpdates.id, update.id));
}

/** A rejected update comes off the staff board. */
export async function deleteWatchBoardRow(updateId: string): Promise<void> {
  await db.delete(announcements).where(eq(announcements.externalId, `reg:${updateId}`));
}
