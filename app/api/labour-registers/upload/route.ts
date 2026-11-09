import { NextResponse } from 'next/server';

import { requireAnyRole } from '@/auth/guards';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { getBatch } from '@/db/repositories/labour-registers';
import { ingestRegisterUpload, RegisterUploadRefused } from '@/lib/labour-registers/ingest-upload';
import { UPLOAD_SLOTS, type UploadSlot } from '@/lib/labour-registers/parse';
import {
  LABOUR_REGISTER_EXTENSIONS,
  LABOUR_REGISTER_FILE_ERROR,
  LABOUR_REGISTER_MIME_TYPES,
  labourRegisterContentType,
  MAX_UPLOAD_BYTES,
  validateUploadFileType,
} from '@/lib/upload-limits';

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
const SLOTS: UploadSlot[] = [...UPLOAD_SLOTS];

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
     the close means, and `ingestRegisterUpload` refuses them. */
  const batch = await getBatch(guard.ctx, batchId);
  if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  let ingested;
  try {
    ingested = await ingestRegisterUpload(guard.ctx, {
      batch,
      slot: slot as UploadSlot,
      bytes,
      fileName: file.name,
      contentType: labourRegisterContentType(file),
      sheet: typeof sheet === 'string' && sheet ? sheet : undefined,
    });
  } catch (e) {
    if (e instanceof RegisterUploadRefused) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { upload, parsed } = ingested;

  return NextResponse.json({
    upload: { id: upload.id, slot: upload.slot, fileName: upload.fileName, rowCount: upload.rowCount },
    parsed: {
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
      headers: parsed.headers,
      rowCount: parsed.rowCount,
      grid: parsed.grid,
    },
  });
}
