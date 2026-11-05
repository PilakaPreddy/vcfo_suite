import 'server-only';

import { createHash } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/db/client';
import { clientInvites, engagementClients, engagements, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { assertEngagementAccess, getMyEngagement } from '@/db/repositories/engagements';
import {
  inviteEngagementClient,
  isPrimaryClient,
  listEngagementClients,
} from '@/db/repositories/engagement-clients';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';

/**
 * CLIENT TEAM REPOSITORY (client portal v7 — Team page).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   read    — a client sees the people + pending invites of THEIR OWN engagement
 *             only (`getMyEngagement` + `assertEngagementAccess`); an engagement
 *             id a client passes is ignored. Staff read the same view for an
 *             engagement they name that passes `assertEngagementAccess`, so they
 *             can see the client's Team page; they are never Primary.
 *   invite / resend / cancel / restore — the engagement's Primary contact only
 *             (`isPrimaryClient`, owner decision "only the Primary contact can
 *             invite"). `inviteEngagementClient` enforces the same rule again.
 *   An invite id is always re-checked against the caller's engagement, so ids
 *   from another tenant resolve to "not found".
 */

/** C-899: a set-password link works for seven days. */
export const SET_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The stored form of a set-password link token (the raw token only travels in the link). */
export function hashSetPasswordToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

/** A link token the browser made: 32 to 128 URL-safe characters. */
function validToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(token.trim());
}

function tokenColumns(token: string | null | undefined, now: Date) {
  return validToken(token)
    ? { setPasswordTokenHash: hashSetPasswordToken(token), setPasswordExpiresAt: new Date(now.getTime() + SET_PASSWORD_TTL_MS) }
    : {};
}

export class ClientTeamError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

interface ClientTeamPerson {
  userId: string;
  name: string;
  email: string;
  role: 'primary' | 'member';
  /** Job title ("Director", "Finance"), from `profiles.designation` (C-888). */
  designation: string | null;
  since: string;
  you: boolean;
}

export interface ClientTeamInvite {
  id: string;
  name: string;
  email: string;
  sentAt: string;
  sendCount: number;
  designation: string | null;
}

export interface ClientTeamView {
  engagementId: string;
  isPrimary: boolean;
  people: ClientTeamPerson[];
  invites: ClientTeamInvite[];
}

async function myEngagement(ctx: AuthContext) {
  if (ctx.role !== 'client') throw new ClientTeamError('The Team page is for clients', 403);
  const mine = await getMyEngagement(ctx);
  if (!mine) throw new ClientTeamError('No engagement found', 404);
  const access = await assertEngagementAccess(ctx, mine.id);
  if (!access.ok) throw new ClientTeamError('No engagement found', 404);
  return { dbId: access.dbId, row: access.row };
}

/**
 * Designations of the given people. The ids always come from the caller's own
 * engagement (its members and invites), never from the request.
 */
async function designationsOf(ids: string[]): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: profiles.id, designation: profiles.designation }).from(profiles).where(inArray(profiles.id, ids));
  return new Map(rows.map((r) => [r.id, r.designation?.trim() || null]));
}

/** Pending invites; lazily stamps accepted ones (the invitee chose a password). */
async function pendingInvites(dbId: string): Promise<Array<typeof clientInvites.$inferSelect>> {
  const rows = await db
    .select({ inv: clientInvites, hash: profiles.passwordHash })
    .from(clientInvites)
    .leftJoin(profiles, eq(profiles.id, clientInvites.profileId))
    .where(and(eq(clientInvites.engagementId, dbId), isNull(clientInvites.acceptedAt), isNull(clientInvites.revokedAt)))
    .orderBy(desc(clientInvites.createdAt));
  const accepted: string[] = [];
  const pending: Array<typeof clientInvites.$inferSelect> = [];
  for (const r of rows) {
    if (!r.inv.tempPasswordHash || !r.inv.profileId || r.hash !== r.inv.tempPasswordHash) accepted.push(r.inv.id);
    else pending.push(r.inv);
  }
  if (accepted.length) {
    await db.update(clientInvites).set({ acceptedAt: new Date() }).where(inArray(clientInvites.id, accepted));
  }
  return pending;
}

/** Staff name the engagement; it must pass `assertEngagementAccess`. */
async function staffEngagement(ctx: AuthContext, engagementId: string | undefined) {
  if (!engagementId) throw new ClientTeamError('No engagement found', 404);
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) throw new ClientTeamError('No engagement found', 404);
  return { dbId: access.dbId, row: access.row };
}

