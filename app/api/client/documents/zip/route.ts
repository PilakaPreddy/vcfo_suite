import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { buildClientDocumentsZip, ClientDocumentsForbiddenError } from '@/db/repositories/client-documents';
import { recordExport } from '@/lib/exports/record-export';

/**
 * GET /api/client/documents/zip?folder=all|phase:<id>|step:<itemId>|cat:<c1..c5>
 * One zip of the client's current files (never missing or replaced ones),
 * folders named after the real phases and steps ("Phase 2 — Incorporation/
 * 6 · Director KYC/PAN card — Ravi Kumar.pdf"). `X-Zip-Files` = file count.
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
    const zip = await buildClientDocumentsZip(guard.ctx, folder, params.get('engagement') ?? undefined);
    if (!zip) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (zip.count === 0) return NextResponse.json({ error: 'empty' }, { status: 404 });
    await recordExport(guard.ctx, { kind: 'client_vault_zip', format: 'zip', fileName: zip.filename, body: zip.buffer });
    const safe = zip.filename.replace(/["\\\r\n]/g, '_');
    return new NextResponse(new Uint8Array(zip.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.buffer.length),
        'Content-Disposition': `attachment; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(zip.filename)}`,
        'X-Zip-Files': String(zip.count),
        'X-Zip-Missing': String(zip.missing),
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (e) {
    if (e instanceof ClientDocumentsForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('[client-documents] zip failed', e);
    return NextResponse.json({ error: 'zip_failed' }, { status: 500 });
  }
}
