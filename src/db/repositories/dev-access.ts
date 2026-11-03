import 'server-only';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { userSessions } from '@/db/schema-firm';
import type { AuthContext } from '@/auth/guards';
import type { AccessPayload, DevSessionRow, StaffAccessRow } from '@/lib/dev/types';
import { recordAuditEvent } from './audit-events';
import { SESSION_MAX_AGE_MS } from './user-sessions';
import { DEV_STAFF_ROLES, assertDeveloper } from './dev-scope';

/**
 * DEV ACCESS — who can sign in, with what role, two-step state and open sessions (G-01).
 *
 * Access: developer or super admin only. Staff (super admin, admin, manager, project lead,
 * developer) are listed by name and email. Client accounts are never listed: they come back
 * only as counts. Password hashes and two-step secrets are never selected.
 */
export async function getAccessForDev(ctx: AuthContext): Promise<AccessPayload> {
  assertDeveloper(ctx);

  const activeSessions = db
    .select({ userId: userSessions.userId, n: sql<number>`count(*)::int`.as('n') })
    .from(userSessions)
    .where(isNull(userSessions.revokedAt))
    .groupBy(userSessions.userId)
    .as('active_sessions');

  const [staffRows, roleRows, clientRows] = await Promise.all([
    db
      .select({
        id: profiles.id,
        name: profiles.name,
        email: profiles.email,
        role: profiles.role,
        status: profiles.status,
        lastSeenAt: profiles.lastSeenAt,
        totpEnabledAt: profiles.totpEnabledAt,
        sessions: activeSessions.n,
      })
      .from(profiles)
      .leftJoin(activeSessions, eq(activeSessions.userId, profiles.id))
      .where(inArray(profiles.role, [...DEV_STAFF_ROLES]))
      .orderBy(asc(profiles.role), asc(profiles.name))
      .limit(1000),
    db
      .select({ role: profiles.role, n: sql<number>`count(*)::int` })
      .from(profiles)
      .where(eq(profiles.status, 'active'))
      .groupBy(profiles.role),
    db
      .select({
        active: sql<number>`count(*) filter (where ${profiles.status} = 'active')::int`,
        inactive: sql<number>`count(*) filter (where ${profiles.status} <> 'active')::int`,
        twoStep: sql<number>`count(*) filter (where ${profiles.totpEnabledAt} is not null)::int`,
        sessions: sql<number>`coalesce(sum(${activeSessions.n}), 0)::int`,
      })
      .from(profiles)
      .leftJoin(activeSessions, eq(activeSessions.userId, profiles.id))
      .where(eq(profiles.role, 'client')),
  ]);

  const staff: StaffAccessRow[] = staffRows.map((r) => ({
    id: r.id,
    name: r.name?.trim() || r.email.split('@')[0],
    email: r.email,
    role: r.role,
    status: r.status,
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    twoStep: r.totpEnabledAt !== null,
    activeSessions: Number(r.sessions ?? 0),
  }));

  const c = clientRows[0];
  return {
    staff,
    clients: {
      active: Number(c?.active ?? 0),
      inactive: Number(c?.inactive ?? 0),
      twoStep: Number(c?.twoStep ?? 0),
      activeSessions: Number(c?.sessions ?? 0),
    },
    roles: roleRows.map((r) => ({ role: r.role, people: Number(r.n) || 0 })),
  };
}

/** Staff with at least one open session, for the overview tile. */
export async function countSignedInStaffForDev(ctx: AuthContext): Promise<number> {
  assertDeveloper(ctx);
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${userSessions.userId})::int` })
    .from(userSessions)
    .innerJoin(profiles, eq(profiles.id, userSessions.userId))
    .where(and(isNull(userSessions.revokedAt), inArray(profiles.role, [...DEV_STAFF_ROLES])));
  return Number(row?.n ?? 0);
}

/** The address domain of the seeded demo logins (`npm run db:seed`). */
const DEMO_LOGIN_DOMAIN = 'vcfo.local';

/**
 * Seeded demo logins that can still sign in (active profiles on the demo domain), for the
 * overview's "Secrets to fix" tile and the "purge before real users" row. Counted only.
 */
export async function countDemoLoginsForDev(ctx: AuthContext): Promise<number> {
  assertDeveloper(ctx);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(profiles)
    .where(and(eq(profiles.status, 'active'), ilike(profiles.email, `%@${DEMO_LOGIN_DOMAIN}`)));
  return Number(row?.n ?? 0);
}


/** "203.0.113.7" becomes "203.0.x.x"; an IPv6 address keeps its first two groups. */
export function maskIp(ip: string | null | undefined): string | null {
  const v = (ip ?? '').split(',')[0].trim();
  if (!v) return null;
  if (v.includes('.')) {
    const p = v.split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.x.x` : 'x.x.x.x';
  }
  const g = v.split(':').filter(Boolean);
  return `${g.slice(0, 2).join(':')}:…`;
}

