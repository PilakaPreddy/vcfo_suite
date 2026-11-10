/**
 * The page check before any fill (API.md, `pages[].urlPattern`). A recipe page names the portal
 * path it was recorded on as a glob: `*` is any run of characters, `?` one character, everything
 * else literal, matched against the whole path. On a mock host the page's `mockUrlPattern` is used
 * when it has one. The engine fills nothing while the portal tab shows another page.
 */
import { isMockHost } from './live';
import type { RecipePage } from '../shared/types';

export function globMatch(glob: string, path: string): boolean {
  const re = glob
    .split('')
    .map((ch) => (ch === '*' ? '.*' : ch === '?' ? '.' : ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${re}$`).test(path);
}

/** The pattern the page check uses on this host. */
export function patternFor(page: Pick<RecipePage, 'urlPattern' | 'mockUrlPattern'>, host: string): string {
  return isMockHost(host) && page.mockUrlPattern ? page.mockUrlPattern : page.urlPattern;
}

/** True when the tab's URL is the recipe page's portal page. */
export function pageMatchesUrl(page: Pick<RecipePage, 'urlPattern' | 'mockUrlPattern'>, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return globMatch(patternFor(page, u.hostname), u.pathname);
}
