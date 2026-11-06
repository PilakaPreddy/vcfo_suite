// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWatchFetchForTests, watchFetch, WatchBlockedError, MAX_PAGE_BYTES, WATCH_USER_AGENT } from '../fetch';

type Handler = (url: string, init: RequestInit) => Response;

let calls: Array<{ url: string; headers: Record<string, string> }>;

/** Runs the gap timers forward until the fetch ends, so the rate limit costs the test no real time. */
async function settled<T>(work: Promise<T>): Promise<T> {
  let done = false;
  const tracked = work.finally(() => {
    done = true;
  });
  tracked.catch(() => undefined);
  while (!done) await vi.advanceTimersByTimeAsync(500);
  return tracked;
}

function mockFetch(handler: Handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return handler(url, init);
    }),
  );
}

const robotsOk = (url: string): Response | null => (url.endsWith('/robots.txt') ? new Response('User-agent: *\nAllow: /\n') : null);

beforeEach(() => {
  calls = [];
  resetWatchFetchForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('watchFetch', () => {
  it('sends our real name, reads robots first and returns the body with its hash', async () => {
    mockFetch((url) => robotsOk(url) ?? new Response('<rss/>', { headers: { etag: '"a"', 'last-modified': 'x' } }));
    const result = await settled(watchFetch('https://www.rbi.org.in/notifications_rss.xml'));
    expect(calls[0]!.url).toBe('https://www.rbi.org.in/robots.txt');
    expect(calls[1]!.headers['User-Agent']).toBe(WATCH_USER_AGENT);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.etag).toBe('"a"');
      expect(result.hash).toHaveLength(64);
    }
  });

  it('asks conditionally and reports not modified', async () => {
    mockFetch((url) => robotsOk(url) ?? new Response(null, { status: 304 }));
    const result = await settled(watchFetch('https://www.rbi.org.in/a.xml', { etag: '"a"', lastModified: 'yesterday' }));
    expect(calls[1]!.headers['If-None-Match']).toBe('"a"');
    expect(calls[1]!.headers['If-Modified-Since']).toBe('yesterday');
    expect(result.status).toBe('not_modified');
  });

  it('refuses a host off the allowlist without any request', async () => {
    mockFetch(() => new Response('x'));
    await expect(settled(watchFetch('https://example.com/a'))).rejects.toThrow('feed_host_not_allowed');
    expect(calls).toEqual([]);
  });

  it('marks a 403 as blocked and makes no second attempt', async () => {
    mockFetch((url) => robotsOk(url) ?? new Response('no', { status: 403 }));
    await expect(settled(watchFetch('https://www.mca.gov.in/a'))).rejects.toBeInstanceOf(WatchBlockedError);
    expect(calls.length).toBe(2);
  });

  it('marks a robots 403 and a robots refusal as blocked without touching the page', async () => {
    mockFetch(() => new Response('no', { status: 403 }));
    await expect(settled(watchFetch('https://www.pib.gov.in/x'))).rejects.toBeInstanceOf(WatchBlockedError);
    expect(calls.map((c) => c.url)).toEqual(['https://www.pib.gov.in/robots.txt']);

    resetWatchFetchForTests();
    calls = [];
    mockFetch(() => new Response('User-agent: *\nDisallow: /private\n'));
    await expect(settled(watchFetch('https://www.sebi.gov.in/private/x'))).rejects.toThrow('robots_disallow');
    expect(calls.length).toBe(1);
  });

  it('treats a missing robots file as allowed and a robots outage as a failure', async () => {
    mockFetch((url) => (url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : new Response('ok')));
    expect((await settled(watchFetch('https://esic.gov.in/a'))).status).toBe('ok');

    resetWatchFetchForTests();
    mockFetch(() => new Response('', { status: 503 }));
    await expect(settled(watchFetch('https://esic.gov.in/a'))).rejects.toThrow('robots_http_503');
  });

  it('takes a rate limit on the robots file as a failure, never as permission', async () => {
    mockFetch(() => new Response('', { status: 429 }));
    await expect(settled(watchFetch('https://esic.gov.in/a'))).rejects.toThrow('robots_http_429');
    expect(calls).toHaveLength(1);
  });

  it('reads a robots redirect to the home page as no robots file', async () => {
    mockFetch((url) =>
      url.endsWith('/robots.txt') ? new Response(null, { status: 302, headers: { location: 'http://www.incometax.gov.in/iec/foportal' } }) : new Response('ok'),
    );
    expect((await settled(watchFetch('https://www.incometax.gov.in/a'))).status).toBe('ok');
  });

  it('checks every redirect hop against the allowlist', async () => {
    mockFetch((url) => robotsOk(url) ?? new Response(null, { status: 302, headers: { location: 'https://evil.example/a' } }));
    await expect(settled(watchFetch('https://www.sebi.gov.in/a'))).rejects.toThrow('feed_host_not_allowed');
  });

  it('stops at the size limit', async () => {
    mockFetch((url) => robotsOk(url) ?? new Response('x', { headers: { 'content-length': String(MAX_PAGE_BYTES + 1) } }));
    await expect(settled(watchFetch('https://www.sebi.gov.in/a'))).rejects.toThrow('too_large');
    mockFetch((url) => robotsOk(url) ?? new Response('x'.repeat(50)));
    await expect(settled(watchFetch('https://esic.gov.in/b', { maxBytes: 10 }))).rejects.toThrow('too_large');
  });

  it('takes one request at a time per host, with a gap between them', async () => {
    let active = 0;
    let most = 0;
    const times: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        active += 1;
        most = Math.max(most, active);
        times.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return robotsOk(url) ?? new Response('ok');
      }),
    );
    await settled(Promise.all([watchFetch('https://esic.gov.in/a'), watchFetch('https://esic.gov.in/b')]));
    expect(most).toBe(1);
    expect(times.at(-1)! - times.at(-2)!).toBeGreaterThanOrEqual(1900);
  });
});
