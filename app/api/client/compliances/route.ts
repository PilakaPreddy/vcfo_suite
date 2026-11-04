import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { getPortalFilings } from '@/db/repositories/client-compliances';
import { parseFyParam } from '@/lib/compliance/filings';
import { todayIso } from '@/lib/client-portal/compliances';

/**
 * GET /api/client/compliances?fy=2026 — the client portal register (calendar +
 * filings pages): FilingRow plus period dates, penalty risk, owner, ARN / tax
 * paid / filed by, focus-track dates, proof count and the caller's reminder.
 * `?id=<instance>` returns just that filing (deep links). Scoped by AuthContext in the repository (a client reads only their company);
 * staff viewing one client's page add `&engagement=<id>`.
 */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  const engagementId = params.get('engagement') ?? undefined;
  if (id) {
    // one filing (deep links: ?filing= / ?open= from Search, Announcements)
    const rows = /^[0-9a-f-]{36}$/i.test(id) ? await getPortalFilings(guard.ctx, { ids: [id], engagementId }) : [];
    return NextResponse.json({ rows, today: todayIso() });
  }
  const fy = parseFyParam(params.get('fy')) ?? undefined;
  const rows = await getPortalFilings(guard.ctx, { fyStartYear: fy, engagementId });
  return NextResponse.json({ rows, today: todayIso() });
}
