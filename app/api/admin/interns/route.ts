import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { parseJsonBody } from '@/lib/api/parse-body';
import { requireAdminOrManager } from '@/auth/guards';
import { createInternBodySchema } from '@/lib/api/schemas';
import { checkInternCreateRateLimit } from '@/lib/api/rate-limit';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { listInternOptions } from '@/db/repositories/profiles';
import { createInternUser } from '@/lib/intern/create-intern-user';
import {
  resolveInternWelcomeUrls,
  sendInternWelcomeEmail,
} from '@/lib/email/intern-welcome-email';

/** GET /api/admin/interns — roster for project-lead pickers + Team page. */
export async function GET() {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const interns = await listInternOptions(auth.ctx);
    return NextResponse.json({ interns });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/interns — create project lead + optional welcome email. */
export async function POST(request: Request) {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  if (!checkInternCreateRateLimit(auth.ctx.userId)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const body = await parseJsonBody(request, createInternBodySchema);
  if (body.ok === false) {
    return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  }

  const { email, password, fullName, phone } = body.data;

  let created: Awaited<ReturnType<typeof createInternUser>>;
  try {
    created = await createInternUser(auth.ctx, { email, password, fullName, phone });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    if (message === 'email_already_registered') {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  const urls = resolveInternWelcomeUrls();
  const emailResult = await sendInternWelcomeEmail({
    internEmail: created.email,
    internName: created.name,
    temporaryPassword: password,
    managerName: auth.ctx.name,
    managerEmail: auth.ctx.email,
    portalUrl: urls.portalUrl,
    resetUrl: urls.resetUrl,
  });

  await recordAuditEvent(auth.ctx, {
    action: 'intern.create',
    summary: `Created project lead account for ${created.name}`,
    metadata: {
      internId: created.internId,
      email: created.email,
      welcomeEmailSent: emailResult.ok,
    },
    actorEmail: auth.ctx.email,
    actorName: auth.ctx.name,
  });

  const emailSent = emailResult.ok === true;
  const emailSkipped = emailResult.ok === false && emailResult.skipped === true;
  const emailError = emailResult.ok === false ? emailResult.error : undefined;

  return NextResponse.json(
    {
      ok: true,
      internId: created.internId,
      userId: created.userId,
      name: created.name,
      email: created.email,
      emailSent,
      emailSkipped,
      emailError,
    },
    { status: 201 },
  );
}
