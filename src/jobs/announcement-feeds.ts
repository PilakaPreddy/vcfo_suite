import { inngest } from './client';
import {
  systemGetOrCreateAnnouncementSource,
  systemListEnabledAnnouncementSources,
  systemMarkAnnouncementSourceFetch,
  systemUpsertFeedAnnouncements,
} from '@/db/repositories/announcements';
import { catalogCircularFeedCandidates } from '@/lib/notifications/announcement-portals';
import {
  fetchOfficialFeedXml,
  parseRssOrAtom,
  type AnnouncementSource,
} from '@/lib/notifications/announcements';
import { withRunNow } from '@/jobs/dev-controls';
import { askFlags } from '@/lib/ask/config';
import { systemGetWatchSource } from '@/db/repositories/reg-sources';
import { checkWatchSource } from '@/lib/watch/check';
import { hostOf, queueWatchProcess } from '@/lib/watch/process';

export async function ingestAnnouncementSource(
  source: AnnouncementSource,
): Promise<{ inserted: number; error?: string }> {
  // While Watch is on, a pulled feed goes through its review path and is not posted straight away.
  const watched = askFlags().watch ? await systemGetWatchSource(source.id) : null;
  if (watched) {
    const { queuedIds, note, health } = await checkWatchSource(watched);
    await queueWatchProcess(queuedIds.map((id) => ({ id, host: hostOf(source.feedUrl) })));
    return { inserted: queuedIds.length, ...(health === 'ok' ? {} : { error: note ?? health }) };
  }
  try {
    const xml = await fetchOfficialFeedXml(source.feedUrl);
    const items = parseRssOrAtom(xml);
    const { inserted } = await systemUpsertFeedAnnouncements(source, items);
    await systemMarkAnnouncementSourceFetch(source.id, { error: null });
    return { inserted };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'feed_fetch_failed';
    await systemMarkAnnouncementSourceFetch(source.id, { error });
    return { inserted: 0, error };
  }
}

async function ingestAllAnnouncementFeeds(): Promise<{
  sources: number;
  catalogTried: number;
  results: { id: string | null; name: string; inserted: number; error?: string }[];
}> {
  const sources = await systemListEnabledAnnouncementSources();
  const results: { id: string | null; name: string; inserted: number; error?: string }[] = [];
  const seen = new Set(sources.map((source) => source.feedUrl));

  for (const source of sources) {
    const result = await ingestAnnouncementSource(source);
    results.push({ id: source.id, name: source.name, ...result });
  }

  const catalogFeeds = catalogCircularFeedCandidates();
  for (const candidate of catalogFeeds) {
    if (seen.has(candidate.feedUrl)) continue;
    try {
      const xml = await fetchOfficialFeedXml(candidate.feedUrl);
      const items = parseRssOrAtom(xml);
      if (items.length === 0) continue;
      const source = await systemGetOrCreateAnnouncementSource(candidate);
      seen.add(source.feedUrl);
      const { inserted } = await systemUpsertFeedAnnouncements(source, items);
      await systemMarkAnnouncementSourceFetch(source.id, { error: null });
      results.push({ id: source.id, name: source.name, inserted });
    } catch (err) {
      results.push({
        id: null,
        name: candidate.name,
        inserted: 0,
        error: err instanceof Error ? err.message : 'feed_fetch_failed',
      });
    }
  }

  return { sources: sources.length, catalogTried: catalogFeeds.length, results };
}

/**
 * Pull official RSS/Atom once each morning IST. Staff can still Pull now. While Watch is on, its
 * hourly check reads these same feeds, so this returns early and nothing is posted twice.
 */
export const announcementFeeds = inngest.createFunction(
  { id: 'announcement-feeds' },
  withRunNow('announcement-feeds', 'TZ=Asia/Kolkata 0 6 * * *'),
  async ({ step }) => {
    if (askFlags().watch) return { skipped: 'watch_enabled' };
    return step.run('ingest-all-feeds', async () => {
      const digest = await ingestAllAnnouncementFeeds();
      console.log('[announcement-feeds] morning ingest', {
        sources: digest.sources,
        catalogTried: digest.catalogTried,
        inserted: digest.results.reduce((sum, row) => row.inserted + sum, 0),
        errors: digest.results.filter((row) => row.error).length,
      });
      return digest;
    });
  },
);
