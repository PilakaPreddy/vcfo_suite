import { notifyTeamAssignmentsSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { requireAuth, requireAdminOrManager } from '@/auth/guards';
import {
  createProjectWithClient,
  listEngagements,
  toAppEngagementsWithLeads,
} from '@/db/repositories/engagements';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import { listManagerIdsForEngagement } from '@/db/repositories/engagement-managers-membership';
import { listStaffContactsByIds } from '@/db/repositories/profiles';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createProjectBodySchema } from '@/lib/api/schemas';
import { emptyEmailDispatch, pushEmailSubject } from '@/lib/email/email-dispatch';
import { fetchEngagementProgressCcEmails } from '@/lib/email/fetch-engagement-progress-cc';
import { resolvePortalUrl, sendWelcomeEmail } from '@/lib/email/welcome-email';
import { queueWhatsAppSend } from '@/lib/notify/send-whatsapp';
import { firstNameOf } from '@/lib/notify/templates';

/**
 * GET /api/engagements — role-scoped list.
 * POST /api/engagements — admin/manager creates client + engagement + welcome email.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const rows = await listEngagements(guard.ctx);
  return NextResponse.json({ engagements: await toAppEngagementsWithLeads(rows) });
}

export async function POST(request: Request) {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await parseJsonBody(request, createProjectBodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const data = body.data;

  let created: Awaited<ReturnType<typeof createProjectWithClient>>;
  try {
    created = await createProjectWithClient(auth.ctx, data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed';
    if (message === 'email_already_registered') {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes('internId')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const engagementProgressCc = await fetchEngagementProgressCcEmails(
    auth.ctx,
    created.engagement.id,
  ).catch(() => [] as string[]);

  let emailResult: Awaited<ReturnType<typeof sendWelcomeEmail>>;
  try {
    emailResult = await sendWelcomeEmail({
      clientEmail: data.clientEmail.trim().toLowerCase(),
      clientName: data.clientName?.trim() || data.companyName.trim(),
      companyName: data.companyName.trim(),
      stage: created.engagement.stage,
      health: created.engagement.health,
      createdAt: created.engagement.createdAt,
      clientPassword: data.clientPassword,
      engagementProgressCc,
      managerName: auth.ctx.name,
      managerEmail: auth.ctx.email,
      portalUrl: resolvePortalUrl(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'welcome_email_failed';
    emailResult = { ok: false, error: message };
  }

  // WhatsApp welcome nudge — background, after email, never blocks the response.
  await queueWhatsAppSend({
    engagementId: created.engagement.id,
    recipientProfileId: created.clientUserId,
    event: 'welcome',
    variables: {
      firstName: firstNameOf(data.clientName ?? data.companyName),
      companyName: created.engagement.companyName,
    },
  });

  const teamEmail = emptyEmailDispatch();
  try {
    const recipients = await resolveEngagementRecipients(created.engagement.id);
    const managerIds = await listManagerIdsForEngagement(recipients.dbId);
    const managerProfiles = await listStaffContactsByIds(auth.ctx, managerIds);

    const assigned = [
      ...managerProfiles
        .filter((m) => m.email?.trim())
        .map((m) => ({
          role: 'project manager' as const,
          party: {
            userId: m.id,
            email: m.email.trim(),
            name: m.name?.trim() || m.email.trim(),
          },
        })),
      ...recipients.leads.map((l) => ({
        role: 'project lead' as const,
        party: l,
      })),
    ];

    const team = await notifyTeamAssignmentsSoon({
      engagementAppId: created.engagement.id,
      engagementSlug: created.engagement.slug,
      companyName: created.engagement.companyName,
      actor: {
        userId: auth.ctx.userId,
        name: auth.ctx.name,
        email: auth.ctx.email,
      },
      assigned,
    });
    teamEmail.attempted = team.attempted;
    teamEmail.sent = team.sent;
    teamEmail.skipped = team.skipped;
    teamEmail.failed = team.failed;
  } catch (err) {
    console.error('[engagements] team assignment notify failed', err);
  }

  await recordAuditEvent(auth.ctx, {
    engagementId: created.engagement.id,
    action: 'engagement.create',
    summary: `Created project ${created.engagement.companyName}`,
    metadata: {
      clientId: created.clientId,
      clientUserId: created.clientUserId,
      welcomeEmailSent: emailResult.ok,
      welcomeEmailSkipped: emailResult.skipped ?? false,
      welcomeEmailError: emailResult.ok ? undefined : emailResult.error,
      welcomeEmailProvider: emailResult.provider,
      welcomeEmailMessageId: emailResult.providerMessageId,
      welcomeEmailRedirectedTo: emailResult.redirectedTo,
      teamEmailAttempted: teamEmail.attempted,
      teamEmailSent: teamEmail.sent,
    },
    actorEmail: auth.ctx.email,
    actorName: auth.ctx.name,
  });

  const email = emptyEmailDispatch();
  email.attempted =
    (emailResult.ok || emailResult.skipped || Boolean(emailResult.error) ? 1 : 0) +
    teamEmail.attempted;
  if (emailResult.ok) {
    email.sent.push(data.clientEmail.trim().toLowerCase());
    pushEmailSubject(email, `Welcome to VCFO Suite — ${data.companyName.trim()}`);
  } else if (emailResult.skipped) {
    email.skipped.push(data.clientEmail.trim().toLowerCase());
    pushEmailSubject(email, `Welcome to VCFO Suite — ${data.companyName.trim()}`);
  } else if (emailResult.error) {
    email.failed.push(data.clientEmail.trim().toLowerCase());
    pushEmailSubject(email, `Welcome to VCFO Suite — ${data.companyName.trim()}`);
  }
  email.sent.push(...teamEmail.sent);
  email.skipped.push(...teamEmail.skipped);
  email.failed.push(...teamEmail.failed);
  email.subjects = [...new Set([...(email.subjects ?? []), ...(teamEmail.subjects ?? [])])];
  email.sent = [...new Set(email.sent)];
  email.skipped = [...new Set(email.skipped)];
  email.failed = [...new Set(email.failed)];

  return NextResponse.json(
    {
      engagement: created.engagement,
      clientId: created.clientId,
      clientUserId: created.clientUserId,
      emailSent: emailResult.ok,
      emailSkipped: emailResult.skipped ?? false,
      emailError: emailResult.ok ? undefined : emailResult.error,
      email,
    },
    { status: 201 },
  );
}
