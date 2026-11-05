import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { deleteVaultDocument } from '@/db/repositories/documents';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/documents/:id — delete a vault file (P-596). A soft delete: the row is hidden
 * everywhere and `POST /api/documents/:id/restore` brings it back (the Undo toast). Staff only;
 * a lead may delete only their own uploads; a file a checklist step still holds answers 409.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { id } = await context.params;
  try {
    const document = await deleteVaultDocument(auth.ctx, id);
    if (!document) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, document });
  } catch (err) {
    const message = publicErrorMessage(err, 'delete_failed');
    if (message === 'in_use') return NextResponse.json({ ok: false, error: 'in_use' }, { status: 409 });
    if (message.includes('not permitted')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: false, error: 'delete_failed' }, { status: 500 });
  }
}
