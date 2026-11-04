import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, type AuthContext } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  ClientTeamError,
  cancelClientInvite,
  createClientInvite,
  getClientTeam,
  resendClientInvite,
  restoreClientInvite,
} from '@/db/repositories/client-team';
import { resolvePortalUrl, sendWelcomeEmail } from '@/lib/email/welcome-email';
import { siteUrl } from '@/lib/site-url';

/** C-899: the page where an invitee chooses a password. */
function setPasswordUrl(token: string): string {
  return `${siteUrl().replace(/\/$/, '')}/set-password/${encodeURIComponent(token)}`;
}

/**
 * GET  /api/client/team — the Team page: Northwind's people + pending invites. Staff pass
 *      `?engagement=<id>` for an engagement they may access; a client's own is always used.
 * POST /api/client/team — { action: 'invite' | 'resend' | 'cancel' | 'restore' }, clients only.
 * Access lives in `client-team.ts` (own engagement; Primary contact only for writes).
 */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    return NextResponse.json(await getClientTeam(guard.ctx, new URL(request.url).searchParams.get('engagement') ?? undefined));
  } catch (e) {
    return fail(e);
  }
}

const setPasswordTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32,128}$/)
  .optional()
  .nullable();

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('invite'),
    name: z.string().trim().min(1, 'Enter a name').max(120),
    email: z.string().trim().email('Enter a valid email address'),
    tempPassword: z.string().min(8).max(128),
    /** The person's role at the company (C-898), stored as their designation. */
    designation: z.string().trim().max(80).optional().nullable(),
    /** C-899: the set-password link token the dialog made; the email carries the link. */
    setPasswordToken: setPasswordTokenSchema,
  }),
  z.object({
    action: z.literal('resend'),
    inviteId: z.string().uuid(),
    tempPassword: z.string().min(8).max(128),
    setPasswordToken: setPasswordTokenSchema,
  }),
  z.object({ action: z.literal('cancel'), inviteId: z.string().uuid() }),
  z.object({ action: z.literal('restore'), inviteId: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const ctx = guard.ctx;
  try {
    const b = body.data;
    if (b.action === 'invite') {
      const r = await createClientInvite(ctx, {
        name: b.name,
        email: b.email,
        tempPassword: b.tempPassword,
        designation: b.designation,
        setPasswordToken: b.setPasswordToken,
      });
      const emailed = r.createdNewUser ? await sendInviteEmail(ctx, r.email, r.name, r.companyName, b.tempPassword, b.setPasswordToken) : 'attached';
      return NextResponse.json({ ok: true, invite: r.invite, createdNewUser: r.createdNewUser, email: emailed, team: await getClientTeam(ctx) }, { status: 201 });
    }
    if (b.action === 'resend') {
      const r = await resendClientInvite(ctx, b.inviteId, b.tempPassword, b.setPasswordToken);
      const emailed = await sendInviteEmail(ctx, r.email, r.name, r.companyName, b.tempPassword, b.setPasswordToken);
      return NextResponse.json({ ok: true, invite: r.invite, email: emailed, team: await getClientTeam(ctx) });
    }
    if (b.action === 'cancel') await cancelClientInvite(ctx, b.inviteId);
    else await restoreClientInvite(ctx, b.inviteId);
    return NextResponse.json({ ok: true, team: await getClientTeam(ctx) });
  } catch (e) {
    return fail(e);
  }
}

/**
 * The welcome email. With a set-password link (C-899) it carries the link, never the password;
 * an older bundle that sends no token still gets the temporary password in the email.
 */
async function sendInviteEmail(
  ctx: AuthContext,
  email: string,
  name: string,
  companyName: string,
  tempPassword: string,
  setPasswordToken?: string | null,
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const res = await sendWelcomeEmail({
      clientEmail: email,
      clientName: name,
      companyName,
      stage: 'Pre-Incorporation',
      health: 'on-track',
      createdAt: new Date().toISOString(),
      managerName: ctx.name,
      managerEmail: ctx.email,
      portalUrl: resolvePortalUrl(),
      ...(setPasswordToken ? { setPasswordUrl: setPasswordUrl(setPasswordToken) } : { clientPassword: tempPassword }),
    });
    return res.ok ? 'sent' : res.skipped ? 'skipped' : 'failed';
  } catch {
    return 'failed';
  }
}

function fail(e: unknown) {
  if (e instanceof ClientTeamError) return NextResponse.json({ error: e.message }, { status: e.status });
  const message = e instanceof Error ? e.message : 'team_failed';
  return NextResponse.json({ error: message }, { status: 500 });
}
