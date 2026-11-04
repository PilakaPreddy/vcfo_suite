import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { ClientDocumentsForbiddenError, readClientDocumentFile } from '@/db/repositories/client-documents';

/**
 * GET /api/client/documents/file?ref=&dl=1 — the bytes of one client
 * document, same-origin (inline for the viewer, `dl=1` for a download).
 * The ref is resolved and access-checked again on every call. Staff add
 * `&engagement=<id>`; a client's own engagement is always used.
 */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const url = new URL(request.url);
  const ref = url.searchParams.get('ref')?.trim() ?? '';
  if (!ref || ref.length > 600) return NextResponse.json({ error: 'invalid_ref' }, { status: 400 });
  try {
    const file = await readClientDocumentFile(guard.ctx, ref, url.searchParams.get('engagement') ?? undefined);
    if (!file) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const safe = file.fileName.replace(/["\\\r\n]/g, '_');
    const disposition = url.searchParams.get('dl') === '1' ? 'attachment' : 'inline';
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.bytes.length),
        'Content-Disposition': `${disposition}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ClientDocumentsForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('[client-documents] file failed', e);
    return NextResponse.json({ error: 'download_failed' }, { status: 500 });
  }
}
