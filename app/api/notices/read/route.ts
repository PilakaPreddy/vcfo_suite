import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { createAskAttachment } from '@/db/repositories/ask-attachments';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { previewOpenNotice } from '@/lib/actions/compliance/open-notice';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import { NoticeReadError, readNotice } from '@/lib/notices/read-notice';
import { MAX_UPLOAD_BYTES, maxUploadSizeError } from '@/lib/upload-limits';
import { putObject } from '@/storage/s3';
import { routeActionContext, STAFF } from '../_respond';

const READABLE = new Set(['pdf', 'docx', 'txt', 'md']);

/**
 * POST /api/notices/read (multipart: file, engagementId) — the notice desk's intake. The file is
 * kept as the person's own attachment (the same store the chat uses, so `compliance.openNotice`
 * files it the same way), the notice reader fills the fields, and the answer is the review card
 * for the person to check, edit and approve with POST /api/notices. Nothing is saved to the
 * client's records here.
 */
export async function POST(request: Request) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const file = form.get('file');
  const engagementId = String(form.get('engagementId') ?? '').trim();
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose the notice file first.' }, { status: 400 });
  if (!engagementId) return NextResponse.json({ error: 'Choose the client first.' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: maxUploadSizeError() }, { status: 400 });
  const fileName = file.name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'notice.pdf';
  if (!READABLE.has(fileName.toLowerCase().split('.').pop() ?? '')) return NextResponse.json({ error: 'Upload the notice as a PDF, Word or text file.' }, { status: 400 });
  const access = await assertEngagementAccess(guard.ctx, engagementId);
  if (!access.ok) return NextResponse.json({ error: 'This client is not available.' }, { status: 404 });

  const data = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'application/octet-stream';
  const s3Key = `ask/attachments/${guard.ctx.userId}/${randomUUID()}/${fileName}`;
  await putObject(s3Key, data, contentType);
  const attachment = await createAskAttachment(guard.ctx, { kind: 'file', fileName, contentType, sizeBytes: file.size, s3Key });

  try {
    const { fields, usedModel } = await readNotice({ fileName, data, contentType });
    const input = Object.fromEntries(Object.entries({ engagementId, attachmentId: attachment.id, value: fileName, ...fields }).filter(([, v]) => v !== null && v !== ''));
    const draft = await previewOpenNotice(routeActionContext(guard.ctx), input as Parameters<typeof previewOpenNotice>[1]);
    const row = draft.rows[0]!;
    return NextResponse.json({
      attachmentId: attachment.id,
      fileName,
      fields,
      usedModel,
      review: { title: draft.title, tier: draft.tier, summary: row.displayNew, checks: row.checks, heldReason: row.heldReason ?? null },
    });
  } catch (e) {
    if (e instanceof NoticeReadError) return NextResponse.json({ attachmentId: attachment.id, fileName, error: e.message }, { status: 422 });
    console.error('[notices] read route failed', maskIdentityNumbers(e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ attachmentId: attachment.id, fileName, error: 'The notice could not be read. Fill in the details by hand.' }, { status: 422 });
  }
}
