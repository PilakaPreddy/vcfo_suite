import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  createEmailTemplate,
  listEmailTemplates,
} from '@/db/repositories/email-templates';

const writeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  subject: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().min(1).max(20000),
  branding: z.enum(['sbc', 'plain']),
  isActive: z.boolean().optional(),
});

/** GET /api/email-templates — firm-scoped compose templates. */
export async function GET() {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const templates = await listEmailTemplates(guard.ctx);
    return NextResponse.json({ templates });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    const status = message.includes('not permitted') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** POST /api/email-templates — create a firm compose template. */
export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await parseJsonBody(request, writeSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  try {
    const template = await createEmailTemplate(guard.ctx, {
      name: body.data.name,
      description: body.data.description,
      subject: body.data.subject,
      bodyText: body.data.bodyText,
      branding: body.data.branding,
      isActive: body.data.isActive,
    });
    await recordAuditEvent(guard.ctx, {
      action: 'email_templates.create',
      summary: `Created email template “${template.name}”`,
      metadata: { templateId: template.id, branding: template.branding },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    const status = message.includes('not permitted') ? 403 : message === 'invalid_body' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
