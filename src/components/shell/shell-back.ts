/** Intern clients list — keep equal to `INTERN_CLIENTS_HREF` in InternClientsNav. */
const INTERN_CLIENTS_HREF = '/app/intern/clients';

/** Strip query/hash and a trailing slash (except `/`). */
export function normalizeShellPathname(pathname: string): string {
  const cut = pathname.split(/[?#]/)[0] ?? pathname;
  if (cut.length > 1 && cut.endsWith('/')) return cut.slice(0, -1);
  return cut || '/';
}

/**
 * Sidebar primary destinations (exact path, no extra segments).
 * Keep in sync with `RoleSidebar` item `to` values. Settings lives in chrome
 * (Profile / footer), not this list — nested back should show there.
 */
const SHELL_PRIMARY_PATHS: ReadonlySet<string> = new Set([
  '/app/intern/today',
  '/app/intern/tasks',
  '/app/intern/announcements',
  '/app/intern/notifications',
  INTERN_CLIENTS_HREF,
  '/app/intern/vault',
  '/app/intern/mail',
  '/app/intern/compliances/calendar',
  '/app/intern/compliances/filings',
  '/app/intern/compliances/obligations',
  '/app/intern/incorporation',
  '/app/intern/registrations',
  '/app/intern/labour-registers',
  '/app/intern/knowledge-bank',
  '/app/intern/analytics',
  '/app/intern/audit-log',
  '/app/manager/dashboard',
  '/app/manager/announcements',
  '/app/manager/notifications',
  '/app/manager/projects',
  '/app/manager/approvals',
  '/app/manager/people',
  '/app/manager/mail',
  '/app/manager/team',
  '/app/manager/compliances/calendar',
  '/app/manager/compliances/filings',
  '/app/manager/compliances/obligations',
  '/app/manager/incorporation',
  '/app/manager/registrations',
  '/app/manager/labour-registers',
  '/app/manager/vault',
  '/app/manager/knowledge-bank',
  '/app/manager/analytics',
  '/app/manager/audit-log',
  '/app/admin/dashboard',
  '/app/admin/announcements',
  '/app/admin/notifications',
  '/app/admin/projects',
  '/app/admin/people',
  '/app/admin/mail',
  '/app/admin/approvals',
  '/app/admin/compliances/calendar',
  '/app/admin/compliances/filings',
  '/app/admin/compliances/obligations',
  '/app/admin/incorporation',
  '/app/admin/registrations',
  '/app/admin/labour-registers',
  '/app/admin/vault',
  '/app/admin/knowledge-bank',
  '/app/admin/analytics',
  '/app/admin/audit-log',
  '/app/super/dashboard',
  '/app/super/projects',
  '/app/super/risks',
  '/app/super/practice/incorporation',
  '/app/super/practice/registrations',
  '/app/super/practice/labour-registers',
  '/app/super/practice/compliances',
  '/app/super/practice/filings',
  '/app/super/team',
  '/app/super/growth',
  '/app/super/reports',
  '/app/super/announcements',
  '/app/super/notifications',
  '/app/client/overview',
  '/app/client/announcements',
  '/app/client/notifications',
  '/app/client/incorporation',
  '/app/client/compliances/calendar',
  '/app/client/compliances/filings',
  '/app/client/compliances/obligations',
  '/app/client/registrations',
  '/app/client/labour-registers',
  '/app/client/documents',
  '/app/client/team',
  '/app/client/audit',
]);

const ROLE_INDEX_PATHS = new Set([
  '/app/intern',
  '/app/manager',
  '/app/admin',
  '/app/super',
  '/app/client',
]);

const ROLE_HOME: Record<string, string> = {
  intern: '/app/intern/today',
  manager: '/app/manager/dashboard',
  admin: '/app/admin/dashboard',
  super: '/app/super/dashboard',
  client: '/app/client/overview',
};

function appRoleSegment(pathname: string): string | undefined {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === 'app' ? parts[1] : undefined;
}

function roleHomeForPath(pathname: string): string {
  const role = appRoleSegment(pathname);
  return (role && ROLE_HOME[role]) || '/';
}

/** Role home for crumbs (intern Today, staff dashboards, client Inbox). */
export function shellRoleHomePath(pathname: string): string {
  return roleHomeForPath(pathname);
}

/** True home / role index — omit the page-title back control. */
export function isShellHomePath(pathname: string): boolean {
  const path = normalizeShellPathname(pathname);
  if (!path.startsWith('/app/')) return false;
  if (ROLE_INDEX_PATHS.has(path)) return true;
  return path === roleHomeForPath(path);
}

/** True on nested AppShell routes; false on marketing, login, and the true home.
 *  Consumed by `PageBackButton` (page title), not the top bar. */
export function shouldShowShellBack(pathname: string): boolean {
  const path = normalizeShellPathname(pathname);
  if (!path.startsWith('/app/')) return false;
  return !isShellHomePath(path);
}

/**
 * Parent href when history cannot go back (new tab / length ≤ 1).
 * Engagement detail → clients list; step / board-resolution → engagement; etc.
 */
export function shellBackFallbackPath(pathname: string): string {
  const path = normalizeShellPathname(pathname);
  if (!path.startsWith('/app/')) return '/';

  const parts = path.split('/').filter(Boolean);
  const role = parts[1];
  const home = roleHomeForPath(path);

  if (path === '/app/client/board-resolution') {
    return '/app/client/incorporation';
  }

  /* /app/intern/engagements/:id → clients (there is no engagements list). */
  if (role === 'intern' && parts[2] === 'engagements' && parts.length === 4) {
    return INTERN_CLIENTS_HREF;
  }

  if (parts.length <= 2) return home;

  /* A sidebar destination is a top-level place even when its URL is nested
     (Compliances → Calendar / Filings): up from there is home, not the group
     index that would only redirect back. */
  if (SHELL_PRIMARY_PATHS.has(path)) return home;

  /* `/step/:stepId` is one nested level (engagement / project), not two. */
  const drop = parts.length >= 2 && parts[parts.length - 2] === 'step' ? 2 : 1;
  if (parts.length - drop < 2) return home;

  const parent = `/${parts.slice(0, -drop).join('/')}`;
  if (ROLE_INDEX_PATHS.has(parent)) return home;
  return parent;
}

export type ShellBackAction = { kind: 'history' } | { kind: 'href'; href: string };

/**
 * A step workspace always walks UP to the phase list, never back through the
 * steps you happened to visit. Going step → step → step and pressing back three
 * times to escape is not a way out; the parent is.
 */
function isStepWorkspacePath(parts: string[]): boolean {
  return parts.length >= 2 && parts[parts.length - 2] === 'step';
}

export function resolveShellBackAction(
  pathname: string,
  historyLength: number,
): ShellBackAction {
  const path = normalizeShellPathname(pathname);
  const parts = path.split('/').filter(Boolean);
  if (isStepWorkspacePath(parts)) {
    return { kind: 'href', href: shellBackFallbackPath(path) };
  }
  if (historyLength > 1) return { kind: 'history' };
  return { kind: 'href', href: shellBackFallbackPath(path) };
}
