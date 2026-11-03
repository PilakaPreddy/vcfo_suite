import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireAnyRole } from '@/auth/guards';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { getBatch, recordUpload } from '@/db/repositories/labour-registers';
import { formatForFileName, parseWorkbook, type UploadSlot } from '@/lib/labour-registers/parse';
import {
  LABOUR_REGISTER_EXTENSIONS,
  LABOUR_REGISTER_FILE_ERROR,
  LABOUR_REGISTER_MIME_TYPES,
  labourRegisterContentType,
  MAX_UPLOAD_BYTES,
  validateUploadFileType,
} from '@/lib/upload-limits';
import { putObject } from '@/storage/s3';

/**
 * Upload one of a batch's four inputs.
 *
 * The file is read before it is stored, not after, and that ordering is the point: a workbook
 * whose headings cannot be found is refused at the upload rather than accepted and discovered
 * to be useless at the close. What comes back is what the reader made of it — the sheet it
 * chose, the row it found the headings on, the headings themselves and the row count — so the
 * preparer can see immediately whether it read the right thing.
 *
 * The headings are stored as well as returned. Next month's upload is diffed against them
 * (`shape-diff.ts`), which is how a mapping survives a payroll system changing a column name.
 *
 * One file per slot: `recordUpload` upserts on `(batchId, slot)`, so re-uploading replaces
 * rather than accumulating. The bytes go to S3 under a raw key; only the key is stored.
 *
 * Staff only. A client may read a batch and never write to one.
 *
 * POST /api/labour-registers/upload  multipart: `batchId`, `slot`, `file`, optional `sheet`
 *   → { upload, parsed: { sheetName, headerRow, headers, rowCount, grid } }
 */
const SLOTS: UploadSlot[] = ['paysheet', 'attendance', 'overtime', 'employees'];

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const tooLarge = rejectLargeBody(request, MAX_UPLOAD_BYTES);
  if (tooLarge) return tooLarge;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid_form' }, { status: 400 });

  const batchId = form.get('batchId');
  const slot = form.get('slot');
  const file = form.get('file');
  const sheet = form.get('sheet');

  if (typeof batchId !== 'string' || !batchId) return NextResponse.json({ error: 'batch_required' }, { status: 400 });
  if (typeof slot !== 'string' || !SLOTS.includes(slot as UploadSlot)) {
    return NextResponse.json({ error: 'invalid_slot' }, { status: 400 });
  }
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'file_required' }, { status: 400 });

  const unsupported = validateUploadFileType(
    file,
    LABOUR_REGISTER_EXTENSIONS,
    LABOUR_REGISTER_MIME_TYPES,
    LABOUR_REGISTER_FILE_ERROR,
  );
  if (unsupported) return NextResponse.json({ error: unsupported }, { status: 400 });

  /* The batch is read through the repository, so a batch belonging to another firm is a 404
     here exactly as it is everywhere else. Locked periods stop accepting inputs: that is what
     the close means. */
  const batch = await getBatch(guard.ctx, batchId);
  if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (batch.markedReadyAt) {
    return NextResponse.json({ error: 'The period is closed. Reopen the inputs to change them.' }, { status: 409 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });

  let parsed;
  try {
    parsed = await parseWorkbook(bytes, {
      format: formatForFileName(file.name),
      preferSheet: typeof sheet === 'string' && sheet ? sheet : undefined,
    });
  } catch (e) {
    /* The reader's own message is the useful one — "The workbook has no sheet with any rows in
       it" tells a preparer more than a generic parse failure would. */
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The file could not be read.' }, { status: 400 });
  }
  if (parsed.headers.length === 0) {
    return NextResponse.json({ error: 'No column headings were found in that sheet.' }, { status: 400 });
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `labour-registers/${batch.engagementId}/${batch.id}/${slot}-${sha256.slice(0, 12)}`;
  await putObject(objectKey, bytes, labourRegisterContentType(file));

  const upload = await recordUpload(guard.ctx, {
    batchId: batch.id,
    slot: slot as UploadSlot,
    fileName: file.name,
    objectKey,
    sha256,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow,
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    gridDetection: parsed.grid,
  });
  if (!upload) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    upload: { id: upload.id, slot: upload.slot, fileName: upload.fileName, rowCount: upload.rowCount },
    parsed: {
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      grid: parsed.grid,
    },
  });
}
