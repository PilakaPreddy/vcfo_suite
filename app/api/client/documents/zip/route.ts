import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { listClientDocumentsZip, ClientDocumentsForbiddenError } from '@/db/repositories/client-documents';
import { recordStreamExport } from '@/lib/exports/record-export';
import { createZipStream } from '@/lib/zip/zip-writer';
import { contentDisposition, openObjectStream, ZIP_MAX_BYTES, ZIP_MAX_FILES } from '../../../documents/_lib/object-response';

/**
 * GET /api/client/documents/zip?folder=all|phase:<id>|step:<itemId>|cat:<c1..c5>
 * One zip of the client's current files (never missing or replaced ones),
 * folders named after the real phases and steps ("Phase 2 — Incorporation/
 * 6 · Director KYC/PAN card — Ravi Kumar.pdf"). `X-Zip-Files` = file count.
 * The archive is streamed from S3 one entry at a time with the staff vault's
 * caps (500 files, 1 GB), so the server never holds the whole folder.
 */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const params = new URL(request.url).searchParams;
  const folder = params.get('folder')?.trim() || 'all';
  if (!/^(all|phase:[\w-]+|step:[\w-]+|cat:c[1-5])$/.test(folder)) {
    return NextResponse.json({ error: 'invalid_folder' }, { status: 400 });
  }
  try {
    const zip = await listClientDocumentsZip(guard.ctx, folder, params.get('engagement') ?? undefined);
    if (!zip) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const { entries } = zip;
    if (entries.length === 0) return NextResponse.json({ error: 'empty' }, { status: 404 });
    if (entries.length > ZIP_MAX_FILES) {
      return NextResponse.json({ error: `This folder has over ${ZIP_MAX_FILES} files. Download a smaller folder.` }, { status: 400 });
    }
    const knownBytes = entries.reduce((n, e) => n + (e.sizeBytes ?? 0), 0);
    if (knownBytes > ZIP_MAX_BYTES) {
      return NextResponse.json({ error: 'This folder is over 1 GB. Download a smaller folder.' }, { status: 400 });
    }
    await recordAuditEvent(guard.ctx, {
      engagementId: zip.engagementId,
      action: 'documents.download_zip',
      summary: `Downloaded ${zip.filename} (${entries.length} files)`,
      metadata: { folder, count: entries.length, missing: zip.missing },
    });
    // Sizes the tree does not know are still capped by the writer, which stops at 1 GB.
    const stream = createZipStream(
      entries.map((e) => ({ name: e.name, open: async () => (await openObjectStream(e.key))?.body ?? null })),
      { maxBytes: ZIP_MAX_BYTES },
    );
    return new Response(recordStreamExport(guard.ctx, { kind: 'client_vault_zip', format: 'zip', fileName: zip.filename }, stream), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition('attachment', zip.filename),
        'X-Zip-Files': String(entries.length),
        'X-Zip-Missing': String(zip.missing),
        'X-Zip-Bytes': String(knownBytes),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ClientDocumentsForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('[client-documents] zip failed', e);
    return NextResponse.json({ error: 'zip_failed' }, { status: 500 });
  }
}
