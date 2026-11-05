import { NextResponse } from 'next/server';
import { requireAdminOrManager } from '@/auth/guards';
import { listDeliveriesByEngagement } from '@/db/repositories/notification-deliveries';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/engagements/:id/notification-deliveries
 *
 * Read-only staff diagnostic: what the app tried to send for this project, on
 * which channel, and what happened. Admin and manager only — clients never see
 * the delivery log, and the repository scopes a manager to their own
 * engagements regardless of the id in the URL.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAdminOrManager();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  try {
    const deliveries = await listDeliveriesByEngagement(guard.ctx, id);
    return NextResponse.json({ deliveries });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
