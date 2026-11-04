import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { findByCacheKey, listVerifications, recordDocument } from '@/db/repositories/labour-registers';
import { draftKey, GENERATOR_REVISION, hashRows, type AssumptionSet, type DocumentIdentity } from '@/lib/labour-registers/cache-key';
import { retentionYears } from '@/lib/labour-registers/catalogue';
import { ProjectionError, projectForm, type ProjectedTable } from '@/lib/labour-registers/project';
import { documentFileName, documentObjectKey, periodLabel } from '@/lib/labour-registers/storage';
import { isBuilt } from '@/lib/labour-registers/xlsx/layouts';
import { renderForForm } from '@/lib/labour-registers/xlsx/renderers';
import { templateVersionFor } from '@/lib/labour-registers/xlsx/version';
import { resolveVerification, verificationIndex } from '@/lib/labour-registers/verification';
import { loadBatchDataset } from '@/views/labour-registers/load-dataset';
import { EXTENSION_TO_MIME } from '@/lib/upload-limits';
import { putObject } from '@/storage/s3';

/**
 * Build this batch's registers — or, far more often, find that they are already built.
 *
 * **A request is a cache lookup first and a build second.** Every form's content address is
 * computed from the data that form actually prints, and a document already stored under that
 * address is returned untouched: no render, no upload, no new row. That is the whole point of
 * the design, and this route is its first caller — until now `findByCacheKey` had none.
 *
 * The hash is taken **per form, over the rows that form prints**, not over the whole batch.
 * The difference matters: a night shift allowance appearing in the paysheet re-keys the wage
 * registers that print one and leaves the twenty-odd others answered from storage. Hashing the
 * dataset would rebuild everything for any change anywhere.
 *
 * Generation runs inline rather than as a job, which is this codebase's norm for a document a
 * person is waiting for. Twenty-nine sheets of a few hundred employees is seconds, and the
 * expensive part — reading and parsing four uploads — happens once for all of them.
 *
 * A form that cannot be produced honestly is reported, not fatal. Twenty-eight registers that
 * can be built should be built, and the one that cannot should say what it was short of.
 *
 * Nothing is generated before the period is closed: `recordDocument` refuses on an unlocked
 * batch, and this route refuses earlier with a clearer message.
 *
 * POST /api/labour-registers/generate  { batchId, formIds?, companyName? }
 *   → { documents: [...], blocked: [...], deferred: [...] }
 */
export const maxDuration = 300;

