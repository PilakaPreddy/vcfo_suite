/**
 * Same-origin fetch inside the open VCFO Suite tab (docs/specs/assist-profile/06-no-cors.md).
 *
 * `chrome.scripting.executeScript` runs `fetchInPage` in the Suite tab's isolated world. The
 * request's origin is the Suite tab's own origin, so the session cookie goes with it and no CORS
 * rule applies. The extension never calls Suite from its own origin.
 */
import type { TabFetch, TabFetchResult } from './suite-client';

/** Serialised into the Suite tab, so it must be self-contained. */
export async function fetchInPage(path: string, method: string, body: string | null): Promise<TabFetchResult> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body == null ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ?? undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The best open Suite tab: the active one if any, else the one used most recently. */
export async function findSuiteTab(origins: readonly string[]): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({});
  const suite = tabs.filter((t) => {
    const o = originOf(t.url);
    return o !== null && origins.includes(o) && t.id !== undefined;
  });
  if (!suite.length) return null;
  suite.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return suite[0] ?? null;
}

export class NoSuiteTab extends Error {
  constructor() {
    super('Open VCFO Suite in a tab and sign in.');
  }
}

export function makeTabFetch(getOrigins: () => Promise<readonly string[]>): TabFetch {
  return async (path, init) => {
    const tab = await findSuiteTab(await getOrigins());
    if (!tab?.id) throw new NoSuiteTab();
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'ISOLATED',
      func: fetchInPage,
      args: [path, init.method, init.body === undefined ? null : JSON.stringify(init.body)],
    });
    const value = result?.result as TabFetchResult | undefined;
    if (!value) throw new Error('the Suite tab did not answer');
    return value;
  };
}
