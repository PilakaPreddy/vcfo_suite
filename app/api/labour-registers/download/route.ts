import { NextResponse } from 'next/server';

import { requireAuth } from '@/auth/guards';
import { contentDisposition, openObjectStream } from '../../documents/_lib/object-response';
import { countDownload, getBatch, getDocument } from '@/db/repositories/labour-registers';
import { formById } from '@/data/labour-registers/forms';
import { documentFileName } from '@/lib/labour-registers/storage';
import { EXTENSION_TO_MIME } from '@/lib/upload-limits';

/**
 * Serve one produced register.
 *
 * `requireAuth` rather than `requireAnyRole`, because a client downloading their own register
 * is the point of the client portal and the repository's engagement scope is what decides who
 * may see it. One code path, not two: the alternative is a staff route and a client route that
 * drift apart on exactly the question they must agree on.
 *
 * The bytes are streamed from storage rather than buffered. A file that already exists has no
 * business passing through this process's memory on its way out.
 *
 * `countDownload` is what makes the caching visible — the provenance bar says how many of a
 * batch's registers were served rather than built, and a saving nobody can see is a saving
 * nobody believes.
 *
 * `?signed=1` serves the signed scan instead of the generated file, where one has been
 * uploaded. Two files, one row: the generated register is what the figures came from, and the
 * scan is what somebody put their name to. An inspector asking what was signed should be given
 * the thing that was signed.
 *
 * GET /api/labour-registers/download?document=<id>[&signed=1]
 */
/**
 * The scan's own type, read off its name.
 *
 * The stored object's type is not asked for: `openObjectStream` signs a URL and streams what
 * comes back, and what the upload route recorded is the name. A scan is a PDF or a photograph
 * of a signed page, so the set is small and anything outside it downloads rather than opening
 * in the browser — which is the safe way round for a file somebody else uploaded.
 */
function signedContentType(fileName: string | null): string {
  const ext = (fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return EXTENSION_TO_MIME.pdf;
  if (ext === 'png') return EXTENSION_TO_MIME.png;
  if (ext === 'jpg' || ext === 'jpeg') return EXTENSION_TO_MIME.jpg;
  if (ext === 'webp') return EXTENSION_TO_MIME.webp;
  return 'application/octet-stream';
}

export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const url = new URL(request.url);
  const documentId = url.searchParams.get('document');
  if (!documentId) return NextResponse.json({ error: 'document_required' }, { status: 400 });

  const doc = await getDocument(guard.ctx, documentId);
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const wantSigned = url.searchParams.get('signed') === '1';
  if (wantSigned && !doc.signedObjectKey) {
    return NextResponse.json({ error: 'This register has not been signed and scanned back.' }, { status: 404 });
  }
  const objectKey = wantSigned ? doc.signedObjectKey! : doc.objectKey;

  let object: Awaited<ReturnType<typeof openObjectStream>>;
  try {
    object = await openObjectStream(objectKey);
  } catch {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 502 });
  }
  /* The row says the file exists and storage says it does not. That is worth a distinct answer
     rather than a 404: the document is real, its bytes are not reachable. */
  if (!object) return NextResponse.json({ error: 'file_missing_from_storage' }, { status: 410 });

  /* The name is what identifies the form once the file has left this system and been
     forwarded to an inspector, so it carries the period. The document row does not hold one;
     its batch does. */
  const form = formById(doc.formId);
  const batch = await getBatch(guard.ctx, doc.batchId);
  const fileName = wantSigned
    ? doc.signedFileName || `${doc.formId} - signed.pdf`
    : form && batch
      ? documentFileName(form, { from: batch.periodFrom, to: batch.periodTo }, doc.format)
      : `${doc.formId}.${doc.format}`;

  await countDownload(guard.ctx, doc.id);

  return new Response(object.body, {
    headers: {
      'content-type': wantSigned
        ? signedContentType(doc.signedFileName)
        : doc.format === 'xlsx'
          ? EXTENSION_TO_MIME.xlsx
          : doc.format === 'pdf'
            ? EXTENSION_TO_MIME.pdf
            : 'application/octet-stream',
      'content-disposition': contentDisposition('attachment', fileName),
      ...(object.length ? { 'content-length': object.length } : {}),
      'cache-control': 'private, no-store, max-age=0, must-revalidate',
    },
  });
}
