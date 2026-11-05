import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { publicErrorMessage } from '@/lib/api-error';
import { intakeFile, intakeLink, WatchIntakeError } from '@/lib/watch/intake';
import { watchStaff } from '../_guard';

const fieldsSchema = z.object({
  url: z.string().trim().max(1000).optional(),
  title: z.string().trim().max(300).optional(),
  sourceId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/watch/intake: staff paste a link or upload a PDF (multipart `file`). It enters the same
 * pipeline at the read step, which is how MCA and Income Tax India notices arrive.
 */
export async function POST(request: Request) {
  const guard = await watchStaff();
  if (guard.ok === false) return guard.response;
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  const fields = fieldsSchema.safeParse({
    url: form.get('url') || undefined,
    title: form.get('title') || undefined,
    sourceId: form.get('sourceId') || null,
  });
  if (!fields.success) return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  const { url, title, sourceId = null } = fields.data;
  const file = form.get('file');
  try {
    let id: string;
    if (file instanceof File) {
      id = await intakeFile(guard.ctx, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()), title, sourceId });
    } else if (url) {
      id = await intakeLink(guard.ctx, { url, title, sourceId });
    } else {
      return NextResponse.json({ error: 'Paste a link or choose a PDF.' }, { status: 400 });
    }
    await recordAuditEvent(guard.ctx, { action: 'watch.intake', summary: 'Added an official update by hand', metadata: { updateId: id } });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof WatchIntakeError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: publicErrorMessage(err, 'intake_failed') }, { status: 500 });
  }
}