export async function getClientTeam(ctx: AuthContext, engagementId?: string): Promise<ClientTeamView> {
  const isClient = ctx.role === 'client';
  const { dbId, row } = isClient ? await myEngagement(ctx) : await staffEngagement(ctx, engagementId);
  const [members, invites, isPrimary] = await Promise.all([
    listEngagementClients(ctx, dbId),
    pendingInvites(dbId),
    isClient ? isPrimaryClient(ctx.userId, dbId, row.clientUserId) : false,
  ]);
  const pendingIds = new Set(invites.map((i) => i.profileId));
  const titles = await designationsOf([...members.map((m) => m.userId), ...invites.map((i) => i.profileId).filter((x): x is string => Boolean(x))]);
  const people: ClientTeamPerson[] = members
    .filter((m) => !pendingIds.has(m.userId))
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.memberRole === 'owner' || m.userId === row.clientUserId ? 'primary' : 'member',
      designation: titles.get(m.userId) ?? null,
      since: m.createdAt,
      you: m.userId === ctx.userId,
    }));
  // Primary first, then by date (the board order).
  people.sort((a, b) => (a.role === b.role ? a.since.localeCompare(b.since) : a.role === 'primary' ? -1 : 1));
  return {
    engagementId: appEngagementId(dbId),
    isPrimary,
    people,
    invites: invites.map((i) => ({
      id: i.id,
      name: i.name?.trim() || i.email.split('@')[0] || i.email,
      email: i.email,
      sentAt: i.lastSentAt.toISOString(),
      sendCount: i.sendCount,
      designation: (i.profileId && titles.get(i.profileId)) || null,
    })),
  };
}

async function requirePrimary(ctx: AuthContext) {
  const eng = await myEngagement(ctx);
  if (!(await isPrimaryClient(ctx.userId, eng.dbId, eng.row.clientUserId))) {
    throw new ClientTeamError('Only the Primary contact can invite', 403);
  }
  return eng;
}

export interface CreatedClientInvite {
  invite: ClientTeamInvite;
  createdNewUser: boolean;
  name: string;
  email: string;
  companyName: string;
}

