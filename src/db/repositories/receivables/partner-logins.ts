import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/db/client';
import { profiles, receivablePartners, receivableSheets } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { SET_PASSWORD_TTL_MS, hashSetPasswordToken } from '@/db/repositories/client-team';
import type { PartnerDto, PartnerLoginState } from '@/lib/receivables/wire';
import { UUID, assertEditorRole, conflict, logChange, notFound, scopedSheet } from './shared';

/**
 * RECEIVABLES — client partner logins (docs/specs/receivables/PLAN.md, Phase 8).
 *
 * >>> ACCESS CONTROL <<<
 *   invite, resend, reset, disable and enable — the sheet's own manager and the firm-wide admins
 *   only, through `scopedSheet` (another manager reads the partner as not found; interns, clients,
 *   developers and partners are refused before the first query).
 *   The set-password link has no session: `systemPeekPartnerToken` and `systemSetPartnerPassword`
 *   take the raw token, which is the authority (stored only as a hash, seven days, one use).
 *
 * The token pattern is the one of the client team invites (`client-team.ts`): the browser makes a
 * 32 to 128 character URL-safe token, the server keeps its SHA-256 hash and an expiry, and the raw
 * token travels only in the email link. When the browser sends no token, the server makes one.
 */

export type PartnerLoginAction = 'invite' | 'resend' | 'reset' | 'disable' | 'enable';

type PartnerRow = typeof receivablePartners.$inferSelect;
type LoginProfile = { status: string | null; role?: string | null } | null;

/** A link token the browser made: 32 to 128 URL-safe characters (same rule as client-team.ts). */
function validToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(token.trim());
}

function newToken(fromBrowser: string | null | undefined): string {
  return validToken(fromBrowser) ? fromBrowser.trim() : randomBytes(32).toString('base64url');
}

/** none: never invited; invited: waiting for the password; active: signed up; disabled: login off. */
function partnerLoginState(row: Pick<PartnerRow, 'profileId' | 'acceptedAt'>, profile: LoginProfile): PartnerLoginState {
  if (!row.profileId) return 'none';
  if (!profile || profile.status !== 'active') return 'disabled';
  return row.acceptedAt ? 'active' : 'invited';
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** The partner as the manager area sees it, login state included. */
export function toPartnerDto(row: PartnerRow, profile: LoginProfile): PartnerDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    email: row.email,
    active: row.active,
    loginState: partnerLoginState(row, profile),
    invitedAt: iso(row.invitedAt),
    acceptedAt: iso(row.acceptedAt),
    notifyOnPublish: row.notifyOnPublish,
  };
}

/** What the route needs to send the email. `token` is set only when a set-password link goes out. */
export type PartnerLoginResult = {
  partner: PartnerDto;
  email: { to: string; name: string; clientOrgName: string; token: string | null; kind: 'set_password' | 'access_added' } | null;
};

async function scopedPartner(ctx: AuthContext, partnerId: string) {
  assertEditorRole(ctx);
  if (!UUID.test(partnerId ?? '')) throw notFound();
  const [p] = await db.select().from(receivablePartners).where(eq(receivablePartners.id, partnerId)).limit(1);
  if (!p) throw notFound();
  const sheet = await scopedSheet(ctx, p.sheetId);
  return { p, sheet };
}

async function profileOf(profileId: string | null) {
  if (!profileId) return null;
  const [row] = await db
    .select({ id: profiles.id, email: profiles.email, role: profiles.role, status: profiles.status, passwordHash: profiles.passwordHash })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return row ?? null;
}

/**
 * The manager's login actions on one client partner.
 *  - invite: creates a `partner` profile for the partner's email (or links the existing one when
 *    that email already is a partner login; a staff or client email is refused), then emails the
 *    set-password link. A linked profile that already has a password gets an access email instead.
 *  - resend: a new set-password link while the partner has not chosen a password yet.
 *  - reset: a new set-password link for a partner who has signed up (forgotten password).
 *  - disable / enable: turns the login off or back on (`profiles.status`). The partner row, its
 *    invoices and its reminders stay as they are.
 */