const bodySchema = z.object({
  batchId: z.string().min(1).max(64),
  /** Build only these forms. Left out, everything the period calls for. */
  formIds: z.array(z.string().min(1).max(64)).max(64).optional(),
  /** The establishment name to print, where the caller knows it. */
  companyName: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });

  const loaded = await loadBatchDataset(guard.ctx, body.data.batchId, { companyName: body.data.companyName });
  if (!loaded) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { batch, period, forms, dataset, sources } = loaded;
  if (!batch.markedReadyAt) {
    return NextResponse.json(
      { error: 'Mark the inputs ready before generating. Nothing is built from a half-gathered month.' },
      { status: 409 },
    );
  }

  const wanted = body.data.formIds ? new Set(body.data.formIds) : null;
  const assumptions = (batch.assumptions ?? { fullAttendanceAssumed: false }) as AssumptionSet;
  const generatedAt = new Date().toISOString();
  const label = periodLabel(period);

  /* The firm's own verdicts, read once for the whole batch. A form with no row keeps the
     catalogue's claim, which is the common case and costs nothing. */
  const verdicts = verificationIndex(await listVerifications(guard.ctx));

  const documents: Array<{ formId: string; documentId: string; fileName: string; built: boolean }> = [];
  const blocked: Array<{ formId: string; reason: string }> = [];
  const deferred: Array<{ formId: string; reason: string }> = [];
  const suppressed: Array<{ formId: string; reason: string }> = [];

  for (const form of forms) {
    if (wanted && !wanted.has(form.id)) continue;
    if (!isBuilt(form.archetype)) {
      deferred.push({ formId: form.id, reason: `The ${form.archetype} archetype is not built yet.` });
      continue;
    }

    /* The firm has decided this register is not one it owes. Reported rather than skipped
       silently: a gap in an act's folder that nobody can account for is worse than a line
       saying who decided it was not needed and why. */
    const verdict = resolveVerification(form, verdicts);
    if (verdict.suppressed) {
      suppressed.push({
        formId: form.id,
        reason: verdict.suppressedReason || 'The firm has recorded that this register does not apply.',
      });
      continue;
    }

    let table: ProjectedTable;
    try {
      table = projectForm(form, dataset);
    } catch (e) {
      if (e instanceof ProjectionError) {
        blocked.push({ formId: form.id, reason: e.message });
        continue;
      }
      throw e;
    }

    /* The content address, over this form's own rows. `hashRows` sorts the field list itself,
       so the order columns happen to be in cannot change the key. */
    const fields = table.columns.map((c) => (c.day === undefined ? c.field : `day-${c.day}`));
    const rowObjects = table.rows.map((values) =>
      Object.fromEntries(values.map((v, i) => [fields[i], v])),
    );

    const identity: DocumentIdentity = {
      engagementId: batch.engagementId,
      jurisdiction: form.jurisdiction,
      formId: form.id,
      period: period.from.slice(0, 7) === period.to.slice(0, 7) ? period.from.slice(0, 7) : `${period.from}..${period.to}`,
      inputsHash: hashRows(rowObjects, fields),
      templateVersion: templateVersionFor(form, verdict.fromFirm ? verdict : undefined),
      assumptions,
      locale: batch.locale,
      timeZone: batch.timeZone,
    };
    const cacheKey = draftKey(identity);

    const hit = await findByCacheKey(guard.ctx, batch.id, form.id, cacheKey, 'xlsx');
    if (hit) {
      documents.push({ formId: form.id, documentId: hit.id, fileName: documentFileName(form, period), built: false });
      continue;
    }

    const buffer = await renderForForm(table, {
      establishment: dataset.master,
      periodLabel: label,
      generatedAt,
      generatorRevision: GENERATOR_REVISION,
      cacheKey,
      verification: verdict.fromFirm ? verdict : undefined,
    });

    const objectKey = documentObjectKey({
      engagementId: batch.engagementId,
      batchId: batch.id,
      formId: form.id,
      cacheKey,
      format: 'xlsx',
    });
    await putObject(objectKey, buffer, EXTENSION_TO_MIME.xlsx);

    /* Everything an evidence certificate needs, recorded at the moment it was true: what went
       in, what came out, under which mapping and which assumptions, and what printed nil. */
    const row = await recordDocument(guard.ctx, {
      batchId: batch.id,
      formId: form.id,
      cacheKey,
      objectKey,
      artifactSha256: createHash('sha256').update(buffer).digest('hex'),
      byteLength: buffer.byteLength,
      format: 'xlsx',
      templateVersion: identity.templateVersion,
      generatorRevision: GENERATOR_REVISION,
      manifest: {
        identity,
        mapping: dataset.mapping,
        sources,
        employees: dataset.employees.length,
        nilColumns: table.nil,
        notes: table.notes,
        orphanRows: dataset.orphans.length,
        verification: verdict,
      },
      retainUntil: String(new Date(period.to).getUTCFullYear() + retentionYears([form])),
    });
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    documents.push({ formId: form.id, documentId: row.id, fileName: documentFileName(form, period), built: true });
  }

  return NextResponse.json({
    documents,
    blocked,
    deferred,
    suppressed,
    builtCount: documents.filter((d) => d.built).length,
    fromStorage: documents.filter((d) => !d.built).length,
  });
}
