import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { getClientHome } from '@/db/repositories/client-home';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * GET /api/client/home?engagementId= — the Home page aggregate (client portal
 * v7): open needs, SBC work items, recent documents, activity with actors,
 * this FY's filings with owners, masked company IDs, timeline request state.
 * The repository runs `assertEngagementAccess`; another tenant's id is a 404.
 */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const engagementId = new URL(request.url).searchParams.get('engagementId') ?? undefined;
  try {
    const home = await getClientHome(guard.ctx, engagementId);
    if (!home) return NextResponse.json({ error: 'No engagement found' }, { status: 404 });
    return NextResponse.json({ home });
  } catch (err) {
    const message = publicErrorMessage(err, 'fetch_failed');
    return NextResponse.json(
      { error: 'fetch_failed', detail: process.env.NODE_ENV === 'development' ? message : undefined },
      { status: 500 },
    );
  }
}
