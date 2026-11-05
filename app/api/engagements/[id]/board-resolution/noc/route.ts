import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole, type AuthContext } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  acceptNoc,
  changeNocTemplate,
  getNocState,
  sendBackNoc,
  setNocCheck,
  setNocNotarySteps,
} from '@/db/repositories/board-resolution-noc';
import { NOC_TEMPLATES } from '@/lib/noc/templates';
import { parseNocVariant } from '@/lib/noc/state';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/engagements/:id/board-resolution/noc — the board resolution (NOC) state (R-52): the
 * variant, the track, the send back and, for staff, the template card, the receive checklist and
 * the out-of-date mark. Contract: `docs/ui-port/BR-NOC-API.md`. Scoped by the repository; another
 * tenant's engagement is 404.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAnyRole('client', 'intern', 'manager', 'admin', 'super_admin');
  if (auth.ok === false) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  try {
    const noc = await getNocState(auth.ctx, id);
    if (!noc) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, noc });
  } catch (err) {
    return NextResponse.json({ ok: false, error: publicErrorMessage(err, 'load_failed') }, { status: 500 });
  }
}

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('check'), key: z.string().trim().min(1).max(40), ticked: z.boolean() }),
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('send_back'), reason: z.string().trim().max(2000) }),
  z.object({ action: z.literal('change_template'), variant: z.string().trim().min(1), reason: z.string().trim().max(2000) }),
  z.object({ action: z.literal('notary_steps'), off: z.boolean() }),
]);

function statusFor(message: string): number {
  if (message.includes('not found') || message.includes('not permitted')) return 404;
  if (message.startsWith('Only ')) return 403;
  if (message === 'reason_required' || message === 'unknown_check' || message === 'unknown_variant') return 400;
  return 409;
}

async function audit(ctx: AuthContext, engagementId: string, action: string, summary: string, metadata?: Record<string, unknown>) {
  await recordAuditEvent(ctx, { engagementId, action, summary, actorEmail: ctx.email, actorName: ctx.name, metadata });
}

/**
 * POST /api/engagements/:id/board-resolution/noc — staff actions on the board resolution (NOC):
 * tick a receive check, Accept (files the copy to the Vault), Send back with a reason (tells the
 * client), Change template with a reason (manager, admin, super admin), and turn the notary steps
 * on or off. Each writes an audit line.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAnyRole('intern', 'manager', 'admin', 'super_admin');
  if (auth.ok === false) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  const ctx = auth.ctx;
  const data = body.data;

  try {
    switch (data.action) {
      case 'check': {
        const noc = await setNocCheck(ctx, id, data.key, data.ticked);
        const label = noc.staff?.checks.find((c) => c.key === data.key)?.label ?? data.key;
        await audit(ctx, id, 'board_resolution.check', `${data.ticked ? 'Ticked' : 'Cleared'}: ${label}`, { key: data.key, ticked: data.ticked });
        return NextResponse.json({ ok: true, noc });
      }
      case 'accept': {
        const noc = await acceptNoc(ctx, id);
        await audit(ctx, id, 'board_resolution.accepted', 'Accepted the signed board resolution', {
          vaultDocumentId: noc.staff?.vaultDocumentId ?? null,
        });
        return NextResponse.json({ ok: true, noc });
      }
      case 'send_back': {
        if (!data.reason) return NextResponse.json({ ok: false, error: 'reason_required' }, { status: 400 });
        const noc = await sendBackNoc(ctx, id, data.reason);
        await audit(ctx, id, 'board_resolution.sent_back', 'Sent the signed board resolution back', { reason: data.reason });
        // The client is told why. A mail failure never fails the send back that committed.
        const email = await notifyEngagementEventSoon({
          engagementId: id,
          itemId: 'pre-3',
          event: 'review_rejected',
          note: data.reason,
          actorUserId: ctx.userId,
        }).catch(() => null);
        return NextResponse.json({ ok: true, noc, email });
      }
      case 'change_template': {
        if (!data.reason) return NextResponse.json({ ok: false, error: 'reason_required' }, { status: 400 });
        const before = (await getNocState(ctx, id))?.variant ?? null;
        const noc = await changeNocTemplate(ctx, id, data.variant, data.reason);
        const to = parseNocVariant(data.variant);
        await audit(
          ctx,
          id,
          'board_resolution.template_changed',
          `Changed the template to ${to ? NOC_TEMPLATES[to].label : data.variant}`,
          { from: before, to: data.variant, reason: data.reason },
        );
        return NextResponse.json({ ok: true, noc });
      }
      case 'notary_steps': {
        const noc = await setNocNotarySteps(ctx, id, data.off);
        await audit(ctx, id, 'board_resolution.notary_steps', data.off ? 'Turned off the notary and apostille steps' : 'Turned on the notary and apostille steps', { off: data.off });
        return NextResponse.json({ ok: true, noc });
      }
    }
  } catch (err) {
    const message = publicErrorMessage(err, 'action_failed');
    return NextResponse.json({ ok: false, error: message }, { status: statusFor(message) });
  }
}
