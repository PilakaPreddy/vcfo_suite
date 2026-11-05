import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { devApiTokens } from '@/db/schema-firm';
import type { AuthContext } from '@/auth/guards';
import type { DevTokenRow } from '@/lib/dev/types';
import { recordAuditEvent } from './audit-events';
import { assertDeveloper } from './dev-scope';

/**
 * DEV TOKENS — personal API tokens for the developer console (`dev_api_tokens`).
 *
 * Access: developer or super admin make, list, rotate and revoke (`*ForDev`, audited as
 * `dev.token.*`). `systemResolveDevToken` is the one reader without an AuthContext: the guard
 * uses it to turn a bearer token into its maker's context, and it answers only for a live
 * token whose maker is still an active developer or super admin. Only the SHA-256 hash is
 * stored; the token is returned once, when it is made.
 */

export const TOKEN_PREFIX = 'vcfo_dev_';
/** How long the old token keeps working after "Rotate". */
const ROTATE_GRACE_MS = 24 * 3600000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export async function listDevTokensForDev(ctx: AuthContext, now = new Date()): Promise<DevTokenRow[]> {
  assertDeveloper(ctx);
  const rows = await db
    .select({
      id: devApiTokens.id,
      name: devApiTokens.name,
      prefix: devApiTokens.prefix,
      createdAt: devApiTokens.createdAt,
      expiresAt: devApiTokens.expiresAt,
      lastUsedAt: devApiTokens.lastUsedAt,
      revokedAt: devApiTokens.revokedAt,
      by: profiles.name,
      email: profiles.email,
    })
    .from(devApiTokens)
    .leftJoin(profiles, eq(profiles.id, devApiTokens.createdBy))
    .orderBy(desc(devApiTokens.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    by: r.by?.trim() || r.email?.split('@')[0] || 'Staff',
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    status: r.revokedAt ? 'revoked' : r.expiresAt.getTime() <= now.getTime() ? 'expired' : 'active',
  }));
}

/** Make a token for the caller. Returns the token once. */
export async function createDevTokenForDev(ctx: AuthContext, input: { name: string; days: number }, now = new Date()): Promise<{ id: string; token: string }> {
  assertDeveloper(ctx);
  const token = newToken();
  const expiresAt = new Date(now.getTime() + input.days * 86400000);
  const [row] = await db
    .insert(devApiTokens)
    .values({ name: input.name, tokenHash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 4), createdBy: ctx.userId, createdAt: now, expiresAt })
    .returning({ id: devApiTokens.id });
  await recordAuditEvent(ctx, {
    action: 'dev.token.create',
    summary: `API token "${input.name}" made`,
    metadata: { tokenId: row?.id, before: 'None', after: `Works until ${expiresAt.toISOString().slice(0, 10)}` },
  });
  return { id: row?.id ?? '', token };
}

/** Revoke one live token. Returns false when it is already revoked or gone. */
export async function revokeDevTokenForDev(ctx: AuthContext, id: string): Promise<boolean> {
  assertDeveloper(ctx);
  const done = await db
    .update(devApiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(devApiTokens.id, id), isNull(devApiTokens.revokedAt)))
    .returning({ id: devApiTokens.id, name: devApiTokens.name });
  if (!done.length) return false;
  await recordAuditEvent(ctx, {
    action: 'dev.token.revoke',
    summary: `API token "${done[0].name}" revoked`,
    metadata: { tokenId: id, before: 'Active', after: 'Revoked' },
  });
  return true;
}

/**
 * "Rotate": make a new token with the same name and life, and let the old one work for 24
 * more hours (or until its own expiry, if sooner). Returns the new token once.
 */
export async function rotateDevTokenForDev(ctx: AuthContext, id: string, now = new Date()): Promise<{ id: string; token: string } | null> {
  assertDeveloper(ctx);
  const [old] = await db
    .select({ id: devApiTokens.id, name: devApiTokens.name, createdAt: devApiTokens.createdAt, expiresAt: devApiTokens.expiresAt })
    .from(devApiTokens)
    .where(and(eq(devApiTokens.id, id), isNull(devApiTokens.revokedAt), gt(devApiTokens.expiresAt, now)))
    .limit(1);
  if (!old) return null;
  const days = Math.max(1, Math.round((old.expiresAt.getTime() - old.createdAt.getTime()) / 86400000));
  const graceEnd = new Date(Math.min(old.expiresAt.getTime(), now.getTime() + ROTATE_GRACE_MS));
  await db.update(devApiTokens).set({ expiresAt: graceEnd }).where(eq(devApiTokens.id, id));
  const token = newToken();
  const [row] = await db
    .insert(devApiTokens)
    .values({ name: old.name, tokenHash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 4), createdBy: ctx.userId, createdAt: now, expiresAt: new Date(now.getTime() + days * 86400000) })
    .returning({ id: devApiTokens.id });
  await recordAuditEvent(ctx, {
    action: 'dev.token.rotate',
    summary: `API token "${old.name}" rotated`,
    metadata: { tokenId: id, newTokenId: row?.id, before: 'Old token', after: `New token; old one works until ${graceEnd.toISOString()}` },
  });
  return { id: row?.id ?? '', token };
}

/**
 * SYSTEM READER — for `requireDeveloperOrToken` only. The maker's context for a live token, or
 * null. The maker must still be active and a developer or super admin. Writes last_used_at.
 */
export async function systemResolveDevToken(token: string, now = new Date()): Promise<AuthContext | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const [row] = await db
    .select({
      id: devApiTokens.id,
      userId: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      status: profiles.status,
    })
    .from(devApiTokens)
    .innerJoin(profiles, eq(profiles.id, devApiTokens.createdBy))
    .where(and(eq(devApiTokens.tokenHash, hashToken(token)), isNull(devApiTokens.revokedAt), gt(devApiTokens.expiresAt, now)))
    .limit(1);
  if (!row || row.status !== 'active' || (row.role !== 'developer' && row.role !== 'super_admin')) return null;
  await db.update(devApiTokens).set({ lastUsedAt: now }).where(eq(devApiTokens.id, row.id));
  return { userId: row.userId, email: row.email, name: row.name ?? '', role: row.role };
}
