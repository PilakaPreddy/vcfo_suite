/**
 * Client portal route keys (the prototype's `routes.js` keys) → real app paths.
 * Every `data-go="key"` in the prototype becomes `portalHref(key)` here.
 */
const CP_BASE = '/app/client';

export type PortalRouteKey =
  | 'home'
  | 'announcements'
  | 'notifications'
  | 'incorporation'
  | 'compliances'
  | 'filings'
  | 'obligations'
  | 'labour-registers'
  | 'registrations'
  | 'documents'
  | 'knowledge-bank'
  /** Alias of `knowledge-bank` (the prototype's "library" key); both open the same page. */
  | 'library'
  | 'credentials'
  | 'team'
  | 'audit'
  | 'settings'
  | 'profile'
  | 'board-resolution';

export const PORTAL_PATHS: Record<PortalRouteKey, string> = {
  home: `${CP_BASE}/overview`,
  announcements: `${CP_BASE}/announcements`,
  notifications: `${CP_BASE}/notifications`,
  incorporation: `${CP_BASE}/incorporation`,
  compliances: `${CP_BASE}/compliances/calendar`,
  filings: `${CP_BASE}/compliances/filings`,
  obligations: `${CP_BASE}/compliances/obligations`,
  'labour-registers': `${CP_BASE}/labour-registers`,
  registrations: `${CP_BASE}/registrations`,
  documents: `${CP_BASE}/documents`,
  'knowledge-bank': `${CP_BASE}/library`,
  library: `${CP_BASE}/library`,
  credentials: `${CP_BASE}/credentials`,
  team: `${CP_BASE}/team`,
  audit: `${CP_BASE}/audit`,
  settings: `${CP_BASE}/settings`,
  profile: `${CP_BASE}/profile`,
  'board-resolution': `${CP_BASE}/board-resolution`,
};

export const PORTAL_TITLES: Record<PortalRouteKey, string> = {
  home: 'Home',
  announcements: 'Announcements',
  notifications: 'Notifications',
  incorporation: 'Incorporation',
  compliances: 'Calendar',
  filings: 'Filings',
  obligations: 'Obligations',
  'labour-registers': 'Labour registers',
  registrations: 'Registrations',
  documents: 'Documents',
  'knowledge-bank': 'Library',
  library: 'Library',
  credentials: 'Credentials',
  team: 'Team',
  audit: 'Audit',
  settings: 'Settings',
  profile: 'Profile',
  'board-resolution': 'Board resolution',
};

export function portalHref(key: PortalRouteKey): string {
  return PORTAL_PATHS[key];
}

/** `inc-step-7` style keys from the prototype → the step page by checklist item id. */
export function stepHref(stepId: string): string {
  return `${CP_BASE}/incorporation/step/${encodeURIComponent(stepId)}`;
}

export function phaseHref(phaseNo: number): string {
  return `${CP_BASE}/incorporation/phase/${phaseNo}`;
}

/** Route keys that only alias another key; lists of pages skip them so a page shows once. */
export const PORTAL_ALIAS_KEYS: ReadonlySet<PortalRouteKey> = new Set<PortalRouteKey>(['library']);

/** Which sidebar item is current for a pathname (prototype shell.js `active()` + ALIAS). */
export function activeKeyFor(pathname: string): PortalRouteKey | null {
  const p = pathname.replace(/\/+$/, '');
  if (p === CP_BASE || p.startsWith(`${CP_BASE}/overview`)) return 'home';
  if (p.startsWith(`${CP_BASE}/incorporation`) || p.startsWith(`${CP_BASE}/board-resolution`)) return 'incorporation';
  if (p.startsWith(`${CP_BASE}/compliances/filings`)) return 'filings';
  if (p.startsWith(`${CP_BASE}/compliances/obligations`)) return 'obligations';
  if (p.startsWith(`${CP_BASE}/compliances`)) return 'compliances';
  if (p.startsWith(`${CP_BASE}/library`) || p.startsWith(`${CP_BASE}/learn`)) return 'knowledge-bank';
  for (const key of Object.keys(PORTAL_PATHS) as PortalRouteKey[]) {
    if (p.startsWith(PORTAL_PATHS[key])) return key;
  }
  return null;
}

/** Top bar location trail: [middle crumb?, current crumb]. */
export function crumbsFor(pathname: string): { mid?: string; crumb: string; icon: PortalRouteKey } {
  const key = activeKeyFor(pathname) ?? 'home';
  const p = pathname;
  if (p.includes('/incorporation/step/')) return { mid: 'Incorporation', crumb: 'Step', icon: 'incorporation' };
  if (p.includes('/incorporation/phase/')) return { mid: 'Incorporation', crumb: 'Phase', icon: 'incorporation' };
  if (p.includes('/board-resolution')) return { mid: 'Incorporation', crumb: 'Board resolution', icon: 'incorporation' };
  if (key === 'compliances' || key === 'filings' || key === 'obligations') return { mid: 'Compliances', crumb: PORTAL_TITLES[key], icon: key };
  if (key === 'announcements' || key === 'notifications') return { mid: 'Updates', crumb: PORTAL_TITLES[key], icon: key };
  if (p.startsWith(`${CP_BASE}/ask`)) return { crumb: 'Ask VCFO', icon: 'home' };
  if (/\/library\/[^/]+/.test(p) || p.includes('/learn/')) return { mid: 'Library', crumb: 'Reading', icon: 'knowledge-bank' };
  return { crumb: PORTAL_TITLES[key], icon: key };
}
