import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAskAttachment, createDropAttachment, type DropAttachmentRefusal } from '@/db/repositories/ask-attachments';
import { READABLE_EXTENSIONS } from '@/lib/ask/data-router/read';
import { dropContentType, dropFileRefusal } from '@/lib/ask/drop/extensions';
import { requireAsk } from '@/lib/ask/route-guard';
import { DROP_MAX_BYTES, DROP_MAX_FILES, MAX_UPLOAD_BYTES, maxUploadSizeError } from '@/lib/upload-limits';
import { deleteObject, putObject } from '@/storage/s3';

const UUID = /^[0-9a-f-]{36}$/i;

const DROP_REFUSALS: Record<DropAttachmentRefusal, { status: number; error: string }> = {
  not_found: { status: 404, error: 'That drop was not found.' },
  started: { status: 409, error: 'This drop has already started. Start a new one to add more files.' },
  too_many_files: { status: 400, error: `A drop takes at most ${DROP_MAX_FILES} files.` },
  too_large: { status: 400, error: `A drop takes at most ${Math.round(DROP_MAX_BYTES / (1024 * 1024))} MB in all.` },
};

/** A folder path from the browser, cleaned: forward slashes, no climbing out, no absolute path. */
function cleanRelativePath(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  // eslint-disable-next-line no-control-regex
  const parts = raw.replace(/\\/g, '/').replace(/[\u0000-\u001f\u007f]/g, '').split('/').filter((p) => p && p !== '.' && p !== '..');
  return parts.length > 0 ? parts.join('/').slice(-500) : null;
}

/**
 * POST /api/ask/attachments: stores one file for the staff chat. Reading it happens at the next
 * message. With a `dropId` the file joins that drop instead: the drop must be the caller's and not yet
 * started, a ZIP or a macro-enabled workbook is also taken, the folder path is kept as a hint, and the
 * drop's 50-file and 200 MB totals are checked on the server for every file.
 */
export async function POST(request: Request) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  if (gate.ctx.role === 'client') return NextResponse.json({ error: 'Attachments are not available here.' }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file first.' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: maxUploadSizeError() }, { status: 400 });
  const fileName = file.name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'file';
  const rawDropId = form.get('dropId');
  const dropId = typeof rawDropId === 'string' && rawDropId.trim() ? rawDropId.trim() : null;

  if (dropId) {
    if (!UUID.test(dropId)) return NextResponse.json({ error: DROP_REFUSALS.not_found.error }, { status: 404 });
    const refusal = dropFileRefusal(fileName);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });
    const s3Key = `ask/attachments/${gate.ctx.userId}/${randomUUID()}/${fileName}`;
    const contentType = file.type && file.type !== 'application/octet-stream' ? file.type : dropContentType(fileName);
    await putObject(s3Key, Buffer.from(await file.arrayBuffer()), contentType);
    const added = await createDropAttachment(
      gate.ctx,
      { runId: dropId, fileName, contentType, sizeBytes: file.size, s3Key, relativePath: cleanRelativePath(form.get('relativePath')) },
      { maxFiles: DROP_MAX_FILES, maxBytes: DROP_MAX_BYTES },
    );
    if (added.ok === false) {
      await deleteObject(s3Key).catch((error) => console.warn('[ask-vcfo] refused drop file not removed', error));
      const { status, error } = DROP_REFUSALS[added.reason];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ id: added.row.id, fileName: added.row.fileName });
  }

  if (!READABLE_EXTENSIONS.has(fileName.toLowerCase().split('.').pop() ?? '')) {
    return NextResponse.json({ error: 'I can read PDF, Word, Excel, CSV, text and image files.' }, { status: 400 });
  }
  const s3Key = `ask/attachments/${gate.ctx.userId}/${randomUUID()}/${fileName}`;
  const contentType = file.type || 'application/octet-stream';
  await putObject(s3Key, Buffer.from(await file.arrayBuffer()), contentType);
  const row = await createAskAttachment(gate.ctx, { kind: 'file', fileName, contentType, sizeBytes: file.size, s3Key });
  return NextResponse.json({ id: row.id, fileName: row.fileName });
}
