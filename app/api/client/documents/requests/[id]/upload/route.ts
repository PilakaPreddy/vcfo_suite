import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { requireAuth } from '@/auth/guards';
import {
  ClientDocumentsForbiddenError,
  MAX_FILES_PER_REQUEST_UPLOAD,
  undoRequestUpload,
  uploadRequestFiles,
  UploadRejectedError,
} from '@/db/repositories/client-documents';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/client/documents/requests/[id]/upload (multipart `file`) — the
 * client answers one of its own OPEN document requests. The file is stored in
 * S3, earlier files of the request become "Replaced", the request turns
 * "uploaded" and the lead gets the existing `client_uploaded` e-mail.
 *
 * G-09: the form may carry several `file` entries (up to 10). Each is checked
 * on its own; the response keeps `fileId` (the first stored file, which is also
 * the Undo handle for the whole batch) and adds `files` and `rejected`, so a
 * caller that sends one file sees exactly the old shape. When every file is
 * refused the response is 422 with the first reason, as before.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  let form: FormData;
  try {
    const tooLarge = rejectLargeBody(request, 25 * 1024 * 1024);
    if (tooLarge) return tooLarge;
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }
  const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST_UPLOAD) {
    return NextResponse.json({ error: `Up to ${MAX_FILES_PER_REQUEST_UPLOAD} files at a time` }, { status: 400 });
  }
  try {
    const out = await uploadRequestFiles(
      guard.ctx,
      id,
      await Promise.all(
        files.map(async (file) => ({ name: file.name, type: file.type, size: file.size, bytes: Buffer.from(await file.arrayBuffer()) })),
      ),
    );
    if (!out) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (out.fileIds.length === 0) {
      return NextResponse.json({ error: out.rejected[0]?.error ?? 'Upload failed', rejected: out.rejected }, { status: 422 });
    }
    const email = await notifyEngagementEventSoon({
      engagementId: out.engagementId,
      itemId: 'document-request',
      event: 'client_uploaded',
      requestLabel: out.requestLabel,
      actorUserId: guard.ctx.userId,
    }).catch(() => null);
    return NextResponse.json({ ok: true, fileId: out.fileIds[0], files: out.files, rejected: out.rejected, email }, { status: 201 });
  } catch (e) {
    if (e instanceof UploadRejectedError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof ClientDocumentsForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('[client-documents] upload failed', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

/** DELETE /api/client/documents/requests/[id]/upload?file= — Undo (own upload batch, within 10 minutes). */
export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const fileId = new URL(request.url).searchParams.get('file')?.trim() ?? '';
  if (!fileId) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  try {
    const ok = await undoRequestUpload(guard.ctx, id, fileId);
    if (!ok) return NextResponse.json({ error: 'cannot_undo' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ClientDocumentsForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'undo_failed' }, { status: 500 });
  }
}
