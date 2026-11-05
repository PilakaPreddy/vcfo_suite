import 'server-only';
import { auth } from './config';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { isFirmWideAdmin, isValidDbRole } from '@/lib/auth';
import { systemIsSessionActive, systemTouchLastSeen } from '@/db/repositories/user-sessions';

/**
 * Role guards for API routes and server actions.
 *
 * Roles (DB + session):
 *   - super_admin = bird's-eye (firm + client)
 *   - admin       = firm Admin (all engagements)
 *   - manager     = Project Manager (scoped by engagements.manager_id)
 *   - intern      = Project Lead
 *   - client      = client portal user
 *   - developer   = developer console only; every guard except
 *                   `requireDeveloper` refuses it, so no repository ever runs
 *                   for a developer (G-01)
 *
 * Tenant scoping lives in repositories (Path A), not RLS.
 *
 * Role/scoping ids are re-read from `profiles` on each request so a stale JWT
 * (or Auth.js dropping custom credential fields) cannot block client submits.
 *
 * Sessions (G-25): the JWT carries `sid`, the id of the `user_sessions` row made
 * at sign-in. A request whose row is revoked (Profile › "Sign out" on a device,
 * or "Sign out everywhere else") gets no context. A token without `sid`, issued
 * before devices were tracked, keeps working until it expires. Each request
 * also writes `last_seen_at` on the profile and the device, at most every five
 * minutes. None of this runs in the edge proxy, which never touches the database.
 */

export type AppRole = 'super_admin' | 'admin' | 'manager' | 'intern' | 'client' | 'developer' | 'partner';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  role: AppRole;
  /** Scoping key for interns (was my_intern_id() in RLS). */
  internId?: string;
  /** Scoping key for clients (was my_client_id() in RLS). */
  clientId?: string;
  /** The `user_sessions` row of this device; absent on tokens issued before G-25. */
  sessionId?: string;
}

type Ok = { ok: true; ctx: AuthContext };
type Err = { ok: false; status: 401 | 403; error: string };
export type GuardResult = Ok | Err;

/*
 * One page load fires about ten API calls at once, and each guard read the profile row and the
 * session row again (finding 14 of the 2026-11-04 audit). The lookup is shared for a few seconds
 * per person and device, so those calls cost one pair of queries. The promise itself is kept, so
 * calls that arrive together wait on the same queries.
 * shortcut: a disabled person or a revoked device is let in for up to LOOKUP_TTL_MS more; drop
 * the memo if instant revocation is ever required.
 */
const LOOKUP_TTL_MS = 3_000;
type PersonLookup = {
  row: { id: string; email: string; name: string | null; role: string; internId: string | null; clientId: string | null; status: string } | undefined;
  sessionActive: boolean;
};
const lookups = new Map<string, { at: number; value: Promise<PersonLookup> }>();

function lookupPerson(userId: string, sid: string | undefined): Promise<PersonLookup> {
  const key = `${userId}:${sid ?? ''}`;
  const now = Date.now();
  const hit = lookups.get(key);
  if (hit && now - hit.at < LOOKUP_TTL_MS) return hit.value;
  if (lookups.size > 1000) {
    for (const [k, v] of lookups) if (now - v.at >= LOOKUP_TTL_MS) lookups.delete(k);
  }
  const value = Promise.all([
    db
      .select({
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        role: profiles.role,
        internId: profiles.internId,
        clientId: profiles.clientId,
        status: profiles.status,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    sid ? systemIsSessionActive(sid, userId) : Promise.resolve(true),
  ]).then(([[row], sessionActive]) => ({ row, sessionActive }));
  lookups.set(key, { at: now, value });
  // A failed lookup is not kept, so the next call tries again.
  value.catch(() => lookups.delete(key));
  return value;
}

/** Forget every shared lookup (tests, and anything that must see a change at once). */
export function clearGuardLookups(): void {
  lookups.clear();
}

/**
 * The signed-in person, or null. A developer gets null here unless the caller is
 * `requireDeveloper`, and a client partner unless the caller is `requirePartner` (or their own
 * account), because the repositories were written for the five firm and client roles and some
 * treat an unknown role as firm-wide.
 */
async function currentContext(opts: { allowDeveloper?: boolean; allowPartner?: boolean } = {}): Promise<AuthContext | null> {
  const session = await auth();
  const u = session?.user as
    | {
        id?: string;
        email?: string;
        name?: string;
        role?: string;
        internId?: string;
        clientId?: string;
        sid?: string;
      }
    | undefined;
  if (!u?.id) return null;
  const sid = typeof u.sid === 'string' && u.sid ? u.sid : undefined;

  // Prefer live profile row over JWT custom claims (source of truth).
  const { row, sessionActive } = await lookupPerson(u.id, sid);

  if (!sessionActive) return null;
  if (!row || row.status !== 'active') return null;
  if (!isValidDbRole(row.role)) return null;
  if (row.role === 'intern' && !row.internId?.trim()) return null;
  if (row.role === 'developer' && !opts.allowDeveloper) return null;
  if (row.role === 'partner' && !opts.allowPartner) return null;

  // Throttled inside and never throws, so it does not hold up the request.
  void systemTouchLastSeen(row.id, sid);

  return {
    userId: row.id,
    email: row.email ?? u.email ?? '',
    name: row.name?.trim() || u.name || row.email.split('@')[0] || 'User',
    role: row.role,
    internId: row.internId ?? undefined,
    clientId: row.clientId ?? undefined,
    sessionId: sid,
  };
}

/** Any authenticated user. */
export async function requireAuth(): Promise<GuardResult> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false, status: 401, error: 'Not authenticated' };
  return { ok: true, ctx };
}

