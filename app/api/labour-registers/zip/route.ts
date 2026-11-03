import { NextResponse } from 'next/server';

import { requireAuth } from '@/auth/guards';
import { contentDisposition, openObjectStream } from '../../documents/_lib/object-response';
import { getBatch, listDocuments } from '@/db/repositories/labour-registers';
import { formById } from '@/data/labour-registers/forms';
import { stateByCode } from '@/data/labour-registers/states';
import { batchZipName, documentFileName } from '@/lib/labour-registers/storage';
import { recordStreamExport } from '@/lib/exports/record-export';
import { createUniqueNamer, zipEntryPath } from '@/lib/zip/entry-names';
import { createZipStream, type ZipEntrySource } from '@/lib/zip/zip-writer';

/**
 * A batch's registers as one archive, a folder per act.
 *
 * Act-wise because that is how an inspection is conducted and how a filing cabinet is already
 * arranged: "show me the Minimum Wages registers" is a sentence somebody says. A flat archive
 * of thirty files makes the practitioner rebuild that grouping themselves.
 *
 * Streamed, not buffered. Each entry opens its own object only when the writer reaches it, so
 * a thirty-file archive never exists in this process's memory.
 *
 * `createUniqueNamer` is not defensive decoration. Two acts prescribing a form of the same
 * number is the normal case rather than the exception — Form XXII is the Register of
 * Employment in Telangana and the Register of Advances under the central Contract Labour
 * rules — so a collision inside a folder is a thing that will happen.
 *
 * A document whose object has gone missing is skipped rather than failing the archive. Getting
 * twenty-nine of thirty registers is better than getting none, and the skip is reported in the
 * response headers.
 *
 * GET /api/labour-registers/zip?batch=<id>
 */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const batchId = new URL(request.url).searchParams.get('batch');
  if (!batchId) return NextResponse.json({ error: 'batch_required' }, { status: 400 });

  const batch = await getBatch(guard.ctx, batchId);
  if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const documents = await listDocuments(guard.ctx, batch.id);
  if (documents.length === 0) {
    return NextResponse.json({ error: 'Nothing has been generated for this period yet.' }, { status: 409 });
  }

  const period = { from: batch.periodFrom, to: batch.periodTo };
  const uniqueName = createUniqueNamer();
  const skipped: string[] = [];

  /* One entry per document, newest first within a form: `listDocuments` orders by generation
     time, and a superseded document keeps its row, so the first one seen for a form is the
     current one. */
  const seen = new Set<string>();
  const entries: ZipEntrySource[] = [];

  for (const doc of documents) {
    if (seen.has(doc.formId)) continue;
    seen.add(doc.formId);

    const form = formById(doc.formId);
    const fileName = form ? documentFileName(form, period, doc.format) : `${doc.formId}.${doc.format}`;
    const path = uniqueName(zipEntryPath(form?.act ?? 'Other', fileName));

    entries.push({
      name: path,
      modified: doc.generatedAt ?? undefined,
      open: async () => {
        try {
          const object = await openObjectStream(doc.objectKey);
          if (!object) {
            skipped.push(path);
            return null;
          }
          return object.body;
        } catch {
          skipped.push(path);
          return null;
        }
      },
    });
  }

  const state = stateByCode(batch.stateCode);
  const archiveName = batchZipName(state?.name ?? batch.stateCode, period);

  const stream = createZipStream(entries, { onSkip: (name) => skipped.push(name) });
  const logged = await recordStreamExport(
    guard.ctx,
    { kind: 'labour_registers_zip', format: 'zip', fileName: archiveName },
    stream,
  );

  return new Response(logged, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': contentDisposition('attachment', archiveName),
      'cache-control': 'private, no-store, max-age=0, must-revalidate',
      'x-register-count': String(entries.length),
    },
  });
}
