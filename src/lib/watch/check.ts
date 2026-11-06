import 'server-only';

import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { systemSaveSourceCheck, type WatchSourceRow } from '@/db/repositories/reg-sources';
import { systemKnownItemKeys, systemLogRegNoise, systemQueueRegUpdates, systemWatchPeople } from '@/db/repositories/reg-updates';
import { adapterFor } from './adapters';
import { WatchBlockedError, watchFetch } from './fetch';
import { noiseReason } from './noise';
import { reviewers, watchHref } from './recipients';
import type { ListedItem, RegSourceHealth, SourceAdapter } from './types';

/**
 * Steps 1 to 3 of the pipeline, all code and no tokens: check the source, list its items, drop the
 * noise. A source that goes quiet in a suspicious way raises an alert to the reviewers once, when
 * its health changes, so silence never reads as no news.
 */
const FAILURES_BEFORE_ALERT = 3;
const DAY_MS = 86_400_000;
const STALE_AFTER_DAYS = 365;
/** A source's first check reads a little recent history; the rest becomes the known baseline. */
const BASELINE_DAYS = 30;
const BASELINE_ITEMS = 5;
/** A later check that finds an old item (a page re-sorted, say) logs it rather than summarising it. */
const OLD_ITEM_DAYS = 90;

export interface Selection {
  queue: ListedItem[];
  dropped: Array<{ item: ListedItem; reason: string }>;
}

/** Pure: which listed items are new, which go on, and why the others were dropped. */
export function selectNewItems(
  adapter: SourceAdapter,
  listed: readonly ListedItem[],
  known: ReadonlySet<string>,
  opts: { firstCheck: boolean; now: Date },
): Selection {
  const selection: Selection = { queue: [], dropped: [] };
  const ageInDays = (item: ListedItem): number =>
    item.publishedOn ? (opts.now.getTime() - Date.parse(item.publishedOn)) / DAY_MS : 0;
  const fresh = listed.filter((item, index) => !known.has(item.externalKey) && listed.findIndex((other) => other.externalKey === item.externalKey) === index);
  for (const item of fresh) {
    const reason = noiseReason(adapter, item);
    if (reason) selection.dropped.push({ item, reason });
    else if (opts.firstCheck && (!item.publishedOn || ageInDays(item) > BASELINE_DAYS)) selection.dropped.push({ item, reason: 'baseline' });
    else if (ageInDays(item) > OLD_ITEM_DAYS) selection.dropped.push({ item, reason: 'old_item' });
    else selection.queue.push(item);
  }
  if (opts.firstCheck && selection.queue.length > BASELINE_ITEMS) {
    selection.queue.sort((a, b) => (b.publishedOn ?? '').localeCompare(a.publishedOn ?? ''));
    selection.dropped.push(...selection.queue.splice(BASELINE_ITEMS).map((item) => ({ item, reason: 'baseline' })));
  }
  return selection;
}

const ALERT_COPY: Partial<Record<RegSourceHealth, { title: string; body: string }>> = {
  empty: { title: 'found nothing', body: 'The page loaded but no items were found, so its layout may have changed. Until it is fixed, updates from this source will not appear.' },
  stale: { title: 'looks out of date', body: 'The newest item on this page is over a year old, so it is probably no longer the live list. Add its updates by hand and find the new page.' },
  failing: { title: 'keeps failing', body: 'Three checks in a row failed. Until it recovers, updates from this source will not appear.' },
  blocked: { title: 'refused automated reading', body: 'The site or its robots rules refused the reader, and it will not be retried. Add its updates by hand from now on.' },
};

async function alertReviewers(source: WatchSourceRow, health: RegSourceHealth): Promise<void> {
  const copy = ALERT_COPY[health];
  if (!copy) return;
  const people = reviewers(await systemWatchPeople());
  await createNotificationsForUsers(
    people.map((person) => ({
      userId: person.id,
      kind: 'watch.alert' as const,
      title: `${source.name} ${copy.title}`,
      body: copy.body,
      engagementId: '',
      companyName: '',
      href: watchHref(person.role),
    })),
  );
}

