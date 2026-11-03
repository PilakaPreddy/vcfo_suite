import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getBatch, getColumnMap, listUploads } from '@/db/repositories/labour-registers';
import { fieldLabel } from '@/data/labour-registers/fields';
import { formsFor, inputFields, optionalFields, requiredFields } from '@/lib/labour-registers/catalogue';
import { gridIndices, type GridDetection } from '@/lib/labour-registers/attendance-grid';
import { matchColumns, matchSummary, type FieldMatch } from '@/lib/labour-registers/match';
import { normaliseHeader } from '@/lib/labour-registers/normalise';
import { describeShapeDiff, diffShape } from '@/lib/labour-registers/shape-diff';
import { formatForFileName, parseWorkbook, type UploadSlot } from '@/lib/labour-registers/parse';
import { matchValues, unresolvedValues, type ValueMatch } from '@/lib/labour-registers/value-map';
import { getObjectBuffer } from '@/storage/s3';
import type { MappingView, MappingRow, ValueRow } from './MappingPage';

/**
 * Everything the reconciliation screen needs, worked out on the server.
 *
 * The matching itself is `match.ts`, which is already written and tested. What happens here is
 * the part that decides whether the screen is any work at all:
 *
 *  - A mapping remembered for this client is handed to the matcher as `remembered`, which
 *    claims those headings before anything is scored. Last month's decisions stand.
 *  - The headings are diffed against the ones the mapping was last confirmed against, so the
 *    screen can open by saying "same columns as last month" instead of making somebody look.
 *  - **Every suggestion arrives pre-selected.** A row nobody has to touch is the point; the
 *    owner's requirement is that nothing is manual, and a blank dropdown waiting to be filled
 *    is exactly the manual step being objected to.
 *
 * `complete` is what lets the screen be skipped entirely: when nothing is unresolved and the
 * shape has not moved, there is nothing to ask and the caller goes straight on.
 */

/** The day columns are mapped as a block, not one by one, so they are kept out of matching. */
function excludedIndices(grid: unknown): number[] {
  const detection = grid as GridDetection | null;
  return detection?.found ? gridIndices(detection) : [];
}

function toRow(match: FieldMatch, required: Set<string>): MappingRow {
  return {
    field: match.field,
    label: fieldLabel(match.field),
    required: required.has(match.field),
    bucket: match.bucket,
    reason: match.reason,
    /* Pre-selected for `auto` and `suggested` alike. Only a field with no candidate at all
       arrives empty, and that is the one row genuinely asking for a decision. */
    chosen: match.chosen?.header ?? '',
    candidates: match.candidates.map((c) => c.header),
  };
}

function toValueRow(match: ValueMatch): ValueRow {
  return {
    source: match.source,
    count: match.count,
    bucket: match.bucket,
    chosen: match.target ?? match.candidates[0] ?? '',
    candidates: match.candidates,
  };
}

export async function loadMappingView(
  ctx: AuthContext,
  batchId: string,
  slot: UploadSlot,
): Promise<MappingView | null> {
  const batch = await getBatch(ctx, batchId);
  if (!batch) return null;

  const [uploads, stored] = await Promise.all([
    listUploads(ctx, batch.id),
    getColumnMap(ctx, batch.engagementId, slot),
  ]);
  const upload = uploads.find((u) => u.slot === slot);
  if (!upload) return null;

  const headers = (upload.headers ?? []) as string[];
  const period = { from: batch.periodFrom, to: batch.periodTo };
  const forms = formsFor(batch.stateCode, period);

  /* Only what this slot can supply. Asking a paysheet for a leave balance would put a row on
     the screen that nobody can answer from the file in front of them. */
  const wanted = inputFields(forms);
  const required = new Set(requiredFields(forms));
  const optional = new Set(optionalFields(forms));

  const remembered = (stored?.mapping ?? {}) as Record<string, string>;
  const rememberedNormalised = Object.fromEntries(
    Object.entries(remembered).map(([field, heading]) => [field, normaliseHeader(heading)]),
  );

  const matches = matchColumns({
    fields: wanted,
    headers,
    remembered: rememberedNormalised,
    exclude: excludedIndices(upload.gridDetection),
  });

  const rows = matches.map((m) => toRow(m, required));
  const summary = matchSummary(matches);

  /* The shape diff, against the headings the mapping was last confirmed on. A first upload has
     nothing to compare with, and says so rather than claiming everything is new. */
  const lastHeaders = (stored?.lastHeaders ?? []) as string[];
  const diff = lastHeaders.length > 0 ? diffShape(lastHeaders, headers, remembered) : null;

  /* Attendance codes, where this slot carries a day block. They are a separate reconciliation
     from the columns and the close blocks on an unmatched one. */
  let values: ValueRow[] = [];
  let unresolved = 0;
  const detection = upload.gridDetection as GridDetection | null;
  if (detection?.found) {
    const bytes = await getObjectBuffer(upload.objectKey);
    if (bytes) {
      const parsed = await parseWorkbook(bytes, {
        format: formatForFileName(upload.fileName),
        preferSheet: upload.sheetName || undefined,
      });
      const seen = new Set<string>();
      for (const row of parsed.rows) {
        for (const day of detection.days) {
          const heading = parsed.headers[day.index];
          const raw = (heading !== undefined ? row[heading] : undefined)?.trim();
          if (raw) seen.add(raw);
        }
      }
      const matched = matchValues('attendanceGrid', seen);
      values = matched.map(toValueRow);
      unresolved = unresolvedValues(matched).length;
    }
  }

  const missingRequired = rows.filter((r) => r.required && !r.chosen).length;

  return {
    batchId: batch.id,
    slot,
    fileName: upload.fileName,
    sheetName: upload.sheetName,
    headers,
    rows,
    values,
    counts: { ...summary, required: required.size, optional: optional.size, unresolvedValues: unresolved },
    /* Nothing to ask: every required column is filled, nothing is unresolved, and the file's
       shape has not moved since the mapping was confirmed. */
    complete: missingRequired === 0 && unresolved === 0 && summary.none === 0,
    shapeNote: diff ? describeShapeDiff(diff) : null,
    unchanged: diff ? diff.unchanged : false,
    locked: Boolean(batch.markedReadyAt),
  };
}
