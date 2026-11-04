import 'server-only';
import type { ResolvedVaultFile } from '@/db/repositories/documents';
import { signedDownloadUrl } from '@/storage/s3';

/*
 * Shared by the vault routes (G-26): read an S3 object as a stream and hand it back from our own
 * origin. The bytes come through a short-lived signed URL fetched on the server, so the object
 * never needs a public URL and the browser never sees one.
 */

/** One vault ZIP holds at most 500 files or 1 GB, for staff and clients alike. */
export const ZIP_MAX_FILES = 500;
export const ZIP_MAX_BYTES = 1024 * 1024 * 1024;

/** Types the preview pane shows inline. SVG and HTML are left out: they can carry script. */
const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** The type to serve: the stored one when it is a preview type, else one from the extension. */
export function previewContentType(file: Pick<ResolvedVaultFile, 'contentType' | 'fileName'>): string | null {
  const stored = file.contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (INLINE_TYPES.has(stored)) return stored;
  const ext = file.fileName.split('.').pop()?.toLowerCase() ?? '';
  return TYPE_BY_EXTENSION[ext] ?? null;
}

/** RFC 6266 header with an ASCII fallback and the UTF-8 name. */
export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '_') || 'file';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** The object's bytes as a stream, or null when storage has no such object. */
export async function openObjectStream(
  storageKey: string,
): Promise<{ body: ReadableStream<Uint8Array>; length: string | null } | null> {
  const url = await signedDownloadUrl(storageKey, 300);
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404 || res.status === 403) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`storage_${res.status}`);
  }
  return { body: res.body, length: res.headers.get('content-length') };
}

/**
 * Stream one vault file: inline for the preview pane (PDFs and images only, 415 otherwise), or,
 * with `download`, as an attachment of any type. A download keeps the stored type only when it
 * is a preview type; anything else goes as plain binary, so the browser never renders it.
 */
export async function previewResponse(
  file: ResolvedVaultFile,
  options: { download?: boolean } = {},
): Promise<Response> {
  const previewType = previewContentType(file);
  if (!previewType && !options.download) {
    return Response.json({ ok: false, error: 'preview_not_available' }, { status: 415 });
  }
  const type = previewType ?? 'application/octet-stream';
  let object: Awaited<ReturnType<typeof openObjectStream>>;
  try {
    object = await openObjectStream(file.storageKey);
  } catch {
    return Response.json({ ok: false, error: 'storage_failed' }, { status: 502 });
  }
  if (!object) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  const headers = new Headers({
    'Content-Type': type,
    'Content-Disposition': contentDisposition(options.download ? 'attachment' : 'inline', file.fileName),
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (object.length) headers.set('Content-Length', object.length);
  return new Response(object.body, { status: 200, headers });
}