/**
 * Staff devices signed in now (not revoked, inside the 30-day session life), newest activity
 * first. Client sessions are not listed: they are counted on the Client accounts card.
 */
export async function listSessionsForDev(ctx: AuthContext, now = new Date()): Promise<DevSessionRow[]> {
  assertDeveloper(ctx);
  const since = new Date(now.getTime() - SESSION_MAX_AGE_MS);
  const rows = await db
    .select({
      id: userSessions.id,
      userAgent: userSessions.userAgent,
      ip: userSessions.ip,
      createdAt: userSessions.createdAt,
      lastSeenAt: userSessions.lastSeenAt,
      name: profiles.name,
      email: profiles.email,
      role: profiles.role,
    })
    .from(userSessions)
    .innerJoin(profiles, eq(profiles.id, userSessions.userId))
    .where(and(isNull(userSessions.revokedAt), gt(userSessions.createdAt, since), inArray(profiles.role, [...DEV_STAFF_ROLES])))
    .orderBy(desc(userSessions.lastSeenAt))
    .limit(300);
  return rows.map((r) => ({
    id: r.id,
    person: r.name?.trim() || r.email.split('@')[0],
    role: r.role,
    userAgent: r.userAgent,
    ip: maskIp(r.ip),
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    current: Boolean(ctx.sessionId) && r.id === ctx.sessionId,
  }));
}

/**
 * Sign out one staff device from the console (R-40). Refuses the caller's own current device
 * (they use Sign out for that) and any client session. Writes `dev.session.revoke`.
 * Returns the person's name, or null when there is no such open staff session.
 */
export async function revokeSessionForDev(ctx: AuthContext, sessionId: string): Promise<{ person: string } | null> {
  assertDeveloper(ctx);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || sessionId === ctx.sessionId) return null;
  const [row] = await db
    .select({ id: userSessions.id, name: profiles.name, email: profiles.email, role: profiles.role })
    .from(userSessions)
    .innerJoin(profiles, eq(profiles.id, userSessions.userId))
    .where(and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt), inArray(profiles.role, [...DEV_STAFF_ROLES])))
    .limit(1);
  if (!row) return null;
  const done = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id });
  if (done.length === 0) return null;
  const person = row.name?.trim() || row.email.split('@')[0];
  await recordAuditEvent(ctx, {
    action: 'dev.session.revoke',
    summary: `Signed out a device of ${person}`,
    metadata: { sessionId, before: 'Signed in', after: 'Signed out' },
  });
  return { person };
}

/**
 * How people signed in over the last 30 days: people with a session started in the window,
 * split by whether their account asks for the two-step code. Every sign-in uses a password,
 * so the two methods are "Password and code" and "Password only". Staff and clients both.
 */
export async function signInMethodsForDev(ctx: AuthContext, now = new Date()): Promise<{ twoStep: number; passwordOnly: number }> {
  assertDeveloper(ctx);
  const since = new Date(now.getTime() - 30 * 86400000);
  const [row] = await db
    .select({
      twoStep: sql<number>`count(distinct ${profiles.id}) filter (where ${profiles.totpEnabledAt} is not null)::int`,
      passwordOnly: sql<number>`count(distinct ${profiles.id}) filter (where ${profiles.totpEnabledAt} is null)::int`,
    })
    .from(userSessions)
    .innerJoin(profiles, eq(profiles.id, userSessions.userId))
    .where(gt(userSessions.createdAt, since));
  return { twoStep: Number(row?.twoStep ?? 0), passwordOnly: Number(row?.passwordOnly ?? 0) };
}

/**
 * "Purge demo logins" (R-40): every active profile on the seeded demo domain becomes
 * inactive and its open sessions are signed out, so the seeded passwords stop working. The
 * caller's own account is left on. Nothing is deleted; an admin can turn an account back on. Writes `dev.demo.purge`.
 */
export async function purgeDemoLoginsForDev(ctx: AuthContext): Promise<{ accounts: number }> {
  assertDeveloper(ctx);
  const ids = await db
    .update(profiles)
    .set({ status: 'inactive' })
    // The caller's own account stays on, so the console is not locked out mid-purge.
    .where(and(eq(profiles.status, 'active'), ilike(profiles.email, `%@${DEMO_LOGIN_DOMAIN}`), sql`${profiles.id} <> ${ctx.userId}`))
    .returning({ id: profiles.id });
  const list = ids.map((r) => r.id);
  if (list.length) {
    await db.update(userSessions).set({ revokedAt: new Date() }).where(and(inArray(userSessions.userId, list), isNull(userSessions.revokedAt)));
  }
  await recordAuditEvent(ctx, {
    action: 'dev.demo.purge',
    summary: `Turned off ${ids.length} demo logins`,
    metadata: { accounts: ids.length, before: `${ids.length} active`, after: '0 active' },
  });
  return { accounts: ids.length };
}
