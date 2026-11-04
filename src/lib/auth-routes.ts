import type { Role } from '@/lib/auth';

/** Canonical post-login destination per app role. */
export function roleHomePath(role: Role): string {
  switch (role) {
    case 'super_admin':
      return '/app/super/dashboard';
    case 'admin':
      return '/app/admin/dashboard';
    case 'manager':
      return '/app/manager/dashboard';
    case 'intern':
      return '/app/intern/today';
    case 'client':
      return '/app/client/overview';
    case 'developer':
      return '/app/dev/overview';
    case 'partner':
      // A client partner has no /app shell; their receivables page is their home.
      return '/receivables';
  }
}

/** The receivables manager area, which lives outside /app. */
const RECEIVABLES_MANAGER_NEXT = /^\/receivables\/manager(\/[A-Za-z0-9/_-]*)?$/;

/** A shared receivables view, `/receivables/s/<token>` (Phase 10); staff and partners may both open one. */
const RECEIVABLES_SHARE_NEXT = /^\/receivables\/s\/[A-Za-z0-9_-]{16,64}$/;

/**
 * The client partner pages: `/receivables` and its sub-pages, with an optional plain query such as
 * the `?invoice=<id>` of a reminder email. The manager area and the partner login page are not
 * partner destinations, and `//` never matches, so another host cannot be reached.
 */
const RECEIVABLES_PARTNER_NEXT =
  /^\/receivables(?!\/(manager|login)(\/|\?|$))(\/[A-Za-z0-9_-]+)*(\?[A-Za-z0-9=&_.%-]*)?$/;

/**
 * Where to go after sign-in when the login page was opened with `?next=`. Staff are sent back to
 * the receivables manager area or a shared view (both live outside /app, so the role home would
 * lose them). A client
 * partner is sent back to the partner page they asked for and otherwise lands on `/receivables`,
 * never on /app. Anything else, including other sites and `//host` tricks, falls back to the
 * role home.
 */
export function postLoginPath(role: Role, next: string | null | undefined): string {
  if (role === 'partner') {
    return next && RECEIVABLES_PARTNER_NEXT.test(next) ? next : roleHomePath(role);
  }
  if (next && (RECEIVABLES_MANAGER_NEXT.test(next) || RECEIVABLES_SHARE_NEXT.test(next))) return next;
  return roleHomePath(role);
}

/** Per-user notification history (dismissed + current). */
export function roleNotificationsPath(role: Role): string {
  switch (role) {
    case 'super_admin':
      return '/app/super/notifications';
    case 'admin':
      return '/app/admin/notifications';
    case 'manager':
      return '/app/manager/notifications';
    case 'intern':
      return '/app/intern/notifications';
    case 'client':
      return '/app/client/notifications';
    case 'developer':
      return '/app/dev/overview';
    case 'partner':
      // A client partner has no notification history page; the receivables page is all they see.
      return '/receivables';
  }
}

/** Account / profile settings for the signed-in role’s shell. */
export function roleSettingsPath(role: Role): string {
  switch (role) {
    case 'super_admin':
      // The super settings page opens on the firm tab; the account row wants the profile.
      return '/app/super/settings?tab=profile';
    case 'admin':
      return '/app/admin/settings';
    case 'manager':
      return '/app/manager/settings';
    case 'intern':
      return '/app/intern/settings';
    case 'client':
      return '/app/client/settings';
    case 'developer':
      return '/app/dev/overview';
    case 'partner':
      return '/receivables/account';
  }
}

/**
 * The profile page the account row opens (P-608, P-644, P-258). Every role has its own
 * `/app/<role>/profile` (super admin: `/app/super/profile`, developer: `/app/dev/profile`). Links that
 * point at a settings section (`#email`, `#appearance`, notification preferences, the Outlook
 * callback) keep `roleSettingsPath`. A client partner's account page is `/receivables/account`.
 */
export function roleProfilePath(role: Role): string {
  if (role === 'admin' || role === 'manager' || role === 'intern') return `/app/${role}/profile`;
  if (role === 'super_admin') return '/app/super/profile';
  if (role === 'client') return '/app/client/profile';
  if (role === 'developer') return '/app/dev/profile';
  return roleSettingsPath(role);
}

/**
 * The role a `/app/<segment>/…` pathname belongs to.
 *
 * Lets shell chrome resolve role-scoped links from the URL rather than from the
 * app context, so a component can be rendered (and tested) outside a provider.
 */
export function roleFromAppPathname(pathname: string): Role | null {
  switch (pathname.split('/').filter(Boolean)[1]) {
    case 'super':
      return 'super_admin';
    case 'admin':
      return 'admin';
    case 'manager':
      return 'manager';
    case 'intern':
      return 'intern';
    case 'client':
      return 'client';
    default:
      return null;
  }
}

/** Shell base path for firm admin vs project manager. */
export type StaffBasePath = '/app/admin' | '/app/manager' | '/app/super';

export function staffBasePathForRole(role: Role | undefined): StaffBasePath {
  if (role === 'super_admin') return '/app/super';
  if (role === 'admin') return '/app/admin';
  return '/app/manager';
}

/**
 * The full Ask VCFO page of a role (owner item F4, 30 Oct 2026): `/app/<role>/ask`.
 * Null for the developer, who has no Ask VCFO (`canUseAsk`).
 */
export function roleAskPath(role: Role | null | undefined): string | null {
  switch (role) {
    case 'super_admin':
      return '/app/super/ask';
    case 'admin':
    case 'manager':
    case 'intern':
    case 'client':
      return `/app/${role}/ask`;
    default:
      return null;
  }
}
