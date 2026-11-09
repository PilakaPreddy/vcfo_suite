import 'server-only';

import { createHash } from 'node:crypto';
import type { AuthContext } from '@/auth/guards';
import { recordUpload, type BatchRow, type UploadRow } from '@/db/repositories/labour-registers';
import { publicErrorMessage } from '@/lib/api-error';
import { labourRegisterContentType } from '@/lib/upload-limits';
import { putObject } from '@/storage/s3';
import { formatForFileName, parseWorkbook, type ParsedSheet, type UploadSlot } from './parse';

/**
 * Storing one of a batch's input sheets. The upload route and the Ask VCFO action
 * `labour.uploadSheet` both call this, so there is one copy of the rules:
 *
 *  - a closed batch (`markedReadyAt`) takes no new input;
 *  - the file is read before it is stored, and a workbook without headings is refused;
 *  - the bytes go to S3 under `labour-registers/{engagement}/{batch}/{slot}-{sha12}`;
 *  - `recordUpload` upserts on (batch, slot), so a second upload replaces the first.
 */

/** A refusal the caller shows as it is. `status` is the HTTP status the upload route answers with. */
export class RegisterUploadRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = 'RegisterUploadRefused';
  }
}

export const CLOSED_PERIOD_MESSAGE = 'The period is closed. Reopen the inputs to change them.';

export interface RegisterSheetSummary {
  sheetName: string;
  headerRow: number;
  headers: string[];
  rowCount: number;
  grid: ParsedSheet['grid'];
}

/**
 * Reads a sheet the way an upload does, without storing anything. The action's preview uses it to
 * show the row count and the headings before the person approves.
 */
export async function readRegisterSheet(bytes: Uint8Array, fileName: string, sheet?: string): Promise<{ parsed: ParsedSheet; summary: RegisterSheetSummary }> {
  if (bytes.byteLength === 0) throw new RegisterUploadRefused('The file is empty.', 400);
  let parsed: ParsedSheet;
  try {
    parsed = await parseWorkbook(bytes, { format: formatForFileName(fileName), preferSheet: sheet || undefined });
  } catch (e) {
    /* The reader's own message is the useful one: "The workbook has no sheet with any rows in it"
       tells a preparer more than a generic parse failure would. */
    throw new RegisterUploadRefused(publicErrorMessage(e, 'The file could not be read.'), 400);
  }
  if (parsed.headers.length === 0) throw new RegisterUploadRefused('No column headings were found in that sheet.', 400);
  return {
    parsed,
    summary: { sheetName: parsed.sheetName, headerRow: parsed.headerRow, headers: parsed.headers, rowCount: parsed.rows.length, grid: parsed.grid },
  };
}

export interface IngestedUpload {
  upload: UploadRow;
  parsed: RegisterSheetSummary;
  sha256: string;
}

export async function ingestRegisterUpload(
  ctx: AuthContext,
  input: { batch: BatchRow; slot: UploadSlot; bytes: Uint8Array; fileName: string; contentType?: string; sheet?: string },
): Promise<IngestedUpload> {
  const { batch, slot, bytes, fileName } = input;
  if (batch.markedReadyAt) throw new RegisterUploadRefused(CLOSED_PERIOD_MESSAGE, 409);
  const { summary } = await readRegisterSheet(bytes, fileName, input.sheet);

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `labour-registers/${batch.engagementId}/${batch.id}/${slot}-${sha256.slice(0, 12)}`;
  await putObject(objectKey, bytes, input.contentType || labourRegisterContentType({ name: fileName, type: '' }));

  const upload = await recordUpload(ctx, {
    batchId: batch.id,
    slot,
    fileName,
    objectKey,
    sha256,
    sheetName: summary.sheetName,
    headerRow: summary.headerRow,
    headers: summary.headers,
    rowCount: summary.rowCount,
    gridDetection: summary.grid,
  });
  if (!upload) throw new RegisterUploadRefused('not_found', 404);
  return { upload, parsed: summary, sha256 };
}