/** Require a specific role. */
export async function requireRole(role: AppRole): Promise<GuardResult> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false, status: 401, error: 'Not authenticated' };
  if (ctx.role !== role && !(role === 'admin' && ctx.role === 'super_admin')) {
    return { ok: false, status: 403, error: `Requires ${role} role` };
  }
  return { ok: true, ctx };
}

/** Firm Admin or Super Admin. */
export async function requireAdmin(): Promise<GuardResult> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false, status: 401, error: 'Not authenticated' };
  if (!isFirmWideAdmin(ctx.role)) {
    return { ok: false, status: 403, error: 'Requires admin role' };
  }
  return { ok: true, ctx };
}

/** Firm Admin, Super Admin, or Project Manager. */
export async function requireAdminOrManager(): Promise<GuardResult> {
  return requireAnyRole('super_admin', 'admin', 'manager');
}

/** Super Admin only. */
export async function requireSuperAdmin(): Promise<GuardResult> {
  return requireRole('super_admin');
}

/** One of several roles. Super Admin satisfies `admin` the same way `requireRole('admin')` does. */
export async function requireAnyRole(...roles: AppRole[]): Promise<GuardResult> {
  const ctx = await currentContext();
  if (!ctx) return { ok: false, status: 401, error: 'Not authenticated' };
  if (roles.includes(ctx.role)) return { ok: true, ctx };
  if (ctx.role === 'super_admin' && roles.includes('admin')) return { ok: true, ctx };
  return { ok: false, status: 403, error: `Requires one of: ${roles.join(', ')}` };
}

/**
 * Any signed-in person, developers included. Only for routes that touch the
 * caller's own account (devices, two-step sign-in, notification preferences)
 * and never reach a tenant-scoped repository.
 */
export async function requireOwnAccount(): Promise<GuardResult> {
  const ctx = await currentContext({ allowDeveloper: true, allowPartner: true });
  if (!ctx) return { ok: false, status: 401, error: 'Not authenticated' };
  return { ok: true, ctx };
}

/**
 * The signed-in person of any role, or null when signed out. Only for a page or route whose own
 * rule decides who may see it without a tenant-scoped repository: the shared receivables views,
 * where `systemOpenShareLink` applies the link's visibility rule to this viewer.
 */
export async function optionalViewer(): Promise<AuthContext | null> {
  return currentContext({ allowDeveloper: true, allowPartner: true });
}

/** The receivables client partner pages (/receivables): a signed-in `partner` only. */
export async function requirePartner(): Promise<GuardResult> {
  const ctx = await currentContext({ allowPartner: true });
  if (!ctx) return { ok: false, status: 401, error: 'Not authenticated' };
  if (ctx.role !== 'partner') return { ok: false, status: 403, error: 'Requires a client partner login' };
  return { ok: true, ctx };
}

/** Developer console: a developer or the super admin. */
export async function requireDeveloper(): Promise<GuardResult> {
  const ctx = await currentContext({ allowDeveloper: true });
  if (!ctx) return { ok: false, status: 401, error: 'Not authenticated' };
  if (ctx.role !== 'developer' && ctx.role !== 'super_admin') {
    return { ok: false, status: 403, error: 'Requires developer role' };
  }
  return { ok: true, ctx };
}

/**
 * Developer console reads (`devRoute`, GET only): the signed-in developer as above, or, when
 * there is no session, a personal API token sent as `Authorization: Bearer vcfo_dev_…`. The
 * token is looked up by its SHA-256 hash and acts as the developer who made it, only while
 * that person is active and still a developer or super admin. Writes (`devAction`) never
 * accept a token.
 */
export async function requireDeveloperOrToken(request: Request): Promise<GuardResult> {
  const session = await requireDeveloper();
  if (session.ok === true || session.status !== 401) return session;
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) return session;
  const { systemResolveDevToken } = await import('@/db/repositories/dev-tokens');
  const ctx = await systemResolveDevToken(m[1]);
  if (!ctx) return { ok: false, status: 401, error: 'Not authenticated' };
  return { ok: true, ctx };
}
