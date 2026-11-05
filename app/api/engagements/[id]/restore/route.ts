import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import {
  getEngagementIncludingDeleted,
  restoreEngagement,
  toAppEngagement,
} from '@/db/repositories/engagements';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/engagements/:id/restore — bring a soft-deleted project back.
 * Firm admin only; the row is invisible to every scoped read until it returns.
 */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('admin', 'super_admin');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  try {
    const existing = await getEngagementIncludingDeleted(guard.ctx, id);
    if (!existing) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (!existing.deletedAt) {
      return NextResponse.json({ error: 'not_deleted' }, { status: 409 });
    }

    const row = await restoreEngagement(guard.ctx, id);
    await recordAuditEvent(guard.ctx, {
      engagementId: row.id,
      action: 'project.restored',
      summary: `Restored project ${row.companyName}`,
      metadata: { companyName: row.companyName, slug: row.slug },
    });

    return NextResponse.json({ engagement: toAppEngagement(row) });
  } catch (err) {
    const message = publicErrorMessage(err, 'restore_failed');
    const status = message.includes('not found')
      ? 404
      : message.includes('Only firm admins')
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