/** Primary only. Creates (or attaches) the client account and records the invite. */
export async function createClientInvite(
  ctx: AuthContext,
  input: { name: string; email: string; tempPassword: string; designation?: string | null; setPasswordToken?: string | null },
): Promise<CreatedClientInvite> {
  const { dbId, row } = await requirePrimary(ctx);
  // Security (client portal v7 review H1): from the client side an invite only
  // ever CREATES a new account. An email that already has any account (another
  // company's client, staff, a removed user) is refused with one generic
  // message, so a client can neither attach someone else's account to their
  // engagement, nor reactivate it, nor learn which kind of account it is.
  // Staff add existing people from the staff screens.
  const normalized = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, normalized))
    .limit(1);
  if (existing) {
    throw new ClientTeamError('This email can’t be invited from here. Ask your project manager to add this person.', 409);
  }
  let invited;
  try {
    invited = await inviteEngagementClient(ctx, {
      engagementId: dbId,
      email: input.email,
      fullName: input.name,
      password: input.tempPassword,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : 'invite_failed';
    if (m === 'already_a_member') throw new ClientTeamError('That person is already on this project.', 409);
    if (m === 'email_not_a_client') throw new ClientTeamError('That email belongs to a non-client account.', 409);
    if (m === 'invalid_email') throw new ClientTeamError('Enter a valid email address.');
    if (m === 'password_too_short') throw new ClientTeamError('The temporary password is too short.');
    if (m.includes('not permitted')) throw new ClientTeamError('Only the Primary contact can invite', 403);
    throw e;
  }
  const designation = input.designation?.trim().slice(0, 80) || null;
  if (designation && invited.createdNewUser) {
    // Only the account this invite just created; never an existing profile.
    await db.update(profiles).set({ designation, updatedAt: new Date() }).where(and(eq(profiles.id, invited.userId), eq(profiles.role, 'client')));
  }
  let tempHash: string | null = null;
  if (invited.createdNewUser) {
    const [p] = await db.select({ h: profiles.passwordHash }).from(profiles).where(eq(profiles.id, invited.userId)).limit(1);
    tempHash = p?.h ?? null;
  }
  const now = new Date();
  const [inv] = await db
    .insert(clientInvites)
    .values({
      engagementId: dbId,
      email: invited.email,
      name: input.name.trim() || invited.name,
      profileId: invited.userId,
      invitedBy: ctx.userId,
      tempPasswordHash: tempHash,
      // C-899: the set-password link, only for an account this invite created.
      ...(invited.createdNewUser ? tokenColumns(input.setPasswordToken, now) : {}),
      // an existing account was simply added: nothing to wait for
      acceptedAt: invited.createdNewUser ? null : now,
    })
    .returning();
  return {
    invite: {
      id: inv.id,
      name: inv.name ?? invited.name,
      email: inv.email,
      sentAt: inv.lastSentAt.toISOString(),
      sendCount: inv.sendCount,
      designation: invited.createdNewUser ? designation : null,
    },
    createdNewUser: invited.createdNewUser,
    name: invited.name,
    email: invited.email,
    companyName: row.companyName,
  };
}

async function ownInvite(ctx: AuthContext, inviteId: string) {
  const eng = await requirePrimary(ctx);
  if (!/^[0-9a-f-]{36}$/i.test(inviteId)) throw new ClientTeamError('Invite not found', 404);
  const [inv] = await db
    .select()
    .from(clientInvites)
    .where(and(eq(clientInvites.id, inviteId), eq(clientInvites.engagementId, eng.dbId)))
    .limit(1);
  if (!inv) throw new ClientTeamError('Invite not found', 404);
  return { eng, inv };
}

/** Primary only. New temporary password (only while the invitee has not chosen one). */
export async function resendClientInvite(
  ctx: AuthContext,
  inviteId: string,
  tempPassword: string,
  setPasswordToken?: string | null,
): Promise<{ invite: ClientTeamInvite; name: string; email: string; companyName: string }> {
  const { eng, inv } = await ownInvite(ctx, inviteId);
  if (inv.revokedAt || inv.acceptedAt || !inv.profileId) throw new ClientTeamError('This invite is no longer pending.', 409);
  if (tempPassword.trim().length < 8) throw new ClientTeamError('The temporary password is too short.');
  const [p] = await db.select({ h: profiles.passwordHash }).from(profiles).where(eq(profiles.id, inv.profileId)).limit(1);
  if (!p || p.h !== inv.tempPasswordHash) throw new ClientTeamError('This invite is no longer pending.', 409);
  const hash = await bcrypt.hash(tempPassword.trim(), 10);
  const now = new Date();
  await db.update(profiles).set({ passwordHash: hash, updatedAt: now }).where(eq(profiles.id, inv.profileId));
  const [up] = await db
    .update(clientInvites)
    .set({ tempPasswordHash: hash, lastSentAt: now, sendCount: inv.sendCount + 1, ...tokenColumns(setPasswordToken, now) })
    .where(eq(clientInvites.id, inv.id))
    .returning();
  await recordAuditEvent(ctx, {
    engagementId: appEngagementId(eng.dbId),
    action: 'client.invite_resend',
    summary: `Sent the invite again to ${inv.name ?? 'a colleague'}`,
    metadata: { inviteId: inv.id, invitedUserId: inv.profileId },
  });
  return {
    invite: { id: up.id, name: up.name ?? up.email, email: up.email, sentAt: up.lastSentAt.toISOString(), sendCount: up.sendCount, designation: null },
    name: up.name ?? up.email,
    email: up.email,
    companyName: eng.row.companyName,
  };
}

/**
 * Primary only. Cancels a pending invite: the invitee loses access to this
 * engagement at once; an account the invite created and that has no other
 * project goes to Removed clients (same rule as a substitute).
 */
export async function cancelClientInvite(ctx: AuthContext, inviteId: string): Promise<void> {
  const { eng, inv } = await ownInvite(ctx, inviteId);
  if (inv.revokedAt) return;
  if (inv.acceptedAt) throw new ClientTeamError('This invite was already accepted.', 409);
  await db.transaction(async (tx) => {
    await tx.update(clientInvites).set({ revokedAt: new Date() }).where(eq(clientInvites.id, inv.id));
    if (inv.profileId) {
      await tx
        .delete(engagementClients)
        .where(and(eq(engagementClients.engagementId, eng.dbId), eq(engagementClients.userId, inv.profileId)));
    }
  });
  if (inv.profileId && inv.tempPasswordHash) {
    const [other] = await db
      .select({ id: engagementClients.id })
      .from(engagementClients)
      .where(eq(engagementClients.userId, inv.profileId))
      .limit(1);
    const [primaryElsewhere] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(eq(engagements.clientUserId, inv.profileId))
      .limit(1);
    if (!other && !primaryElsewhere) {
      await db
        .update(profiles)
        .set({ status: 'removed', removedAt: new Date(), removedReason: `Invite cancelled on ${eng.row.companyName}`, updatedAt: new Date() })
        .where(and(eq(profiles.id, inv.profileId), eq(profiles.role, 'client')));
    }
  }
  await recordAuditEvent(ctx, {
    engagementId: appEngagementId(eng.dbId),
    action: 'client.invite_revoke',
    summary: `Cancelled the invite for ${inv.name ?? 'a colleague'}`,
    metadata: { inviteId: inv.id, invitedUserId: inv.profileId },
  });
}

/** Primary only. Undo of Cancel: the invite and the access come back (no new email). */
export async function restoreClientInvite(ctx: AuthContext, inviteId: string): Promise<void> {
  const { eng, inv } = await ownInvite(ctx, inviteId);
  if (!inv.revokedAt) return;
  await db.transaction(async (tx) => {
    await tx.update(clientInvites).set({ revokedAt: null }).where(eq(clientInvites.id, inv.id));
    if (inv.profileId) {
      await tx
        .insert(engagementClients)
        .values({ engagementId: eng.dbId, userId: inv.profileId, memberRole: 'member', invitedBy: ctx.userId })
        .onConflictDoNothing({ target: [engagementClients.engagementId, engagementClients.userId] });
      // Only undo OUR cancellation (review M4): an account removed for any
      // other reason stays removed.
      await tx
        .update(profiles)
        .set({ status: 'active', removedAt: null, removedReason: null, updatedAt: new Date() })
        .where(
          and(
            eq(profiles.id, inv.profileId),
            eq(profiles.role, 'client'),
            eq(profiles.removedReason, `Invite cancelled on ${eng.row.companyName}`),
          ),
        );
    }
  });
  await recordAuditEvent(ctx, {
    engagementId: appEngagementId(eng.dbId),
    action: 'client.invite_restore',
    summary: `Restored the invite for ${inv.name ?? 'a colleague'}`,
    metadata: { inviteId: inv.id, invitedUserId: inv.profileId },
  });
}

/**
 * C-899, SYSTEM: the invitee opens the set-password link and chooses a password. There is no
 * AuthContext yet; the token is the authority. It must match a pending invite (not cancelled,
 * not accepted, link not expired, and the account still on the temporary password the invite
 * set), and it works once.
 */
export type SetInvitePasswordOutcome = { status: 'ok'; email: string } | { status: 'invalid' | 'too_short' };

async function pendingInviteForToken(token: string, now: Date) {
  if (!validToken(token)) return null;
  const [r] = await db
    .select({ inv: clientInvites, hash: profiles.passwordHash, email: profiles.email, company: engagements.companyName })
    .from(clientInvites)
    .innerJoin(profiles, eq(profiles.id, clientInvites.profileId))
    .innerJoin(engagements, eq(engagements.id, clientInvites.engagementId))
    .where(
      and(
        eq(clientInvites.setPasswordTokenHash, hashSetPasswordToken(token)),
        isNull(clientInvites.revokedAt),
        isNull(clientInvites.acceptedAt),
        gt(clientInvites.setPasswordExpiresAt, now),
      ),
    )
    .limit(1);
  if (!r || !r.inv.tempPasswordHash || r.hash !== r.inv.tempPasswordHash) return null;
  return r;
}

/** What the set-password page shows: the email and the company, or nothing for a bad link. */
export async function systemPeekInviteToken(token: string, now = new Date()): Promise<{ email: string; companyName: string } | null> {
  const r = await pendingInviteForToken(token, now);
  return r ? { email: r.email, companyName: r.company } : null;
}

export async function systemSetInvitePassword(token: string, password: string, now = new Date()): Promise<SetInvitePasswordOutcome> {
  if (password.length < 8 || password.length > 128) return { status: 'too_short' };
  const r = await pendingInviteForToken(token, now);
  if (!r || !r.inv.profileId) return { status: 'invalid' };
  const hash = await bcrypt.hash(password, 10);
  await db.update(profiles).set({ passwordHash: hash, updatedAt: now }).where(and(eq(profiles.id, r.inv.profileId), eq(profiles.role, 'client')));
  await db
    .update(clientInvites)
    .set({ acceptedAt: now, setPasswordTokenHash: null, setPasswordExpiresAt: null })
    .where(eq(clientInvites.id, r.inv.id));
  return { status: 'ok', email: r.email };
}
