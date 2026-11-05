import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchSourceRow } from '@/db/repositories/reg-sources';

const fetchMock = vi.fn();
const saveCheck = vi.fn();
const notify = vi.fn();
const queue = vi.fn(async (_source: unknown, items: unknown[]) => items.map((_, index) => `id-${index}`));

vi.mock('../fetch', () => ({
  watchFetch: (...args: unknown[]) => fetchMock(...args),
  WatchBlockedError: class WatchBlockedError extends Error {},
}));
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: (rows: unknown) => notify(rows) }));
vi.mock('@/db/repositories/reg-sources', () => ({ systemSaveSourceCheck: (...args: unknown[]) => saveCheck(...args) }));
vi.mock('@/db/repositories/reg-updates', () => ({
  systemKnownItemKeys: async () => new Set<string>(),
  systemLogRegNoise: vi.fn(),
  systemQueueRegUpdates: (source: unknown, items: unknown[]) => queue(source, items),
  systemWatchPeople: async () => [
    { id: 'a', role: 'admin' },
    { id: 'm', role: 'manager' },
    { id: 'i', role: 'intern' },
    { id: 'c', role: 'client' },
  ],
}));

const { checkWatchSource } = await import('../check');
const { WatchBlockedError } = await import('../fetch');

const source = (over: Partial<WatchSourceRow> = {}): WatchSourceRow =>
  ({ id: 's', name: 'ESIC circulars', adapter: 'esic', feedUrl: 'https://esic.gov.in/circulars', health: 'ok', consecutiveFailures: 0, checkEveryMinutes: 720, contentHash: null, etag: null, lastModified: null, lastSuccessAt: new Date(), ...over }) as WatchSourceRow;

const page = (body: string, hash = 'h') => ({ status: 'ok', finalUrl: 'https://esic.gov.in/circulars', body: Buffer.from(body), hash, etag: 'e', lastModified: null });
const now = new Date('2026-11-06T06:00:00Z');
const alerted = () => (notify.mock.calls[0]?.[0] ?? []) as Array<{ userId: string; kind: string; title: string }>;

beforeEach(() => vi.clearAllMocks());

describe('checkWatchSource', () => {
  it('raises an alert to reviewers only when a page yields nothing, without storing its hash', async () => {
    fetchMock.mockResolvedValue(page('<html>Under maintenance</html>'));
    const outcome = await checkWatchSource(source(), { now });
    expect(outcome.health).toBe('empty');
    expect(saveCheck.mock.calls[0]![1]).not.toHaveProperty('contentHash');
    expect(alerted().map((row) => row.userId)).toEqual(['a', 'm']);
    expect(alerted()[0]).toMatchObject({ kind: 'watch.alert', title: 'ESIC circulars found nothing' });
  });

  it('does not repeat an alert while the health stays the same', async () => {
    fetchMock.mockResolvedValue(page('<html></html>'));
    await checkWatchSource(source({ health: 'empty' }), { now });
    expect(notify).not.toHaveBeenCalled();
  });

  it('marks a refusal as blocked, takes it off the schedule and alerts', async () => {
    fetchMock.mockRejectedValue(new WatchBlockedError('robots_disallow'));
    const outcome = await checkWatchSource(source(), { now });
    expect(outcome.health).toBe('blocked');
    expect(saveCheck.mock.calls[0]![1]).toMatchObject({ health: 'blocked', nextCheckAt: null });
    expect(alerted()[0]!.title).toBe('ESIC circulars refused automated reading');
  });

  it('alerts on the third failure in a row and not before', async () => {
    fetchMock.mockRejectedValue(new Error('http_503'));
    expect((await checkWatchSource(source({ consecutiveFailures: 1 }), { now })).health).toBe('ok');
    expect(notify).not.toHaveBeenCalled();
    expect((await checkWatchSource(source({ consecutiveFailures: 2 }), { now })).health).toBe('failing');
    expect(alerted()[0]!.title).toBe('ESIC circulars keeps failing');
  });

  it('stops at an unchanged hash or a 304 with no reading and no alert', async () => {
    fetchMock.mockResolvedValue(page('anything', 'same'));
    expect((await checkWatchSource(source({ contentHash: 'same' }), { now })).note).toBe('unchanged');
    fetchMock.mockResolvedValue({ status: 'not_modified', finalUrl: 'x' });
    expect((await checkWatchSource(source(), { now })).note).toBe('not modified');
    expect(queue).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('calls an undated list stale from its upload folder, so an old list never reads as quiet', async () => {
    const row = '<tr><td>1</td><td>11/2025-Central Tax</td><td><a href="/sites/default/files/2025-04/ct.pdf">View</a></td><td>H</td><td>Seeks to amend</td></tr>';
    fetchMock.mockResolvedValue(page(`<table>${row}</table>`));
    const outcome = await checkWatchSource(source({ adapter: 'gst-council-notifications', feedUrl: 'https://gstcouncil.gov.in/cgst-tax-notification' }), { now });
    expect(outcome.health).toBe('stale');
    expect(saveCheck.mock.calls[0]![1]).toMatchObject({ lastError: 'newest_item:2025-04' });
    expect(alerted()[0]!.title).toBe('ESIC circulars looks out of date');
  });

  it('holds items back under a limit and leaves the hash unset, so the next check sees them', async () => {
    const rss = (n: number) => `<item><title>Rule change ${n}</title><link>https://www.rbi.org.in/${n}</link><pubDate>Thu, 05 Nov 2026 10:00:00</pubDate></item>`;
    fetchMock.mockResolvedValue(page(`<rss>${[1, 2, 3].map(rss).join('')}</rss>`));
    const outcome = await checkWatchSource(source({ adapter: 'rbi-notifications' }), { now, maxItems: 1 });
    expect(outcome.queuedIds).toHaveLength(1);
    expect(saveCheck.mock.calls[0]![1]).not.toHaveProperty('contentHash');
  });
});