export interface CheckOutcome {
  health: RegSourceHealth;
  listed: number;
  dropped: number;
  queuedIds: string[];
  note?: string;
}

function nextCheck(source: WatchSourceRow, now: Date): Date {
  return new Date(now.getTime() + source.checkEveryMinutes * 60_000);
}

/**
 * Reads one source. `maxItems` limits a first look, for example the live run; what it holds back
 * stays unseen and comes up on the next check, because the hash is not stored then.
 */
export async function checkWatchSource(
  source: WatchSourceRow,
  opts: { now?: Date; maxItems?: number } = {},
): Promise<CheckOutcome> {
  const now = opts.now ?? new Date();
  const previous = source.health as RegSourceHealth;
  const settle = async (
    health: RegSourceHealth,
    patch: Parameters<typeof systemSaveSourceCheck>[1],
    outcome: Omit<CheckOutcome, 'health'> = { listed: 0, dropped: 0, queuedIds: [] },
  ): Promise<CheckOutcome> => {
    await systemSaveSourceCheck(source.id, { health, nextCheckAt: nextCheck(source, now), ...patch });
    if (health !== previous) await alertReviewers(source, health);
    return { health, ...outcome };
  };
  const success = { lastSuccessAt: now, lastError: null, consecutiveFailures: 0 };

  const adapter = adapterFor(source.adapter);
  if (!adapter) return settle('failing', { lastError: `no_adapter:${source.adapter}` }, { listed: 0, dropped: 0, queuedIds: [], note: 'no adapter' });

  let fetched: Awaited<ReturnType<typeof watchFetch>>;
  try {
    fetched = await watchFetch(source.feedUrl, { etag: source.etag, lastModified: source.lastModified });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch_failed';
    if (err instanceof WatchBlockedError) {
      return settle('blocked', { lastError: message, nextCheckAt: null }, { listed: 0, dropped: 0, queuedIds: [], note: message });
    }
    const failures = source.consecutiveFailures + 1;
    return settle(failures >= FAILURES_BEFORE_ALERT ? 'failing' : previous, { lastError: message, consecutiveFailures: failures }, { listed: 0, dropped: 0, queuedIds: [], note: message });
  }
  // Nothing changed since the last good read, so the last verdict stands.
  const unchangedHealth: RegSourceHealth = previous === 'stale' ? 'stale' : 'ok';
  if (fetched.status === 'not_modified') return settle(unchangedHealth, success, { listed: 0, dropped: 0, queuedIds: [], note: 'not modified' });
  if (fetched.hash === source.contentHash) return settle(unchangedHealth, { ...success, etag: fetched.etag, lastModified: fetched.lastModified }, { listed: 0, dropped: 0, queuedIds: [], note: 'unchanged' });

  const listed = adapter.list(fetched.body.toString('utf8'), fetched.finalUrl);
  if (listed.length === 0) return settle('empty', { lastError: 'no_items_found', consecutiveFailures: 0 }, { listed: 0, dropped: 0, queuedIds: [], note: 'no items found' });

  const known = await systemKnownItemKeys(source.id);
  const selection = selectNewItems(adapter, listed, known, { firstCheck: !source.lastSuccessAt, now });
  const held = opts.maxItems != null && selection.queue.length > opts.maxItems;
  const queue = held ? selection.queue.slice(0, opts.maxItems) : selection.queue;
  await systemLogRegNoise(source.id, selection.dropped);
  const queuedIds = await systemQueueRegUpdates(source, queue);

  const newest = listed.reduce((latest, item) => {
    const day = item.publishedOn ?? item.listedMonth ?? '';
    return day > latest ? day : latest;
  }, '');
  const stale = newest !== '' && (now.getTime() - Date.parse(newest)) / DAY_MS > STALE_AFTER_DAYS;
  return settle(
    stale ? 'stale' : 'ok',
    {
      ...success,
      lastError: stale ? `newest_item:${newest}` : null,
      ...(held ? {} : { etag: fetched.etag, lastModified: fetched.lastModified, contentHash: fetched.hash }),
    },
    { listed: listed.length, dropped: selection.dropped.length, queuedIds },
  );
}
