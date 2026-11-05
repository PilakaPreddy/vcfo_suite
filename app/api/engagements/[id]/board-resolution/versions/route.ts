import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { listBoardResolutionVersions } from '@/db/repositories/board-resolution-noc';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/engagements/:id/board-resolution/versions — every recorded draft version, newest
 * first, with its merge-value snapshot (T4 Compare versions). Staff only; scoped by the repository.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAnyRole('intern', 'manager', 'admin', 'super_admin');
  if (auth.ok === false) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  try {
    const versions = await listBoardResolutionVersions(auth.ctx, id);
    return NextResponse.json({ ok: true, versions });
  } catch (err) {
    const message = publicErrorMessage(err, 'load_failed');
    const status = message.includes('not found') || message.includes('not permitted') ? 404 : message.startsWith('Only ') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
