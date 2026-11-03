import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { batchProvenance, getBatch, getColumnMap, listDocuments, listUploads } from '@/db/repositories/labour-registers';
import { formsFor, optionalFields, requiredFields } from '@/lib/labour-registers/catalogue';
import { assessReadiness, closeSentence } from '@/lib/labour-registers/readiness';
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
  const forms = formsFor(batch.stateCode, period);

  const [provenance, uploads, documents, map] = await Promise.all([
    batchProvenance(ctx, batch.id),
    listUploads(ctx, batch.id),
    listDocuments(ctx, batch.id),
    getColumnMap(ctx, batch.engagementId, 'paysheet'),
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
  const assumptions = (batch.assumptions ?? {}) as { fullAttendanceAssumed?: boolean };

  const summary = assessReadiness({
    forms,
    uploads: bySlot,
    attendanceAssumed: Boolean(assumptions.fullAttendanceAssumed),
    requiredFields: requiredFields(forms),
    mappedFields: [...mapped],
    /* Value mapping is not stored per batch yet, so nothing is reported as unresolved here.
       When it is, read it from the column map's `valueMaps` and count what has no target. */
    unresolvedValues: 0,
    employees: bySlot.paysheet?.rowCount ?? 0,
    /* The employee record is not wired to this screen yet, so no shortfall is claimed rather
       than a zero being presented as a verified count. */
    employeesShort: 0,
    /* An optional column with nothing mapped to it prints nil. It is reported, not blocked —
       not every payroll runs a night shift allowance. */
    optionalUnmapped: optionalFields(forms).filter((key) => !mapped.has(key)),
    /* Minimum wage coverage is not wired to this screen yet, so nothing is claimed rather
       than a zero being presented as a verified count. */
    overtimeCoverageUnresolved: 0,
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
    /* The current document per form. `listDocuments` is newest first, and a superseded
       document keeps its row, so the first seen for a form is the one to offer. */
    documents: documents.reduce<Array<{ id: string; formId: string; byteLength: number; format: string }>>(
      (acc, d) => {
        if (acc.some((x) => x.formId === d.formId)) return acc;
        acc.push({ id: d.id, formId: d.formId, byteLength: d.byteLength, format: d.format });
        return acc;
      },
      [],
    ),
    readiness: summary,
    sentence: closeSentence(summary, period),
  };
}
