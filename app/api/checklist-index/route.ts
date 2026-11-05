import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { listChecklistIndex } from '@/db/repositories/engagements';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * GET /api/checklist-index — role-scoped slim checklist maps.
 * Status / gate fields + a few compliance dates; not full form answers.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const byEngagement = await listChecklistIndex(guard.ctx);
    return NextResponse.json({ byEngagement });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
