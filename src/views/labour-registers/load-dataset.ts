import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getBatch, getColumnMap, listUploads, type BatchRow } from '@/db/repositories/labour-registers';
import type { AssumptionSet } from '@/lib/labour-registers/cache-key';
import { formsFor, type Period } from '@/lib/labour-registers/catalogue';
import { buildDataset, EMPTY_ESTABLISHMENT, type Dataset, type EstablishmentMaster, type SlotInput } from '@/lib/labour-registers/dataset';
import { formatForFileName, UPLOAD_SLOTS, parseWorkbook, type UploadSlot } from '@/lib/labour-registers/parse';
import type { FormSpec } from '@/data/labour-registers/types';
import { getObjectBuffer } from '@/storage/s3';

/**
 * Everything a batch's registers are built from, assembled once.
 *
 * Reading the four uploads out of storage and parsing them is the expensive part of generating
 * a month, and it is the same work for every form. So it happens once here and twenty-nine
 * projections run off the result. Doing it per form would mean parsing the same workbook
 * twenty-nine times.
 *
 * A slot whose object has gone missing from storage is skipped rather than fatal. The row
 * saying it was uploaded stays, `assessReadiness` reports what is absent, and the close blocks
 * — which is the same outcome as never having uploaded it, reached without a 500.
 */
export interface LoadedBatch {
  batch: BatchRow;
  period: Period;
  forms: FormSpec[];
  dataset: Dataset;
  /** What each slot's file was called, for the evidence manifest. */
  sources: Array<{ slot: UploadSlot; fileName: string; objectKey: string; sha256: string }>;
}

const SLOTS: UploadSlot[] = [...UPLOAD_SLOTS];

/**
 * The establishment's own values.
 *
 * They are carried on the batch's `assumptions`, which means they are part of every document's
 * cache key — so correcting a shift time rebuilds exactly the registers that print one, and
 * nothing else. That is why there is no separate table for them.
 */
function establishmentOf(batch: BatchRow, companyName: string): EstablishmentMaster {
  const stored = ((batch.assumptions ?? {}) as { establishment?: Partial<EstablishmentMaster> }).establishment ?? {};
  return { ...EMPTY_ESTABLISHMENT, name: companyName, ...stored };
}

export async function loadBatchDataset(
  ctx: AuthContext,
  batchId: string,
  options: { companyName?: string } = {},
): Promise<LoadedBatch | null> {
  const batch = await getBatch(ctx, batchId);
  if (!batch) return null;

  const period: Period = { from: batch.periodFrom, to: batch.periodTo };
  const assumptions = (batch.assumptions ?? { fullAttendanceAssumed: false }) as AssumptionSet;
  const forms = formsFor(batch.stateCode, period, assumptions.sphere ?? 'state');

  const [uploads, ...maps] = await Promise.all([
    listUploads(ctx, batch.id),
    ...SLOTS.map((slot) => getColumnMap(ctx, batch.engagementId, slot)),
  ]);
  const mapBySlot = new Map(SLOTS.map((slot, i) => [slot, maps[i]]));

  const slots: Partial<Record<UploadSlot, SlotInput>> = {};
  const sources: LoadedBatch['sources'] = [];

  await Promise.all(
    uploads.map(async (upload) => {
      const slot = upload.slot as UploadSlot;
      if (!SLOTS.includes(slot)) return;

      const bytes = await getObjectBuffer(upload.objectKey);
      if (!bytes) return;

      const sheet = await parseWorkbook(bytes, {
        format: formatForFileName(upload.fileName),
        preferSheet: upload.sheetName || undefined,
      });

      const stored = mapBySlot.get(slot);
      slots[slot] = {
        sheet,
        mapping: (stored?.mapping ?? {}) as Record<string, string>,
        valueMaps: (stored?.valueMaps ?? {}) as Record<string, Record<string, string>>,
      };
      sources.push({ slot, fileName: upload.fileName, objectKey: upload.objectKey, sha256: upload.sha256 });
    }),
  );

  const dataset = buildDataset({
    period,
    slots,
    assumptions,
    forms,
    master: establishmentOf(batch, options.companyName ?? ''),
  });

  sources.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return { batch, period, forms, dataset, sources };
}
