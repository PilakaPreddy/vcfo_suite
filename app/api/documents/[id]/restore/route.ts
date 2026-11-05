import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { restoreVaultDocument } from '@/db/repositories/documents';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/documents/:id/restore — Undo a vault delete (P-596). The person who deleted the file,
 * or an admin or manager on the engagement, may bring it back.
 */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { id } = await context.params;
  try {
    const document = await restoreVaultDocument(auth.ctx, id);
    if (!document) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, document });
  } catch (err) {
    const message = publicErrorMessage(err, 'restore_failed');
    if (message.includes('not permitted')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: false, error: 'restore_failed' }, { status: 500 });
  }
}
