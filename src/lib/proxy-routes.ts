import { isValidDbRole, type Role } from '@/lib/auth';
import { postLoginPath, roleHomePath } from '@/lib/auth-routes';

/**
 * The request-path decisions of `proxy.ts`, kept free of Next.js and Auth.js so they can be unit
 * tested. The proxy reads the role from the session JWT at the edge and calls `proxyRedirect`.
 *
 *   - Signed out on /app/* or /receivables/manager goes to /login?next=<path>.
 *   - Signed out on the client partner pages (/receivables and its sub-pages) goes to
 *     /receivables/login?next=<path and query>. The partner login and set-password pages stay public.
 *   - Signed in on / or /login goes to the role home.
 *   - A client partner is kept out of /app and /receivables/manager and sent to /receivables.
 *   - Staff who open a partner page go to /receivables/manager (editors) or their role home.
 *   - On /app the URL segment must match the role; the super admin may enter every segment.
 */

const ROLE_SEGMENT: Partial<Record<Role, string>> = {
  super_admin: 'super',
  admin: 'admin',
  manager: 'manager',
  intern: 'intern',
  client: 'client',
  developer: 'dev',
};

const ALL_SEGMENTS = new Set(['super', 'admin', 'manager', 'intern', 'client', 'dev']);

/** The roles that may open the receivables manager area. */
const RECEIVABLES_EDITORS = new Set<string>(['super_admin', 'admin', 'manager']);

/** The partner pages a signed-out visitor may open: the login page and the invite's set-password page. */
export function isPublicReceivablesPath(path: string): boolean {
  return (
    path === '/receivables/login' ||
    path === '/receivables/set-password' ||
    path.startsWith('/receivables/set-password/')
  );
}

export function isReceivablesManagerPath(path: string): boolean {
  return path === '/receivables/manager' || path.startsWith('/receivables/manager/');
}

/** A client partner page that needs a partner session: /receivables and its sub-pages, bar the manager area and the public pages. */
export function isReceivablesPartnerPath(path: string): boolean {
  if (path !== '/receivables' && !path.startsWith('/receivables/')) return false;
  return !isReceivablesManagerPath(path) && !isPublicReceivablesPath(path);
}

/** The role home, or /login for a role this build does not know. */
function homeFor(role: string): string {
  return isValidDbRole(role) ? roleHomePath(role) : '/login';
}

function loginRedirect(loginPath: string, next: string): string {
  return `${loginPath}?${new URLSearchParams({ next }).toString()}`;
}

/**
 * Where the proxy should redirect this request, or null to let it through. `search` is the raw
 * query string including its leading `?` (empty when there is none). `role` is the session role,
 * or null when signed out.
 */
export function proxyRedirect(path: string, search: string, role: string | null | undefined): string | null {
  const isApp = path === '/app' || path.startsWith('/app/');
  const isManager = isReceivablesManagerPath(path);
  const isPartnerPage = isReceivablesPartnerPath(path);
  const isAuthPage = path === '/login' || path === '/';
  const isPartnerLogin = path === '/receivables/login';

  if (!role) {
    if (isApp || isManager) return loginRedirect('/login', path);
    if (isPartnerPage) return loginRedirect('/receivables/login', `${path}${search}`);
    return null;
  }

  if (role === 'partner') {
    if (isApp || isManager || isAuthPage) return '/receivables';
    if (isPartnerLogin) {
      const next = new URLSearchParams(search).get('next');
      return postLoginPath('partner', next);
    }
    return null;
  }

  if (isAuthPage) return homeFor(role);

  if (isPartnerPage || isPartnerLogin) {
    return RECEIVABLES_EDITORS.has(role) ? '/receivables/manager' : homeFor(role);
  }

  if (isApp) {
    const seg = path.split('/')[2];
    if (seg && ALL_SEGMENTS.has(seg)) {
      // Bird's-eye: the super admin may enter any workspace segment.
      if (role === 'super_admin') return null;
      const expected = isValidDbRole(role) ? ROLE_SEGMENT[role] : undefined;
      if (expected && seg !== expected) return homeFor(role);
    }
  }

  return null;
}
