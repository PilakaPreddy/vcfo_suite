import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { sendEmail } from '@/lib/email/send-email';
import { siteUrl } from '@/lib/site-url';
import { partnerLoginEmail, partnerLoginUrl, partnerSetPasswordUrl } from '@/lib/receivables/partner-emails';
import { partnerLoginAction } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * POST /api/receivables/partners/:id/login — the client partner's login (Phase 8).
 *   { action: 'invite' | 'resend' | 'reset' | 'disable' | 'enable', setPasswordToken? }
 * Invite, resend and reset email a set-password link (`/receivables/set-password?token=…`). The
 * token may come from the browser (the client team pattern); without one the server makes it.
 * Who may act is decided in the repository: the sheet's own manager and the firm-wide admins.
 * The answer is `{ partner, emailed }`; `emailed` is false when the email could not go out, and
 * the manager can press Resend.
 */
const schema = z.object({
  action: z.enum(['invite', 'resend', 'reset', 'disable', 'enable']),
  setPasswordToken: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,128}$/, 'invalid_token')
    .optional()
    .nullable(),
});

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  let result;
  try {
    result = await partnerLoginAction(guard.ctx, id, body.data.action, body.data.setPasswordToken);
  } catch (e) {
    return receivablesError(e);
  }
  let emailed: boolean | null = null;
  if (result.email) {
    const e = result.email;
    const site = siteUrl();
    const mail = partnerLoginEmail({
      kind: e.kind === 'access_added' ? 'access_added' : body.data.action === 'reset' ? 'reset' : 'invite',
      name: e.name,
      clientOrgName: e.clientOrgName,
      url: e.token ? partnerSetPasswordUrl(site, e.token) : partnerLoginUrl(site, e.to),
    });
    try {
      const res = await sendEmail({ to: e.to, subject: mail.subject, html: mail.html, text: mail.text, purpose: `receivables.partner_${body.data.action}` });
      emailed = res.ok;
    } catch (err) {
      console.error('[receivables] partner login email failed', err instanceof Error ? err.message : err);
      emailed = false;
    }
  }
  return NextResponse.json({ partner: result.partner, emailed });
}
