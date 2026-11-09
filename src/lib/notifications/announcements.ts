import { isAdminOrManager, type Role } from '@/lib/auth';

export type AnnouncementOrigin = 'manual' | 'feed';

export const ANNOUNCEMENT_KINDS = [
  'post-incorp',
  'incorp',
  'reg',
  'compliance',
  'tax',
  'gst',
  'mca',
  'deadline',
  'general',
] as const;

export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export const ANNOUNCEMENT_KIND_LABEL: Record<AnnouncementKind, string> = {
  'post-incorp': 'Post-Incorp',
  incorp: 'Incorp',
  reg: 'Reg',
  compliance: 'Compliance',
  tax: 'Tax',
  gst: 'GST',
  mca: 'MCA',
  deadline: 'Deadline',
  general: 'General',
};

function isAnnouncementKind(value: string | null | undefined): value is AnnouncementKind {
  return ANNOUNCEMENT_KINDS.includes(value as AnnouncementKind);
}

export function parseAnnouncementKind(value: string | null | undefined): AnnouncementKind {
  return isAnnouncementKind(value) ? value : 'general';
}

export function inferAnnouncementKind(title: string, sourceName?: string | null): AnnouncementKind {
  const s = `${title} ${sourceName ?? ''}`.toLowerCase();
  if (/\bgst\b/.test(s)) return 'gst';
  if (/\bmca\b|companies act|roc\b/.test(s)) return 'mca';
  if (/\btds\b|income tax|it act|finance act|\btax\b/.test(s)) return 'tax';
  if (/deadline|due date|last date/.test(s)) return 'deadline';
  if (/compliance|statutory/.test(s)) return 'compliance';
  if (/post[-\s]?incorp/.test(s)) return 'post-incorp';
  if (/incorp/.test(s)) return 'incorp';
  if (/\breg(istration)?\b/.test(s)) return 'reg';
  return 'general';
}

function authorDisplayLabel(authorName: string): string {
  const name = authorName.trim();
  if (!name) return 'Staff';
  const at = name.indexOf('@');
  if (at > 0) return name.slice(0, at);
  return name;
}

export function announcementAuthorName(item: {
  origin: AnnouncementOrigin;
  authorName: string;
}): string {
  if (item.origin === 'feed') return 'VCFOSuite';
  return authorDisplayLabel(item.authorName);
}

export function announcementAttribution(item: {
  origin: AnnouncementOrigin;
  authorName: string;
  authorRole?: string | null;
}): string {
  if (item.origin === 'feed') return 'From VCFOSuite';
  return `From ${authorDisplayLabel(item.authorName)}`;
}

export type AnnouncementListFilter = 'all' | 'important' | 'general';

/** No `important` kind exists — deadline + compliance are the urgency equivalents. */
const ANNOUNCEMENT_IMPORTANT_KINDS: readonly AnnouncementKind[] = ['deadline', 'compliance'];

export function announcementMatchesFilter(
  kind: AnnouncementKind,
  filter: AnnouncementListFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'general') return kind === 'general';
  return ANNOUNCEMENT_IMPORTANT_KINDS.includes(kind);
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  origin: AnnouncementOrigin;
  sourceId: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  /** In-app client portal page (`/app/client/...`) the detail's "Open" button goes to. */
  linkPath?: string | null;
  /** A Watch update staff can already see; a reviewer has not checked it yet. */
  unreviewed?: boolean;
  authorId: string | null;
  authorName: string;
  authorRole: string | null;
  publishedAt: string;
  createdAt: string;
}

/** A client portal path an announcement may link to: `/app/client/...`, no host, no scheme. */
export function safePortalLinkPath(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v || v.length > 300) return null;
  return /^\/app\/client(?:\/[\w\-./%]*)?(?:\?[\w\-=&%.]*)?$/.test(v) && !v.includes('..') ? v : null;
}

export interface AnnouncementSource {
  id: string;
  name: string;
  feedUrl: string;
  homepageUrl: string | null;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

const ANNOUNCEMENT_READ_PREFIX = 'vcfo.announcements.read.';
export const ANNOUNCEMENT_READ_EVENT = 'vcfo-announcements-read';
const ANNOUNCEMENT_DAILY_PREFIX = 'vcfo.announcements.daily.';
const ANNOUNCEMENT_POPUP_PREFIX = 'vcfo.announcements.popup.';
const ANNOUNCEMENT_POPUP_EVENT = 'vcfo-announcements-popup';
export const ANNOUNCEMENT_GENIE_LAND_EVENT = 'vcfo-announcements-genie-land';
export const ANNOUNCEMENT_SHOW_EVENT = 'vcfo-announcements-show';
export const ANNOUNCEMENT_BELL_SELECTOR = '[data-announcements-bell]';
export const ANNOUNCEMENT_BELL_TARGET_SELECTOR = '[data-announcements-bell-target]';

export type { GenieBox } from '@/lib/notifications/genie-dock';
export { measureGenieDock } from '@/lib/notifications/genie-dock';
export const ANNOUNCEMENT_FIRST_VISIT_POPUP_CAP = 3;
export const ANNOUNCEMENT_LIVE_POPUP_CAP = 8;
const ANNOUNCEMENT_IST = 'Asia/Kolkata';

export function announcementYmdIst(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: ANNOUNCEMENT_IST });
}

