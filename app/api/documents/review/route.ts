import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { setDocumentReview } from '@/db/repositories/documents';
import { publicErrorMessage } from '@/lib/api-error';

const bodySchema = z
  .object({
    documentId: z.string().uuid().optional(),
    /** A checklist upload with no index row yet, by its storage path. */
    path: z.string().trim().min(3).max(600).optional(),
    status: z.enum(['pending', 'approved', 'changes']),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => Boolean(v.documentId) !== Boolean(v.path), { message: 'documentId_or_path' })
  .refine((v) => v.status !== 'changes' || Boolean(v.note), { message: 'review_note_required' });

/**
 * PATCH /api/documents/review — set a vault file's review state (G-26): pending (in review),
 * approved, or changes with a note. Staff only; the file must be in the caller's scope.
 * Writes an audit event; the uploader sees the result in the vault (and in the bell when an
 * admin or manager reviewed it).
 */
export async function PATCH(request: Request) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) {
    return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  }
  const { documentId, path, status, note } = body.data;
  try {
    const document = await setDocumentReview(auth.ctx, {
      ref: documentId ? { documentId } : { path: path! },
      status,
      note,
    });
    if (!document) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, document });
  } catch (err) {
    const message = publicErrorMessage(err, 'review_failed');
    if (message === 'review_note_required') return NextResponse.json({ ok: false, error: message }, { status: 400 });
    if (message.includes('not permitted')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: false, error: 'review_failed' }, { status: 500 });
  }
}
