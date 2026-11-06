import { isShellHomePath, normalizeShellPathname, shellRoleHomePath } from '@/components/shell/shell-back';
import { resolveChecklistItemFromStepParam, slugifyCompanyName } from '@/lib/slug';
import {
  internOverviewPhaseForItem,
  internRegistrationHeadingGroups,
} from '@/lib/intern/intern-overview-progress';
import type { ChecklistItem } from '@/data/checklist';

/** Section chip in the top-bar location trail. */
export type ShellCrumbIcon =
  | 'users'
  | 'folder'
  | 'megaphone'
  | 'bell'
  | 'layout'
  | 'briefcase'
  | 'inbox'
  | 'mail'
  | 'calendar'
  | 'book'
  | 'chart'
  | 'clipboard'
  | 'history'
  | 'settings'
  | 'home';

export type ShellCrumbSegment = {
  label: string;
  /** Real route; null on the current leaf (aria-current). */
  href: string | null;
  /** Engagement/project slug or id — resolve to companyName in the shell. */
  engagementKey?: string;
};

export type ShellCrumb = {
  icon: ShellCrumbIcon;
  segments: ShellCrumbSegment[];
};

const PAGE_LABEL: Record<string, string> = {
  today: 'Today',
  tasks: 'Work',
  clients: 'Clients',
  vault: 'Vault',
  'knowledge-bank': 'Knowledge bank',
  announcements: 'Announcements',
  notifications: 'Notifications',
  mail: 'Email',
  compliances: 'Compliances',
  calendar: 'Calendar',
  filings: 'Filings',
  analytics: 'Analytics',
  'audit-log': 'Audit',
  audit: 'Activity audit',
  dashboard: 'Home',
  overview: 'Home',
  projects: 'Projects',
  people: 'People',
  approvals: 'Approvals',
  team: 'Team',
  inbox: 'Inbox',
  incorporation: 'Incorporation',
  'labour-registers': 'Labour registers',
  documents: 'Documents',
  settings: 'Profile',
  engagements: 'Clients',
  'board-resolution': 'Board resolution',
  library: 'Library',
  'ask-vcfo': 'Ask VCFO',
  ask: 'Ask VCFO',
  learn: 'Library',
};

const PAGE_ICON: Record<string, ShellCrumbIcon> = {
  today: 'layout',
  dashboard: 'layout',
  overview: 'layout',
  tasks: 'briefcase',
  clients: 'users',
  engagements: 'users',
  people: 'users',
  team: 'users',
  vault: 'folder',
  documents: 'folder',
  'knowledge-bank': 'book',
  announcements: 'megaphone',
  notifications: 'bell',
  mail: 'mail',
  inbox: 'inbox',
  projects: 'briefcase',
  compliances: 'calendar',
  analytics: 'chart',
  approvals: 'clipboard',
  'audit-log': 'history',
  audit: 'history',
  settings: 'settings',
  incorporation: 'briefcase',
  library: 'book',
  'ask-vcfo': 'book',
  ask: 'book',
  learn: 'book',
};

