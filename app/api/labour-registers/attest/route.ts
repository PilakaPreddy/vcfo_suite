import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireAnyRole } from '@/auth/guards';
import { rejectLargeBody } from '@/lib/api/body-limit';
import {
  attestDocument,
  getDocument,
  supersedeDocument,
} from '@/db/repositories/labour-registers';
import {
  LABOUR_REGISTER_EVIDENCE_EXTENSIONS,
  LABOUR_REGISTER_EVIDENCE_FILE_ERROR,
  LABOUR_REGISTER_EVIDENCE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  validateUploadFileType,
} from '@/lib/upload-limits';
import { putObject } from '@/storage/s3';

/**
 * Attest a register by uploading the signed printout.
 *
 * The firm's decision, taken in November 2026, is that a register is attested by a wet
 * signature on paper: the PDF is downloaded, signed and sealed, and the scan comes back here.
 * No DSC and no Aadhaar eSign. The schema has always held all three and this route is the one
 * the firm uses; the others are left unreachable rather than half-built, because an
 * attestation method nobody has tried is a claim about a signature.
 *
 * Multipart, in one call, and that is deliberate even though the verification evidence upload
 * is split in two. There, the file is optional and the text is the part that took the thought.
 * Here the file *is* the attestation: a row recording a signature with no scan behind it is
 * precisely the thing an attestation must never be.
 *
 * **It is a one-way door.** `attestDocument` refuses a second attestation, there is no route
 * that un-attests, and a correction is a new document that supersedes this one. That is the
 * rule a statutory record is kept under, and the repository enforces it rather than this route.
 *
 * Firm-wide admin only, enforced in the repository. This is the firm putting its name to a
 * statutory record, not a preparer finishing a task.
 *
 * POST /api/labour-registers/attest  multipart: `documentId`, `file`, `signedByName`,
 *                                    optional `supersedes`
 */
export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const tooLarge = rejectLargeBody(request, MAX_UPLOAD_BYTES);
  if (tooLarge) return tooLarge;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid_form' }, { status: 400 });

  const documentId = form.get('documentId');
  const file = form.get('file');
  const signedByName = form.get('signedByName');
  const supersedes = form.get('supersedes');

  if (typeof documentId !== 'string' || !documentId) {
    return NextResponse.json({ error: 'document_required' }, { status: 400 });
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json(
      { error: 'Upload the signed printout. An attestation without the signed page behind it is not one.' },
      { status: 400 },
    );
  }
  if (typeof signedByName !== 'string' || !signedByName.trim()) {
    return NextResponse.json(
      { error: 'Name whoever signed it. The register carries a signature; the record should say whose.' },
      { status: 400 },
    );
  }

  const unsupported = validateUploadFileType(
    file,
    LABOUR_REGISTER_EVIDENCE_EXTENSIONS,
    LABOUR_REGISTER_EVIDENCE_MIME_TYPES,
    LABOUR_REGISTER_EVIDENCE_FILE_ERROR,
  );
  if (unsupported) return NextResponse.json({ error: unsupported }, { status: 400 });

  const doc = await getDocument(guard.ctx, documentId);
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (doc.attestedAt) {
    return NextResponse.json(
      { error: 'This register is already attested. Issue a corrected one and supersede it.' },
      { status: 409 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });

  /* Beside the generated file, under the same batch, so the two halves of the record travel
     together. Content-addressed, so re-uploading the same scan stores it once. */
  const signedSha256 = createHash('sha256').update(bytes).digest('hex');
  const signedObjectKey = `labour-registers/${doc.batchId}/signed/${doc.formId}-${signedSha256.slice(0, 12)}`;
  await putObject(signedObjectKey, bytes, file.type || 'application/octet-stream');

  let row;
  try {
    row = await attestDocument(guard.ctx, {
      documentId: doc.id,
      method: 'printed-wet-signature',
      signedObjectKey,
      signedFileName: file.name,
      signedSha256,
      signedByName: signedByName.trim(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'not_attested' }, { status: 409 });
  }
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  /* A correction supersedes the register it corrects, in the same call. Doing it separately
     would leave a window in which two attested registers for one form and one period both
     stand, and nothing says which is current. */
  if (typeof supersedes === 'string' && supersedes && supersedes !== doc.id) {
    const older = await getDocument(guard.ctx, supersedes);
    if (!older) return NextResponse.json({ error: 'The register being superseded was not found.' }, { status: 404 });
    if (older.formId !== doc.formId || older.batchId !== doc.batchId) {
      return NextResponse.json(
        { error: 'A register can only supersede one of the same form in the same period.' },
        { status: 400 },
      );
    }
    await supersedeDocument(guard.ctx, older.id, doc.id);
  }

  return NextResponse.json({
    document: {
      id: row.id,
      status: row.status,
      attestedAt: row.attestedAt,
      attestationMethod: row.attestationMethod,
      signedFileName: row.signedFileName,
      signedByName: row.signedByName,
    },
  });
}
