import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAnyRole } from '@/auth/guards';
import { knowledgeBankObjectPath } from '@/lib/knowledge-bank/knowledge-bank-storage';
import { resolveUploadContentType } from '@/lib/upload-limits';
import { KNOWLEDGE_BANK_EXTENSIONS } from '@/lib/upload-limits';
import { bucketKey, putObject } from '@/storage/s3';
import { publicErrorMessage } from '@/lib/api-error';

/** POST /api/knowledge-bank/upload — browser uploads bytes; returns storage path + file id. */
export async function POST(request: Request) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  // Prefer server-generated id — browsers on http://LAN-IP lack crypto.randomUUID().
  const fromClient = String(form.get('fileId') ?? '').trim();
  const fileId =
    fromClient && /^[0-9a-f-]{36}$/i.test(fromClient) ? fromClient : randomUUID();

  const path = knowledgeBankObjectPath(fileId, file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = resolveUploadContentType(file, KNOWLEDGE_BANK_EXTENSIONS);

  try {
    await putObject(bucketKey('knowledge-bank', path), bytes, contentType);
    return NextResponse.json({ path, fileId });
  } catch (err) {
    const message = publicErrorMessage(err, 'upload_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