function titleCase(segment: string): string {
  return segment
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function pageLabel(segment: string | undefined): string {
  if (!segment) return 'Home';
  return PAGE_LABEL[segment] ?? titleCase(segment);
}

function pageIcon(segment: string | undefined, group: string | null): ShellCrumbIcon {
  if (group === 'Docs') return 'folder';
  if (group === 'Updates') {
    return segment === 'notifications' ? 'bell' : 'megaphone';
  }
  if (group === 'Clients' || segment === 'engagements') return 'users';
  if (group === 'Projects' || segment === 'projects') return 'briefcase';
  if (!segment) return 'home';
  return PAGE_ICON[segment] ?? 'layout';
}

function roleBase(parts: string[]): string {
  if (parts[0] === 'app' && parts[1]) return `/app/${parts[1]}`;
  return '/app';
}

/** Parent group for Docs / Updates / Compliances sidebar disclosures. */
export function shellCrumbParent(segment: string | undefined): string | null {
  if (segment === 'vault' || segment === 'knowledge-bank') return 'Docs';
  if (segment === 'announcements' || segment === 'notifications') return 'Updates';
  if (segment === 'compliances') return 'Compliances';
  if (segment === 'engagements') return 'Clients';
  return null;
}

export type ShellCrumbEngagement = {
  id: string;
  slug?: string | null;
  companyName: string;
};

function resolveEngagementLabel(
  key: string | undefined,
  fallback: string,
  engagements: ReadonlyArray<ShellCrumbEngagement>,
): string {
  const normalized = key?.trim().toLowerCase();
  if (!normalized) return fallback;
  const match = engagements.find(
    (row) =>
      row.slug?.toLowerCase() === normalized ||
      row.id.toLowerCase() === normalized ||
      slugifyCompanyName(row.companyName) === normalized,
  );
  return match?.companyName ?? fallback;
}

export function resolveShellCrumbSegments(
  crumb: ShellCrumb,
  engagements: ReadonlyArray<ShellCrumbEngagement>,
): ShellCrumbSegment[] {
  return crumb.segments.map((seg) => ({
    ...seg,
    label: resolveEngagementLabel(seg.engagementKey, seg.label, engagements),
  }));
}

export function resolveShellCrumbCurrent(
  crumb: ShellCrumb,
  engagements: ReadonlyArray<ShellCrumbEngagement>,
): string {
  const segments = resolveShellCrumbSegments(crumb, engagements);
  return segments[segments.length - 1]?.label ?? 'Home';
}

/** Compare crumb / page titles without case or spacing noise. */
export function normalizeShellTrailLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * True when an in-page title only restates the top-bar leaf.
 * Those titles stay in the trail (and document title); they should not be a giant H1.
 */
export function pageTitleRepeatsTrail(
  title: string,
  pathname: string,
  engagements: ReadonlyArray<ShellCrumbEngagement> = [],
): boolean {
  const leaf = resolveShellCrumbCurrent(shellBreadcrumb(pathname), engagements);
  return normalizeShellTrailLabel(title) === normalizeShellTrailLabel(leaf);
}

function markLeaf(segments: ShellCrumbSegment[]): ShellCrumbSegment[] {
  if (segments.length === 0) return segments;
  return segments.map((seg, index) =>
    index === segments.length - 1 ? { ...seg, href: null } : seg,
  );
}

/** What the role's first sidebar row is called: staff work from Today, the client from Home. */
function homeLabel(parts: string[]): string {
  if (parts[1] === 'client') return 'Home';
  if (parts[1] === 'super' || parts[1] === 'dev') return 'Overview';
  return 'Today';
}

/** A raw id in a path (a uuid or a registration key), which never reads as a page name. */
const RAW_ID = /^[0-9a-f]{8}-|~/i;

/** The short crumb of the prototype: the page and its parents, never a leading Home. */
function trail(icon: ShellCrumbIcon, rest: ShellCrumbSegment[]): ShellCrumb {
  return { icon, segments: markLeaf(rest) };
}

function listForEntityPage(
  parts: string[],
  page: string,
): { label: string; href: string } {
  const base = roleBase(parts);
  if (parts[1] === 'intern' && page === 'engagements') {
    return { label: 'Clients', href: `${base}/clients` };
  }
  if (page === 'engagements' || page === 'projects') {
    return { label: 'Projects', href: `${base}/projects` };
  }
  return { label: pageLabel(page), href: `${base}/${page}` };
}

export function shellBreadcrumb(pathname: string): ShellCrumb {
  const path = normalizeShellPathname(pathname);
  const parts = path.split('/').filter(Boolean);
  const page = parts[2];
  const nested = parts[3];
  const base = roleBase(parts);

  if (isShellHomePath(path)) {
    return { icon: 'home', segments: [{ label: homeLabel(parts), href: null }] };
  }

  if ((page === 'engagements' || page === 'projects') && nested) {
    const internRoute = parts[1] === 'intern';
    const list = listForEntityPage(parts, page);
    // The prototype's short crumb: the sidebar row, with the page where it has no row of its own.
    const after = parts[4];
    const segs: ShellCrumbSegment[] = [{ label: list.label, href: list.href }];
    if (nested === 'new') segs.push({ label: 'New project', href: null });
    else if (after === 'documents') segs.push({ label: 'Documents', href: null });
    else if (after === 'board-resolution') segs.push({ label: 'Board resolution', href: null });
    return trail(internRoute || page === 'engagements' ? 'users' : 'briefcase', segs);
  }

  if (nested && page === 'people') {
    return trail('users', [
      { label: 'People', href: `${base}/people` },
      { label: titleCase(nested), href: null },
    ]);
  }

  // Library item / topic reader: the leaf is the page itself, not a raw id or slug.
  if (parts[1] === 'client' && (page === 'library' || page === 'learn') && parts[3]) {
    return trail('book', [
      { label: 'Library', href: '/app/client/library' },
      { label: page === 'learn' ? 'Explanation' : 'Saved explanation', href: null },
    ]);
  }

  if (parts[1] === 'client' && page === 'incorporation' && parts[3] === 'step') {
    return trail('briefcase', [{ label: 'Incorporation', href: '/app/client/incorporation' }]);
  }

  if (parts[1] === 'client' && page === 'board-resolution') {
    return trail('briefcase', [
      { label: 'Incorporation', href: '/app/client/incorporation' },
      { label: 'Board resolution', href: null },
    ]);
  }

  const group = shellCrumbParent(page);
  if (group === 'Docs') {
    return trail(pageIcon(page, group), [
      { label: 'Docs', href: `${base}/vault` },
      { label: pageLabel(page), href: `${base}/${page}` },
    ]);
  }
  if (group === 'Updates') {
    return trail(pageIcon(page, group), [
      { label: 'Updates', href: `${base}/announcements` },
      { label: pageLabel(page), href: `${base}/${page}` },
    ]);
  }
  // Compliances is a nested group: `{base}/compliances/{calendar|filings}`.
  // The parent links to its landing child (the calendar), as Docs → Vault does.
  if (group === 'Compliances') {
    return trail('calendar', [
      { label: 'Compliances', href: `${base}/compliances/calendar` },
      { label: pageLabel(nested ?? 'calendar'), href: `${base}/compliances/${nested ?? 'calendar'}` },
    ]);
  }

  if (nested) {
    const rest: ShellCrumbSegment[] = [
      { label: pageLabel(page), href: `${base}/${page}` },
    ];
    for (let i = 3; i < parts.length; i += 1) {
      if (RAW_ID.test(decodeURIComponent(parts[i]!))) continue;
      const href = i === parts.length - 1 ? null : `/${parts.slice(0, i + 1).join('/')}`;
      rest.push({ label: pageLabel(parts[i]), href });
    }
    return trail(pageIcon(page, group), rest);
  }

  // The super admin's project list is called Clients (K-45).
  const label = parts[1] === 'super' && page === 'projects' ? 'Clients' : pageLabel(page);
  return trail(pageIcon(page, group), [{ label, href: `${base}/${page}` }]);
}
