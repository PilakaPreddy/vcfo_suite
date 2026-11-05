import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { deleteOutlookConnection } from '@/db/repositories/outlook-connections';
import { publicErrorMessage } from '@/lib/api-error';

/** DELETE /api/outlook — unlink Microsoft mailbox. */
export async function DELETE() {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    await deleteOutlookConnection(guard.ctx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = publicErrorMessage(err, 'disconnect_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
