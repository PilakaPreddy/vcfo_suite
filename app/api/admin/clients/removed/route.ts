import { NextResponse } from 'next/server';
import { requireAdminOrManager } from '@/auth/guards';
import { listRemovedClients } from '@/db/repositories/profiles';
import { publicErrorMessage } from '@/lib/api-error';

/** GET /api/admin/clients/removed — clients taken off their last project. */
export async function GET() {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const clients = await listRemovedClients(auth.ctx);
    return NextResponse.json({ clients });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
