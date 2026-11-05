import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  listEngagementClients,
  substituteEngagementClient,
} from '@/db/repositories/engagement-clients';
import { resolvePortalUrl, sendWelcomeEmail } from '@/lib/email/welcome-email';
import { getEngagementById } from '@/db/repositories/engagements';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { emptyEmailDispatch, type EmailDispatchResult } from '@/lib/email/email-dispatch';
import { sendClientEmailChangedEmail } from '@/lib/email/client-email-changed';
import { clientPasswordSchema, emailSchema } from '@/lib/api/schemas';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const substituteSchema = z.object({
  replaceUserId: z.string().uuid(),
  email: emailSchema,
  fullName: z.string().trim().max(120).optional(),
  password: clientPasswordSchema,
});

/**
 * POST /api/engagements/:id/clients/substitute
 * Replace one client on the project with another person.
 * Clients may substitute themselves or another client on the same project.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, substituteSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  try {
    const result = await substituteEngagementClient(guard.ctx, {
      engagementId: id,
      replaceUserId: body.data.replaceUserId,
      email: body.data.email,
      fullName: body.data.fullName,
      password: body.data.password,
    });

    let email: EmailDispatchResult = emptyEmailDispatch();
    if (result.createdNewUser) {
      let eng: Awaited<ReturnType<typeof getEngagementById>> = null;
      if (!result.actorLostAccess) {
        eng = await getEngagementById(guard.ctx, engagementDbId(id)).catch(() => null);
      }
      const emailResult = await sendWelcomeEmail({
        clientEmail: result.email,
        clientName: result.name,
        companyName: eng?.companyName ?? result.companyName,
        stage: eng?.stage ?? 'Pre-Incorporation',
        health: eng?.health ?? 'on-track',
        createdAt: new Date().toISOString(),
        managerName: guard.ctx.name,
        managerEmail: guard.ctx.email,
        portalUrl: resolvePortalUrl(),
        clientPassword: result.tempPassword,
        engagementProgressCc: eng?.progressCcEmails ?? [],
      });
      email = {
        attempted: 1,
        sent: emailResult.ok ? [result.email] : [],
        skipped: emailResult.skipped ? [result.email] : [],
        failed: !emailResult.ok && !emailResult.skipped ? [result.email] : [],
      };
    }

    // The outgoing address always hears about it, new account or not.
    const noticeResult = await sendClientEmailChangedEmail({
      previousEmail: result.replacedEmail,
      previousName: result.replacedName,
      newEmail: result.email,
      companyName: result.companyName,
      actorName: guard.ctx.name,
      actorEmail: guard.ctx.email,
    }).catch(() => null);
    const previousClientNotice: EmailDispatchResult = {
      attempted: 1,
      sent: noticeResult?.ok ? [result.replacedEmail] : [],
      skipped: noticeResult?.skipped ? [result.replacedEmail] : [],
      failed: !noticeResult || (!noticeResult.ok && !noticeResult.skipped)
        ? [result.replacedEmail]
        : [],
    };

    let clients: Awaited<ReturnType<typeof listEngagementClients>> = [];
    if (!result.actorLostAccess) {
      clients = await listEngagementClients(guard.ctx, id);
    }

    return NextResponse.json({
      ok: true,
      substituted: {
        replacedUserId: result.replacedUserId,
        replacedEmail: result.replacedEmail,
        replacedName: result.replacedName,
        userId: result.userId,
        email: result.email,
        name: result.name,
        createdNewUser: result.createdNewUser,
        memberRole: result.memberRole,
        becamePrimary: result.becamePrimary,
        actorLostAccess: result.actorLostAccess,
        replacedRemoved: result.replacedRemoved,
      },
      clients,
      email,
      previousClientNotice,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'substitute_failed');
    const status =
      message === 'already_a_member' ||
      message === 'cannot_substitute_with_same_user' ||
      message === 'email_already_registered'
        ? 409
        : message === 'replace_user_not_on_project'
          ? 404
          : message.includes('not found') || message.includes('not permitted')
            ? 403
            : 400;
    const friendly: Record<string, string> = {
      already_a_member: 'That person is already on this project.',
      cannot_substitute_with_same_user: 'Choose a different email than the person being replaced.',
      email_not_a_client: 'That email belongs to a non-client account.',
      replace_user_not_on_project: 'That client is not on this project.',
      password_too_short: 'Password must be at least 8 characters.',
      invalid_email: 'Enter a valid email address.',
    };
    return NextResponse.json({ error: friendly[message] ?? message }, { status });
  }
}
