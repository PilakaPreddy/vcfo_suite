import 'server-only';

import { and, desc, eq, gt, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, userSessions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { isUuid } from '@/lib/slug';

/**
 * USER SESSIONS — one row per signed-in device (G-25).
 *
 * The sign-in creates the row and the JWT carries its id as `sid`. A revoked
 * row signs that device out: `currentContext` and the Node JWT callback both
 * refuse it. Tokens issued before this change have no `sid` and keep working
 * until they expire.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Owner only. Every read and write that takes an AuthContext is keyed by
 * `ctx.userId`; a person can list and revoke only their own devices.
 *
 * The `system*` functions are the documented deviation for the auth layer:
 * they run inside sign-in and the session check, before an AuthContext exists,
 * and each one is keyed by the session id AND the user id from the signed JWT.
 */

/** Matches the Auth.js session lifetime (30 days); older rows are expired tokens, not devices. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** `last_seen_at` is written at most this often per device and per person. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type UserSessionRow = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  /** Sign-in city from the CDN geo headers; null when none came (C-851). */
  city: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

function clip(value: string | null | undefined, max: number): string | null {
  const v = (value ?? '').trim();
  return v ? v.slice(0, max) : null;
}

/** SYSTEM WRITER — Credentials `authorize`, after the password (and code) were accepted. */
export async function systemCreateUserSession(input: {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
  city?: string | null;
}): Promise<string | null> {
  if (!isUuid(input.userId)) return null;
  try {
    const [row] = await db
      .insert(userSessions)
      .values({
        userId: input.userId,
        userAgent: clip(input.userAgent, 400),
        ip: clip(input.ip, 64),
        city: clip(input.city, 80),
      })
      .returning({ id: userSessions.id });
    return row?.id ?? null;
  } catch (err) {
    // A missing row must not block sign-in; the token then has no `sid`.
    console.error('[user-sessions] create failed', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * SYSTEM READER — the session check. True when the row exists, belongs to this
 * person and is not revoked. A malformed id counts as revoked.
 */
export async function systemIsSessionActive(sid: string, userId: string): Promise<boolean> {
  if (!isUuid(sid) || !isUuid(userId)) return false;
  const [row] = await db
    .select({ id: userSessions.id })
    .from(userSessions)
    .where(and(eq(userSessions.id, sid), eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
    .limit(1);
  return Boolean(row);
}

const lastTouch = new Map<string, number>();

/**
 * SYSTEM WRITER — last seen. Writes `user_sessions.last_seen_at` (when there is
 * a `sid`) and `profiles.last_seen_at` at most every five minutes. An
 * in-process map skips the round trip between writes, and the SQL condition
 * keeps several instances from writing more often than that. Never throws.
 * `profiles.updated_at` is left alone because the avatar version is read from it.
 */
export async function systemTouchLastSeen(userId: string, sid?: string | null, now = new Date()): Promise<void> {
  if (!isUuid(userId)) return;
  const key = `${userId}:${sid ?? ''}`;
  const prev = lastTouch.get(key);
  if (prev !== undefined && now.getTime() - prev < LAST_SEEN_THROTTLE_MS) return;
  lastTouch.set(key, now.getTime());
  const cutoff = new Date(now.getTime() - LAST_SEEN_THROTTLE_MS);
  try {
    await db
      .update(profiles)
      .set({ lastSeenAt: now })
      .where(and(eq(profiles.id, userId), or(isNull(profiles.lastSeenAt), lt(profiles.lastSeenAt, cutoff))));
    if (sid && isUuid(sid)) {
      await db
        .update(userSessions)
        .set({ lastSeenAt: now })
        .where(and(eq(userSessions.id, sid), eq(userSessions.userId, userId), lt(userSessions.lastSeenAt, cutoff)));
    }
  } catch (err) {
    console.warn('[user-sessions] last seen write failed', err instanceof Error ? err.message : err);
  }
}

/** SYSTEM WRITER — Auth.js `signOut` event: the device that signed out is revoked. */
export async function systemRevokeSession(sid: string, userId: string): Promise<void> {
  if (!isUuid(sid) || !isUuid(userId)) return;
  try {
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(userSessions.id, sid), eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
  } catch (err) {
    console.warn('[user-sessions] revoke on sign-out failed', err instanceof Error ? err.message : err);
  }
}

/** The caller's signed-in devices, newest activity first. Expired and revoked rows are left out. */
export async function listOwnSessions(ctx: AuthContext, now = new Date()): Promise<UserSessionRow[]> {
  const since = new Date(now.getTime() - SESSION_MAX_AGE_MS);
  const rows = await db
    .select({
      id: userSessions.id,
      userAgent: userSessions.userAgent,
      ip: userSessions.ip,
      city: userSessions.city,
      createdAt: userSessions.createdAt,
      lastSeenAt: userSessions.lastSeenAt,
    })
    .from(userSessions)
    .where(and(eq(userSessions.userId, ctx.userId), isNull(userSessions.revokedAt), gt(userSessions.createdAt, since)))
    .orderBy(desc(userSessions.lastSeenAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.userAgent,
    ip: r.ip,
    city: r.city ?? null,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    current: Boolean(ctx.sessionId) && r.id === ctx.sessionId,
  }));
}

/** Signs out one of the caller's own devices. Returns false when no such active row is theirs. */
export async function revokeOwnSession(ctx: AuthContext, sessionId: string): Promise<boolean> {
  if (!isUuid(sessionId)) return false;
  const rows = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, ctx.userId), isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id });
  if (rows.length === 0) return false;
  await recordAuditEvent(ctx, {
    action: 'account.session_revoked',
    summary: sessionId === ctx.sessionId ? 'Signed out this device' : 'Signed out a device',
    metadata: { sessionId },
  });
  return true;
}

/** Signs out every other device of the caller. The current device stays signed in. */
export async function revokeOwnOtherSessions(ctx: AuthContext): Promise<number> {
  const conditions = [eq(userSessions.userId, ctx.userId), isNull(userSessions.revokedAt)];
  if (ctx.sessionId) conditions.push(ne(userSessions.id, ctx.sessionId));
  const rows = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: userSessions.id });
  await recordAuditEvent(ctx, {
    action: 'account.sessions_revoked',
    summary: `Signed out everywhere else (${rows.length} ${rows.length === 1 ? 'device' : 'devices'})`,
    metadata: { count: rows.length },
  });
  return rows.length;
}

/** Test helper: forget the in-process last-seen throttle. */
export function resetLastSeenThrottle(): void {
  lastTouch.clear();
}