export function dailyAnnouncementStorageKey(userId: string, ymd: string): string {
  return `${ANNOUNCEMENT_DAILY_PREFIX}${userId}.${ymd}`;
}

export function announcementsForDailyPopup(
  items: Announcement[],
  readIds: Set<string>,
  now: Date = new Date(),
): Announcement[] {
  const today = announcementYmdIst(now);
  return items
    .filter((item) => {
      const publishedDay = announcementYmdIst(new Date(item.publishedAt));
      return publishedDay === today || !readIds.has(item.id);
    })
    .slice(0, 12);
}

export function announcementPopupStorageKey(userId: string): string {
  return `${ANNOUNCEMENT_POPUP_PREFIX}${userId}`;
}

function parseStoredIdSet(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Ids already presented as a live popup. `null` means this browser has never initialized the set. */
export function readAnnouncementPopupIds(userId: string): Set<string> | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(announcementPopupStorageKey(userId));
    if (raw == null) return null;
    return parseStoredIdSet(raw);
  } catch {
    return null;
  }
}

function writeAnnouncementPopupIds(userId: string, ids: Iterable<string>): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(announcementPopupStorageKey(userId), JSON.stringify([...new Set(ids)]));
    window.dispatchEvent(new Event(ANNOUNCEMENT_POPUP_EVENT));
  } catch {
    /* ignore */
  }
}

export function addAnnouncementPopupIds(userId: string, ids: Iterable<string>): Set<string> {
  const incoming = [...ids].filter(Boolean);
  const existing = readAnnouncementPopupIds(userId);
  const next = existing ?? new Set<string>();
  let changed = existing === null;
  for (const id of incoming) {
    if (next.has(id)) continue;
    next.add(id);
    changed = true;
  }
  if (!changed) return next;
  writeAnnouncementPopupIds(userId, next);
  return next;
}

export type AnnouncementShowDetail = { announcement: Announcement };

/** Explicit reopen — ignores the auto-popup seen set. */
export function requestAnnouncementPopup(item: Announcement): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AnnouncementShowDetail>(ANNOUNCEMENT_SHOW_EVENT, { detail: { announcement: item } }),
  );
}

export function readDailyAnnouncementSeenIds(userId: string, ymd: string): string[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(dailyAnnouncementStorageKey(userId, ymd));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ids?: unknown };
    return Array.isArray(parsed?.ids) ? parsed.ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function selectAnnouncementPopups(input: {
  items: Announcement[];
  viewerId: string;
  poppedIds: Set<string> | null;
  readIds: Set<string>;
  dailySeenIds: ReadonlySet<string>;
  now?: Date;
}): { queue: Announcement[]; seedIds: string[] } {
  const { items, viewerId, poppedIds, readIds, dailySeenIds } = input;
  const today = announcementYmdIst(input.now ?? new Date());

  if (poppedIds === null) {
    const queue = items
      .filter((item) => {
        if (item.authorId === viewerId) return false;
        if (readIds.has(item.id)) return false;
        if (dailySeenIds.has(item.id)) return false;
        return announcementYmdIst(new Date(item.publishedAt)) === today;
      })
      .slice(0, ANNOUNCEMENT_FIRST_VISIT_POPUP_CAP);
    return { queue, seedIds: items.map((item) => item.id) };
  }

  const fresh = items.filter((item) => !poppedIds.has(item.id));
  const queue = fresh
    .filter((item) => item.authorId !== viewerId)
    .slice(0, ANNOUNCEMENT_LIVE_POPUP_CAP);
  return { queue, seedIds: fresh.map((item) => item.id) };
}

