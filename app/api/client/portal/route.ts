import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { ClientPortalForbiddenError, getClientPortalShell } from '@/db/repositories/client-portal';

/**
 * GET /api/client/portal — the portal chrome: company, team contacts, badges, prefs. Staff pass
 * `?engagement=<id>` for an engagement they may access; a client's own engagement is always used.
 */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const shell = await getClientPortalShell(guard.ctx, new URL(request.url).searchParams.get('engagement') ?? undefined);
    if (!shell) return NextResponse.json({ error: 'No engagement found' }, { status: 404 });
    return NextResponse.json({ shell });
  } catch (e) {
    if (e instanceof ClientPortalForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
