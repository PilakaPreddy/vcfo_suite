import { NextResponse } from 'next/server';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { requireAuth } from '@/auth/guards';
import { needUploadTarget, recordNeedUploads, undoNeedUpload } from '@/db/repositories/client-home';
import { bucketKey, deleteObject, putObject } from '@/storage/s3';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const MAX_BYTES = 10 * 1024 * 1024; // "PDF, JPG or PNG · up to 10 MB"
const ALLOWED = /^(application\/pdf|image\/(jpeg|png))$/;
/** Most files one upload may carry (G-09). */
const MAX_FILES = 10;

type Refusal = { fileName: string; error: string; status: number };

function checkFile(file: File): Refusal | null {
  if (file.size === 0) return { fileName: file.name, error: 'Choose a file to upload', status: 400 };
  if (file.size > MAX_BYTES) return { fileName: file.name, error: 'Files can be up to 10 MB', status: 413 };
  const type = file.type || 'application/octet-stream';
  if (!ALLOWED.test(type)) return { fileName: file.name, error: 'Upload a PDF, JPG or PNG', status: 415 };
  return null;
}

/**
 * POST /api/client/home/needs/[id]/upload (multipart, field `file`) — the
 * client uploads a file against an OPEN request (DECISIONS: uploads only
 * against open requests). Stored under `engagement-documents/<engagementId>/
 * requests/<requestId>/<ts>-<name>`, indexed in `documents` (shared with the
 * client) and the request is marked fulfilled.
 *
 * G-09: the form may repeat `file` (up to 10). Each file is checked on its own;
 * refused files come back in `rejected` with the reason and the rest are
 * stored. The response keeps `documentId` (the first document, also the Undo
 * handle for the whole batch) and `title`, and adds `documents`. One file in,
 * the old shape and status codes out.
 *
 * DELETE ?documentId= — Undo: reopen the request and remove the caller's own
 * upload (every file of that batch).
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  let target;
  try {
    target = await needUploadTarget(guard.ctx, id);
  } catch {
    return NextResponse.json({ error: 'This request is already closed' }, { status: 409 });
  }
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const tooLarge = rejectLargeBody(request, 25 * 1024 * 1024);
  if (tooLarge) return tooLarge;
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll('file') ?? []).filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'Choose a file to upload' }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Up to ${MAX_FILES} files at a time` }, { status: 400 });

  const rejected: Refusal[] = [];
  const accepted: File[] = [];
  for (const file of files) {
    const bad = checkFile(file);
    if (bad) rejected.push(bad);
    else accepted.push(file);
  }
  const refusals = rejected.map(({ fileName, error }) => ({ fileName, error }));
  if (accepted.length === 0) {
    const first = rejected[0]!;
    return NextResponse.json({ error: first.error, rejected: refusals }, { status: files.length === 1 ? first.status : 400 });
  }

  const stored: Array<{ objectKey: string; fileName: string; contentType: string; sizeBytes: number }> = [];
  const cleanUp = () => Promise.all(stored.map((f) => deleteObject(f.objectKey).catch(() => undefined)));
  try {
    for (const [i, file] of accepted.entries()) {
      const type = file.type || 'application/octet-stream';
      const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'upload';
      const path = `${target.dbId}/requests/${id}/${Date.now()}-${i}-${safe}`;
      const objectKey = bucketKey('engagement-documents', path);
      await putObject(objectKey, Buffer.from(await file.arrayBuffer()), type);
      stored.push({ objectKey, fileName: file.name, contentType: type, sizeBytes: file.size });
    }
    const saved = await recordNeedUploads(guard.ctx, id, stored);
    if (!saved || !saved.documents.length) {
      await cleanUp();
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, documentId: saved.documents[0]!.documentId, title: saved.title, documents: saved.documents, rejected: refusals },
      { status: 201 },
    );
  } catch (err) {
    await cleanUp();
    const message = publicErrorMessage(err, 'upload_failed');
    return NextResponse.json({ error: message === 'request_closed' ? 'This request is already closed' : 'upload_failed' }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  const documentId = new URL(request.url).searchParams.get('documentId')?.trim();
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });
  const undone = await undoNeedUpload(guard.ctx, id, documentId);
  if (!undone) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await Promise.all(undone.objectKeys.map((key) => deleteObject(key).catch(() => undefined)));
  return NextResponse.json({ ok: true });
}