export function readAnnouncementIds(userId: string): Set<string> {
  if (typeof window === 'undefined' || !userId) return new Set();
  try {
    const raw = window.localStorage.getItem(`${ANNOUNCEMENT_READ_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeAnnouncementReadIds(userId: string, ids: Iterable<string>): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(`${ANNOUNCEMENT_READ_PREFIX}${userId}`, JSON.stringify([...ids]));
    window.dispatchEvent(new Event(ANNOUNCEMENT_READ_EVENT));
  } catch {
    /* ignore */
  }
}

export function canWriteAnnouncements(role: Role | string | undefined): boolean {
  return isAdminOrManager(role);
}

export function canManageAnnouncementSources(role: Role | string | undefined): boolean {
  return isAdminOrManager(role);
}

export function roleAnnouncementsPath(role: Role): string {
  switch (role) {
    case 'super_admin':
      return '/app/super/announcements';
    case 'admin':
      return '/app/admin/announcements';
    case 'manager':
      return '/app/manager/announcements';
    case 'intern':
      return '/app/intern/announcements';
    case 'client':
      return '/app/client/announcements';
  }
}

/** Official hosts Watch may read: RSS/Atom feeds and public listing pages, never a login page. */
export const OFFICIAL_FEED_HOSTS = [
  'incometaxindia.gov.in',
  'incometax.gov.in',
  'incometaxindiaefiling.gov.in',
  'gst.gov.in',
  'cbic.gov.in',
  'cbic-gst.gov.in',
  'gstcouncil.gov.in',
  'mca.gov.in',
  'pib.gov.in',
  'egazette.gov.in',
  'rbi.org.in',
  'firms.rbi.org.in',
  'flair.rbi.org.in',
  'finmin.nic.in',
  'dea.gov.in',
  'dor.gov.in',
  'epfindia.gov.in',
  'esic.gov.in',
  'sebi.gov.in',
  'nfra.gov.in',
  'icai.org',
  'ibbi.gov.in',
  'epfo.gov.in',
  'cdnbbsr.s3waas.gov.in',
  'icegate.gov.in',
  'dgft.gov.in',
  'stpi.in',
  'labour.telangana.gov.in',
  'tgct.gov.in',
  'ipindiaonline.gov.in',
  'icdr.ceir.gov.in',
  'team.msme.gov.in',
  'cdma.cgg.gov.in',
  'ccilindia-lei.co.in',
  'icsi.edu',
  'dpiit.gov.in',
  'labour.gov.in',
  'indiacode.nic.in',
  'finmin.gov.in',
] as const;

const OFFICIAL_FEED_HOST_SET = new Set<string>(OFFICIAL_FEED_HOSTS);

const TRACKING_QUERY_PARAMS = new Set([
  'gclid',
  'gbraid',
  'wbraid',
  'gclsrc',
  'dclid',
  'fbclid',
  'msclkid',
  'yclid',
  'mc_cid',
  'mc_eid',
  '_ga',
]);

function isTrackingQueryParam(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (!k) return false;
  if (k.startsWith('utm_') || k.startsWith('gad_')) return true;
  return TRACKING_QUERY_PARAMS.has(k);
}

/** Strip chatgpt UTM, gclid, and other ads/analytics junk. Leaves real query params. */
export function cleanOfficialUrl(raw: string): string {
  const url = new URL(raw.trim());
  stripTrackingParams(url);
  return url.href;
}

function stripTrackingParams(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingQueryParam(key)) url.searchParams.delete(key);
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

export function isOfficialFeedHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (OFFICIAL_FEED_HOST_SET.has(host)) return true;
  for (const allowed of OFFICIAL_FEED_HOSTS) {
    if (host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

/** True only for URLs that look like RSS/Atom — not HTML listing or login pages. */
export function isLikelyRssOrAtomUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  const path = url.pathname.toLowerCase();
  const search = url.search.toLowerCase();
  if (/\.(rss|atom|xml)$/i.test(path)) return true;
  if (/\/(rss|atom|feeds?)(\/|$)/i.test(path)) return true;
  if (path.includes('rss') || path.includes('atom')) return true;
  if (/(?:^|[?&])(?:format|type|output)=(?:rss|atom|xml)\b/.test(search)) return true;
  return false;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host === '0.0.0.0' || host.startsWith('[') || host.includes(':')) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function assertSafeHttpsUrl(raw: string, kind: 'feed' | 'link' = 'link'): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(kind === 'feed' ? 'invalid_feed_url' : 'invalid_link');
  }
  if (url.protocol !== 'https:') {
    throw new Error(kind === 'feed' ? 'feed_must_be_https' : 'link_must_be_https');
  }
  if (url.username || url.password) {
    throw new Error(kind === 'feed' ? 'invalid_feed_url' : 'invalid_link');
  }
  if (isPrivateOrLocalHost(url.hostname)) {
    throw new Error(kind === 'feed' ? 'feed_host_not_allowed' : 'invalid_link');
  }
  if (kind === 'feed' && !isOfficialFeedHost(url.hostname)) {
    throw new Error('feed_host_not_allowed');
  }
  stripTrackingParams(url);
  return url;
}

export function assertSafeFeedUrl(raw: string): URL {
  return assertSafeHttpsUrl(raw, 'feed');
}

export type ParsedFeedItem = {
  title: string;
  body: string;
  link: string;
  externalId: string;
  publishedAt: Date;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/g, '&');
}

export function stripHtml(value: string): string {
  return decodeXmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function innerTag(block: string, name: string): string {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const match = block.match(re);
  return match?.[1] ? stripHtml(match[1]) : '';
}

function tagAttr(block: string, name: string, attr: string): string {
  const re = new RegExp(`<${name}[^>]*\\s${attr}\\s*=\\s*["']([^"']+)["'][^>]*/?>`, 'i');
  return re.exec(block)?.[1]?.trim() ?? '';
}

function chunks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, 'gi');
  return xml.match(re) ?? [];
}

/**
 * SEBI's feed writes item dates as "05 Nov, 2026 +0530": a comma after the month and no time.
 * `Date.parse` rejects that, so it is rewritten to "05 Nov 2026 00:00:00 +0530" before parsing.
 */
const DAY_MONTH_YEAR_ZONE = /^(\d{1,2}\s+[A-Za-z]{3,9}),?\s+(\d{4})\s+([+-]\d{4})$/;

function parseDate(raw: string | undefined): Date {
  const text = raw?.trim();
  if (!text) return new Date();
  let parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    const match = DAY_MONTH_YEAR_ZONE.exec(text);
    if (match) parsed = Date.parse(`${match[1]} ${match[2]} 00:00:00 ${match[3]}`);
  }
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}

function asFeedItem(input: {
  title: string;
  body: string;
  link: string;
  externalId: string;
  publishedAt: Date;
}): ParsedFeedItem | null {
  const title = input.title.trim().slice(0, 200);
  if (!title) return null;
  let link: URL;
  try {
    link = assertSafeHttpsUrl(input.link, 'link');
  } catch {
    return null;
  }
  if (!isOfficialFeedHost(link.hostname)) return null;
  const href = link.href;
  return {
    title,
    body: input.body.trim().slice(0, 8000),
    link: href,
    externalId: (input.externalId.trim() || href).slice(0, 500),
    publishedAt: input.publishedAt,
  };
}

/** Parse RSS 2.0 or Atom XML into announcement-ready items. */
export function parseRssOrAtom(xml: string): ParsedFeedItem[] {
  const rssItems = chunks(xml, 'item').map((block) => {
    const link = innerTag(block, 'link') || tagAttr(block, 'link', 'href');
    const guid = innerTag(block, 'guid');
    return asFeedItem({
      title: innerTag(block, 'title'),
      body: innerTag(block, 'description') || innerTag(block, 'content:encoded'),
      link,
      externalId: guid || link,
      publishedAt: parseDate(innerTag(block, 'pubDate') || innerTag(block, 'dc:date')),
    });
  });

  const atomItems = chunks(xml, 'entry').map((block) => {
    const link = tagAttr(block, 'link', 'href') || innerTag(block, 'link');
    const id = innerTag(block, 'id');
    return asFeedItem({
      title: innerTag(block, 'title'),
      body: innerTag(block, 'summary') || innerTag(block, 'content'),
      link,
      externalId: id || link,
      publishedAt: parseDate(innerTag(block, 'updated') || innerTag(block, 'published')),
    });
  });

  const seen = new Set<string>();
  const out: ParsedFeedItem[] = [];
  for (const item of [...rssItems, ...atomItems]) {
    if (!item || seen.has(item.externalId)) continue;
    seen.add(item.externalId);
    out.push(item);
  }
  return out;
}

export async function fetchOfficialFeedXml(feedUrl: string): Promise<string> {
  let current = assertSafeFeedUrl(feedUrl);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(current.href, {
      redirect: 'manual',
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.4',
        'User-Agent': 'VCFO-Suite/1.0 (firm announcement feeds)',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error('feed_redirect_invalid');
      current = assertSafeFeedUrl(new URL(location, current).href);
      continue;
    }
    if (!res.ok) throw new Error(`feed_http_${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 512 * 1024) throw new Error('feed_too_large');
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf).trim();
    if (!text.includes('<')) throw new Error('feed_not_xml');
    return text;
  }
  throw new Error('feed_too_many_redirects');
}
