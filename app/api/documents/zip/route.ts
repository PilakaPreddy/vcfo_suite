import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { resolveVaultFiles, type ResolvedVaultFile, type VaultFileRef } from '@/db/repositories/documents';
import { createUniqueNamer, zipArchiveName, zipEntryPath } from '@/lib/zip/entry-names';
import { createZipStream, type ZipEntrySource } from '@/lib/zip/zip-writer';
import { listObjects } from '@/storage/s3';
import { contentDisposition, openObjectStream, ZIP_MAX_BYTES, ZIP_MAX_FILES } from '../_lib/object-response';
import { recordStreamExport } from '@/lib/exports/record-export';

const MAX_FILES = ZIP_MAX_FILES;
const MAX_BYTES = ZIP_MAX_BYTES;

const folder = z.string().trim().max(300).optional();
const itemSchema = z.union([
  z.object({ documentId: z.string().uuid(), folder }),
  z.object({ path: z.string().trim().min(3).max(600), folder }),
  z.object({ requestFileId: z.string().uuid(), folder }),
]);

const bodySchema = z.object({
  /** Name of the archive, usually the client or the folder. */
  name: z.string().trim().max(120).optional(),
  items: z.array(itemSchema).min(1, 'items_required').max(MAX_FILES, `Pick up to ${MAX_FILES} files`),
  /** Only check the selection and return its count and size, without the archive. */
  dryRun: z.boolean().optional(),
});

/** JSON, or a form post (`payload` holds the JSON) so the browser streams the download to disk. */
async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (type.startsWith('application/x-www-form-urlencoded') || type.startsWith('multipart/form-data')) {
    const form = await request.formData();
    return JSON.parse(String(form.get('payload') ?? ''));
  }
  return request.json();
}

/**
 * Size of each file. Index rows carry it; checklist uploads do not, so their engagement's
 * prefix is listed once. A key that is not in storage comes back missing.
 */
async function sizesFor(files: ResolvedVaultFile[]): Promise<Map<string, number | null>> {
  const sizes = new Map<string, number | null>();
  const prefixes = new Set<string>();
  for (const f of files) {
    if (f.sizeBytes != null) sizes.set(f.storageKey, f.sizeBytes);
    else prefixes.add(f.storageKey.split('/').slice(0, 2).join('/') + '/');
  }
  for (const prefix of prefixes) {
    const listed = await listObjects(prefix, 20000);
    const byKey = new Map(listed.map((o) => [o.key, o.size]));
    for (const f of files) {
      if (f.sizeBytes == null && f.storageKey.startsWith(prefix)) {
        sizes.set(f.storageKey, byKey.has(f.storageKey) ? (byKey.get(f.storageKey) ?? 0) : null);
      }
    }
  }
  return sizes;
}

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/**
 * POST /api/documents/zip — one ZIP of vault files (G-26): a folder or a selection.
 * Body: { name?, items: [{ documentId } | { path } | { requestFileId }, with an optional
 * `folder` label each], dryRun? }. Staff only. Each file is checked with the scope rules of its
 * own download route; a file outside the caller's scope is a 404 for the whole request. More
 * than 500 files or 1 GB is a 400. Entries are streamed one by one from S3 into a store-only
 * archive, so the server holds one chunk at a time.
 */
export async function POST(request: Request) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const tooLarge = rejectLargeBody(request, 512 * 1024);
  if (tooLarge) return tooLarge;

  let raw: unknown;
  try {
    raw = await readBody(request);
  } catch {
    return badRequest('invalid_body');
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || 'invalid_body');
  const { items, name, dryRun } = parsed.data;

  const files = await resolveVaultFiles(auth.ctx, items as VaultFileRef[]);
  if (files.length !== items.length) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  let sizes: Map<string, number | null>;
  try {
    sizes = await sizesFor(files);
  } catch {
    return NextResponse.json({ ok: false, error: 'storage_failed' }, { status: 502 });
  }
  const present = files.filter((f) => sizes.get(f.storageKey) !== null);
  const bytes = present.reduce((n, f) => n + (sizes.get(f.storageKey) ?? 0), 0);
  if (bytes > MAX_BYTES) return badRequest('The selection is over 1 GB. Pick fewer files.');
  if (present.length === 0) {
    return NextResponse.json({ ok: false, error: 'files_missing' }, { status: 404 });
  }
  if (dryRun) {
    return NextResponse.json({ ok: true, files: present.length, missing: files.length - present.length, bytes });
  }

  const engagementIds = [...new Set(present.map((f) => f.engagementId))];
  await recordAuditEvent(auth.ctx, {
    engagementId: engagementIds.length === 1 ? engagementIds[0] : null,
    action: 'documents.zip',
    summary: `Downloaded ${present.length} ${present.length === 1 ? 'file' : 'files'} as ZIP`,
    metadata: { files: present.length, bytes, engagements: engagementIds },
  });

  const unique = createUniqueNamer();
  const entries: ZipEntrySource[] = present.map((f) => ({
    name: unique(zipEntryPath(f.folder, f.fileName)),
    modified: f.createdAt ? new Date(f.createdAt) : undefined,
    open: async () => (await openObjectStream(f.storageKey))?.body ?? null,
  }));
  const stream = recordStreamExport(auth.ctx, { kind: 'vault_zip', format: 'zip', fileName: zipArchiveName(name) }, createZipStream(entries, { maxBytes: MAX_BYTES }));

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition('attachment', zipArchiveName(name)),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
