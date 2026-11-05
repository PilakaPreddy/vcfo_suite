import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  deleteEmailTemplate,
  getEmailTemplate,
  updateEmailTemplate,
} from '@/db/repositories/email-templates';

type RouteContext = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

const writeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  subject: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().min(1).max(20000),
  branding: z.enum(['sbc', 'plain']),
  isActive: z.boolean().optional(),
});

function mapRepoError(message: string): number {
  if (message.includes('not permitted')) return 403;
  if (message === 'not_found') return 404;
  if (message === 'invalid_body') return 400;
  return 500;
}

/** GET /api/email-templates/:id */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  try {
    const template = await getEmailTemplate(guard.ctx, id);
    if (!template) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    const message = publicErrorMessage(err, 'fetch_failed');
    return NextResponse.json({ error: message }, { status: mapRepoError(message) });
  }
}

/** PATCH /api/email-templates/:id */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const body = await parseJsonBody(request, writeSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const template = await updateEmailTemplate(guard.ctx, id, {
      name: body.data.name,
      description: body.data.description,
      subject: body.data.subject,
      bodyText: body.data.bodyText,
      branding: body.data.branding,
      isActive: body.data.isActive,
    });
    await recordAuditEvent(guard.ctx, {
      action: 'email_templates.update',
      summary: `Updated email template “${template.name}”`,
      metadata: { templateId: template.id, branding: template.branding },
    });
    return NextResponse.json({ template });
  } catch (err) {
    const message = publicErrorMessage(err, 'update_failed');
    return NextResponse.json({ error: message }, { status: mapRepoError(message) });
  }
}

/** DELETE /api/email-templates/:id */
export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  try {
    const existing = await getEmailTemplate(guard.ctx, id);
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await deleteEmailTemplate(guard.ctx, id);
    await recordAuditEvent(guard.ctx, {
      action: 'email_templates.delete',
      summary: `Deleted email template “${existing.name}”`,
      metadata: { templateId: existing.id },
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = publicErrorMessage(err, 'delete_failed');
    return NextResponse.json({ error: message }, { status: mapRepoError(message) });
  }
}