export async function partnerLoginAction(
  ctx: AuthContext,
  partnerId: string,
  action: PartnerLoginAction,
  browserToken?: string | null,
  now = new Date(),
): Promise<PartnerLoginResult> {
  const { p, sheet } = await scopedPartner(ctx, partnerId);
  const profile = await profileOf(p.profileId);
  const state = partnerLoginState(p, profile);
  const tokenSet = (token: string) => ({ setPasswordTokenHash: hashSetPasswordToken(token), setPasswordExpiresAt: new Date(now.getTime() + SET_PASSWORD_TTL_MS) });

  if (action === 'invite') {
    if (state !== 'none') throw conflict('already_invited');
    if (!p.active) throw conflict('partner_inactive');
    const email = p.email.trim().toLowerCase();
    const [existing] = await db
      .select({ id: profiles.id, role: profiles.role, status: profiles.status, passwordHash: profiles.passwordHash })
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);
    // An email that belongs to staff or a client can never become a partner login.
    if (existing && existing.role !== 'partner') throw conflict('email_in_use');
    if (existing && existing.status !== 'active') throw conflict('login_disabled');
    let profileId: string;
    if (existing) {
      profileId = existing.id;
    } else {
      const [created] = await db.insert(profiles).values({ email, name: p.name, role: 'partner', passwordHash: null, status: 'active' }).returning({ id: profiles.id });
      profileId = created.id;
    }
    const hasPassword = Boolean(existing?.passwordHash);
    const token = hasPassword ? null : newToken(browserToken);
    const [row] = await db
      .update(receivablePartners)
      .set({
        profileId,
        invitedAt: now,
        inviteSendCount: p.inviteSendCount + 1,
        // An existing partner login with a password needs no link: it can sign in already.
        acceptedAt: hasPassword ? now : null,
        ...(token ? tokenSet(token) : { setPasswordTokenHash: null, setPasswordExpiresAt: null }),
      })
      .where(and(eq(receivablePartners.id, p.id), eq(receivablePartners.sheetId, sheet.id)))
      .returning();
    await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `Login invite sent to ${p.name}`, affectsPage: false });
    return {
      partner: toPartnerDto(row, { status: 'active' }),
      email: { to: email, name: p.name, clientOrgName: sheet.clientOrgName, token, kind: token ? 'set_password' : 'access_added' },
    };
  }

  if (!profile || !p.profileId) throw conflict('not_invited');
  if (profile.role !== 'partner') throw conflict('email_in_use');

  if (action === 'resend' || action === 'reset') {
    if (state === 'disabled') throw conflict('login_disabled');
    if (action === 'resend' && state !== 'invited') throw conflict('already_accepted');
    if (action === 'reset' && state !== 'active') throw conflict('not_accepted');
    const token = newToken(browserToken);
    const [row] = await db
      .update(receivablePartners)
      .set({ ...tokenSet(token), ...(action === 'resend' ? { invitedAt: now, inviteSendCount: p.inviteSendCount + 1 } : {}) })
      .where(and(eq(receivablePartners.id, p.id), eq(receivablePartners.sheetId, sheet.id)))
      .returning();
    await logChange({
      sheetId: sheet.id,
      invoiceId: null,
      actorId: ctx.userId,
      summary: action === 'resend' ? `Login invite sent again to ${p.name}` : `Password reset link sent to ${p.name}`,
      affectsPage: false,
    });
    return { partner: toPartnerDto(row, profile), email: { to: profile.email, name: p.name, clientOrgName: sheet.clientOrgName, token, kind: 'set_password' } };
  }

  if (action === 'disable') {
    // The login is the partner's profile, so a partner on several sheets loses all of them.
    await db.update(profiles).set({ status: 'inactive', updatedAt: now }).where(and(eq(profiles.id, p.profileId), eq(profiles.role, 'partner')));
    const [row] = await db
      .update(receivablePartners)
      .set({ setPasswordTokenHash: null, setPasswordExpiresAt: null })
      .where(and(eq(receivablePartners.id, p.id), eq(receivablePartners.sheetId, sheet.id)))
      .returning();
    await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `Login of ${p.name} disabled`, affectsPage: false });
    return { partner: toPartnerDto(row, { status: 'inactive' }), email: null };
  }

  // enable: only a login this screen turned off ('inactive'); a removed account stays removed.
  if (profile.status !== 'inactive') throw conflict('not_disabled');
  await db
    .update(profiles)
    .set({ status: 'active', updatedAt: now })
    .where(and(eq(profiles.id, p.profileId), eq(profiles.role, 'partner'), eq(profiles.status, 'inactive')));
  await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `Login of ${p.name} enabled`, affectsPage: false });
  return { partner: toPartnerDto(p, { status: 'active' }), email: null };
}

