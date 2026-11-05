import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireAnyRole } from '@/auth/guards';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { formById } from '@/data/labour-registers/forms';
import {
  LABOUR_REGISTER_EVIDENCE_EXTENSIONS,
  LABOUR_REGISTER_EVIDENCE_FILE_ERROR,
  LABOUR_REGISTER_EVIDENCE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  resolveUploadContentType,
  validateUploadFileType,
} from '@/lib/upload-limits';
import { putObject } from '@/storage/s3';

/**
 * Store the document a verification rests on, and hand back its key.
 *
 * Split from the verdict itself so that the verdict stays a plain JSON write. The upload comes
 * first, the key it returns goes into the verdict, and a verdict saved without one is still a
 * verdict — a secretary who has read the gazette on a government website and recorded that may
 * have nothing to attach.
 *
 * The key is not engagement-scoped, unlike every other labour-register object. A gazette page
 * is not a client's document: one copy answers the question for every client in that state, and
 * filing it under whichever engagement happened to prompt the check would hide it from the
 * rest. It is content-addressed, so uploading the same scan twice stores it once.
 *
 * POST /api/labour-registers/verification/evidence  multipart: `formId`, `file`
 *   → { evidenceKey, evidenceFileName }
 */
export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const tooLarge = rejectLargeBody(request, MAX_UPLOAD_BYTES);
  if (tooLarge) return tooLarge;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid_form' }, { status: 400 });

  const formId = form.get('formId');
  const file = form.get('file');
  if (typeof formId !== 'string' || !formById(formId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'file_required' }, { status: 400 });

  const unsupported = validateUploadFileType(
    file,
    LABOUR_REGISTER_EVIDENCE_EXTENSIONS,
    LABOUR_REGISTER_EVIDENCE_MIME_TYPES,
    LABOUR_REGISTER_EVIDENCE_FILE_ERROR,
  );
  if (unsupported) return NextResponse.json({ error: unsupported }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const evidenceKey = `labour-registers/verification/${formId}/${sha256.slice(0, 16)}`;
  await putObject(
    evidenceKey,
    bytes,
    resolveUploadContentType(file, LABOUR_REGISTER_EVIDENCE_EXTENSIONS) ?? 'application/octet-stream',
  );

  return NextResponse.json({ evidenceKey, evidenceFileName: file.name });
}
