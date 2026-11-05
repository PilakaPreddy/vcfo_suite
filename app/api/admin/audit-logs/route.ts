import { NextResponse } from 'next/server';
import { requireAdminOrManager } from '@/auth/guards';
import { listAuditEvents } from '@/db/repositories/audit-events';
import { publicErrorMessage } from '@/lib/api-error';

export async function GET(request: Request) {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const engagementParam = url.searchParams.get('engagementId')?.trim();
  const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

  try {
    const events = await listAuditEvents(auth.ctx, {
      engagementId: engagementParam || null,
      limit,
    });
    return NextResponse.json({
      ok: true,
      events,
      scope: engagementParam ? 'project' : 'global',
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'fetch_failed');
    return NextResponse.json(
      {
        ok: false,
        error: 'fetch_failed',
        detail: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 },
    );
  }
}