/**
 * The partner row a set-password token belongs to, if the link is still good: the hash matches,
 * it has not expired, and the login is an active `partner` profile.
 */
async function partnerForToken(token: string, now: Date) {
  if (!validToken(token)) return null;
  const [r] = await db
    .select({ partner: receivablePartners, email: profiles.email, role: profiles.role, status: profiles.status, clientOrgName: receivableSheets.clientOrgName })
    .from(receivablePartners)
    .innerJoin(profiles, eq(profiles.id, receivablePartners.profileId))
    .innerJoin(receivableSheets, eq(receivableSheets.id, receivablePartners.sheetId))
    .where(
      and(
        eq(receivablePartners.setPasswordTokenHash, hashSetPasswordToken(token)),
        isNotNull(receivablePartners.profileId),
        gt(receivablePartners.setPasswordExpiresAt, now),
      ),
    )
    .limit(1);
  if (!r || r.role !== 'partner' || r.status !== 'active') return null;
  if (!r.partner.setPasswordExpiresAt || r.partner.setPasswordExpiresAt.getTime() <= now.getTime()) return null;
  return r;
}

/**
 * SYSTEM (no AuthContext): the partner opens the set-password link before they have any password,
 * so there is no session. The raw token is the authority; this returns only the email and the
 * client organisation to show on the page, or null for a bad, used or expired link.
 */
export async function systemPeekPartnerToken(token: string, now = new Date()): Promise<{ email: string; companyName: string } | null> {
  const r = await partnerForToken(token, now);
  return r ? { email: r.email, companyName: r.clientOrgName } : null;
}

export type SetPartnerPasswordOutcome = { status: 'ok'; email: string } | { status: 'invalid' | 'too_short' };

/**
 * SYSTEM (no AuthContext): sets the partner's password from the link. The token is the authority,
 * as above. It works once: the hash is cleared in the same write that stamps `accepted_at`.
 */
export async function systemSetPartnerPassword(token: string, password: string, now = new Date()): Promise<SetPartnerPasswordOutcome> {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return { status: 'too_short' };
  const r = await partnerForToken(token, now);
  if (!r || !r.partner.profileId) return { status: 'invalid' };
  // Clear the token first, guarded by its hash, so two requests with one link cannot both win.
  const used = await db
    .update(receivablePartners)
    .set({ setPasswordTokenHash: null, setPasswordExpiresAt: null, acceptedAt: r.partner.acceptedAt ?? now })
    .where(and(eq(receivablePartners.id, r.partner.id), eq(receivablePartners.setPasswordTokenHash, hashSetPasswordToken(token))))
    .returning({ id: receivablePartners.id });
  if (!used.length) return { status: 'invalid' };
  const hash = await bcrypt.hash(password, 10);
  await db
    .update(profiles)
    .set({ passwordHash: hash, updatedAt: now })
    .where(and(eq(profiles.id, r.partner.profileId), eq(profiles.role, 'partner')));
  // The same login may be a partner on other sheets; it is accepted there too.
  await db
    .update(receivablePartners)
    .set({ acceptedAt: now })
    .where(and(eq(receivablePartners.profileId, r.partner.profileId), eq(receivablePartners.active, true), isNotNull(receivablePartners.invitedAt), isNull(receivablePartners.acceptedAt)));
  return { status: 'ok', email: r.email };
}
