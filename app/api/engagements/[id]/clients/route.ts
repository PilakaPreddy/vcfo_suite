import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  inviteEngagementClient,
  listEngagementClients,
} from '@/db/repositories/engagement-clients';
import { resolvePortalUrl, sendWelcomeEmail } from '@/lib/email/welcome-email';
import { getEngagementById } from '@/db/repositories/engagements';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { emptyEmailDispatch, type EmailDispatchResult } from '@/lib/email/email-dispatch';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().max(120).optional(),
  password: z.string().min(8).max(128),
});

/** GET /api/engagements/:id/clients — list client members on a project. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  try {
    const clients = await listEngagementClients(guard.ctx, id);
    return NextResponse.json({ clients });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    const status =
      message.includes('not found') || message.includes('not permitted') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/engagements/:id/clients — invite another client onto this project.
 * Existing clients on the engagement may invite; staff may also invite.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, inviteSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  try {
    const invited = await inviteEngagementClient(guard.ctx, {
      engagementId: id,
      email: body.data.email,
      fullName: body.data.fullName,
      password: body.data.password,
    });

    let email: EmailDispatchResult = emptyEmailDispatch();
    if (invited.createdNewUser) {
      const eng = await getEngagementById(guard.ctx, engagementDbId(id));
      const emailResult = await sendWelcomeEmail({
        clientEmail: invited.email,
        clientName: invited.name,
        companyName: eng?.companyName ?? 'your project',
        stage: eng?.stage ?? 'Pre-Incorporation',
        health: eng?.health ?? 'on-track',
        createdAt: new Date().toISOString(),
        managerName: guard.ctx.name,
        managerEmail: guard.ctx.email,
        portalUrl: resolvePortalUrl(),
        clientPassword: invited.tempPassword,
        engagementProgressCc: eng?.progressCcEmails ?? [],
      });
      email = {
        attempted: 1,
        sent: emailResult.ok ? [invited.email] : [],
        skipped: emailResult.skipped ? [invited.email] : [],
        failed: !emailResult.ok && !emailResult.skipped ? [invited.email] : [],
      };
    }

    const clients = await listEngagementClients(guard.ctx, id);
    return NextResponse.json(
      {
        ok: true,
        invited: {
          userId: invited.userId,
          email: invited.email,
          name: invited.name,
          createdNewUser: invited.createdNewUser,
        },
        clients,
        email,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = publicErrorMessage(err, 'invite_failed');
    const status =
      message === 'already_a_member' || message === 'email_already_registered' || message === 'invite_existing_account_not_allowed'
        ? 409
        : message.includes('not found') || message.includes('not permitted')
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
