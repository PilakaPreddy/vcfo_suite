import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { batchProvenance, getBatch, getColumnMap, listDocuments, listUploads } from '@/db/repositories/labour-registers';
import { formsFor, formsNeedingAttendance, optionalFields, requiredFields } from '@/lib/labour-registers/catalogue';
import { employeesShort, undecidedCoverage } from '@/lib/labour-registers/dataset';
import { formatForFileName, gridValues, parseWorkbook } from '@/lib/labour-registers/parse';
import { assessReadiness, closeSentence } from '@/lib/labour-registers/readiness';
import { unresolvedCodeCount } from '@/lib/labour-registers/value-map';
import { getObjectBuffer } from '@/storage/s3';
import { loadBatchDataset } from '@/lib/labour-registers/load-dataset';
import type { BatchView } from './BatchPage';

/**
 * Assemble everything the batch screen needs, server side, and hand the view plain data.
 *
 * Plain is the operative word. The view is a client component, so only serialisable values
 * cross the boundary — no repository rows, no dates, no functions. Passing a Lucide icon
 * across that line is what broke this feature's first screen in production.
 */
export async function loadBatchView(ctx: AuthContext, batchId: string): Promise<BatchView | null> {
  const batch = await getBatch(ctx, batchId);
  if (!batch) return null;

  const period = { from: batch.periodFrom, to: batch.periodTo };
  const assumptions = (batch.assumptions ?? {}) as { fullAttendanceAssumed?: boolean; sphere?: 'state' | 'central' };
  const forms = formsFor(batch.stateCode, period, assumptions.sphere ?? 'state');

  const [provenance, uploads, documents, map, attendanceMap] = await Promise.all([
    batchProvenance(ctx, batch.id),
    listUploads(ctx, batch.id),
    listDocuments(ctx, batch.id),
    getColumnMap(ctx, batch.engagementId, 'paysheet'),
    getColumnMap(ctx, batch.engagementId, 'attendance'),
  ]);

  const bySlot: BatchView['uploads'] = {};
  for (const u of uploads) {
    /* The sheet and the heading row matter as much as the row count: a payroll workbook has
       thirteen sheets and a title row above the headings, so what the reader chose is the
       thing a preparer needs to see. `gridDetection` is stored as jsonb, hence the shape
       check rather than a cast. */
    const grid = u.gridDetection as { days?: unknown[] } | null;
    bySlot[u.slot as keyof BatchView['uploads']] = {
      fileName: u.fileName,
      rowCount: u.rowCount,
      sheetName: u.sheetName || undefined,
      headerRow: u.headerRow,
      gridDays: Array.isArray(grid?.days) ? grid.days.length : undefined,
    };
  }

  const mapping = (map?.mapping ?? {}) as Record<string, string>;
  const mapped = new Set(Object.keys(mapping));

  /*
   * Three of readiness's inputs need the rows themselves, not just the row counts.
   *
   * They used to be passed as constant zeros with a comment saying they were not wired yet,
   * and one of them — the count of attendance codes nobody has a target for — is a `blocked`
   * line with a fix link. Fed a zero it could never fire, so a preparer could close a month
   * whose muster rolls carried codes this product does not understand, and the dialog said
   * nothing. A gate that cannot fire is worse than no gate: the screen looks like it checked.
   *
   * So the dataset is read here, which costs the four uploads out of storage and a parse. It
   * is done only when a paysheet exists, because readiness already blocks without one and
   * these three counts are moot until it does.
   */
  let unresolvedValues = 0;
  let employeesMissingAField = 0;
  let coverageUndecided = 0;

  if (bySlot.paysheet) {
    const loaded = await loadBatchDataset(ctx, batch.id);
    if (loaded) {
      employeesMissingAField = employeesShort(loaded.dataset);
      coverageUndecided = undecidedCoverage(loaded.dataset);
    }

    const attendance = uploads.find((u) => u.slot === 'attendance');
    if (attendance) {
      const bytes = await getObjectBuffer(attendance.objectKey);
      if (bytes) {
        const parsed = await parseWorkbook(bytes, {
          format: formatForFileName(attendance.fileName),
          preferSheet: attendance.sheetName || undefined,
        });
        unresolvedValues = unresolvedCodeCount(
          gridValues(parsed),
          (attendanceMap?.valueMaps as Record<string, Record<string, string>> | undefined)?.attendanceGrid,
        );
      }
    }
  }

  const summary = assessReadiness({
    forms,
    uploads: bySlot,
    attendanceAssumed: Boolean(assumptions.fullAttendanceAssumed),
    requiredFields: requiredFields(forms),
    mappedFields: [...mapped],
    unresolvedValues,
    employees: bySlot.paysheet?.rowCount ?? 0,
    employeesShort: employeesMissingAField,
    /* An optional column with nothing mapped to it prints nil. It is reported, not blocked —
       not every payroll runs a night shift allowance. */
    optionalUnmapped: optionalFields(forms).filter((key) => !mapped.has(key)),
    overtimeCoverageUnresolved: coverageUndecided,
  });

  return {
    batchId: batch.id,
    stateCode: batch.stateCode,
    period,
    status: batch.status,
    locked: Boolean(batch.markedReadyAt),
    provenance: provenance
      ? {
          periodFrom: provenance.periodFrom,
          periodTo: provenance.periodTo,
          status: provenance.status,
          markedReadyAt: provenance.markedReadyAt,
          markedReadyByName: provenance.markedReadyByName,
          generatedAt: provenance.generatedAt,
          registers: provenance.registers,
          fromStorage: provenance.fromStorage,
          reopenCount: provenance.reopenCount,
          reopenReason: provenance.reopenReason,
        }
      : null,
    acts: new Set(forms.map((f) => f.act)).size,
    formsByAct: Object.entries(
      forms.reduce<Record<string, Array<{ id: string; formNumber: string; title: string; rule: string }>>>((acc, f) => {
        (acc[f.act] ??= []).push({ id: f.id, formNumber: f.formNumber, title: f.title, rule: f.rule });
        return acc;
      }, {}),
    ).map(([act, items]) => ({ act, forms: items })),
    uploads: bySlot,
    /* The current document per form **and format**. `listDocuments` is newest first, and a
       superseded document keeps its row, so the first seen for a pair is the one to offer.
       Keyed on both because a form now produces two files — the workbook somebody works from
       and the printout somebody signs — and keying on the form alone hid whichever came
       second. */
    documents: documents.reduce<
      Array<{
        id: string;
        formId: string;
        byteLength: number;
        format: string;
        status: string;
        attestedAt: string | null;
        signedByName: string;
        hasSignedCopy: boolean;
      }>
    >((acc, d) => {
      if (acc.some((x) => x.formId === d.formId && x.format === d.format)) return acc;
      acc.push({
        id: d.id,
        formId: d.formId,
        byteLength: d.byteLength,
        format: d.format,
        status: d.status,
        attestedAt: d.attestedAt ? d.attestedAt.toISOString().slice(0, 10) : null,
        signedByName: d.signedByName,
        hasSignedCopy: Boolean(d.signedObjectKey),
      });
      return acc;
    }, []),
    sphere: assumptions.sphere ?? 'state',
    /* What the choice costs or saves, so the card can say it rather than imply it. */
    centralFormCount: formsFor(batch.stateCode, period, 'central').filter((f) => f.regime !== 'state').length,
    needsAttendance: formsNeedingAttendance(forms).map((f) => `Form ${f.formNumber}`),
    attendanceAssumed: Boolean(assumptions.fullAttendanceAssumed),
    readiness: summary,
    sentence: closeSentence(summary, period),
  };
}
