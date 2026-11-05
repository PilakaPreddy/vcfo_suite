import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { openBatch } from '@/db/repositories/labour-registers';

/**
 * Open the register batch for one client, one state and one period.
 *
 * The picker is state-first — a preparer thinks "Telangana, September" before they think of a
 * client — so the client is chosen on the same screen and the two are put together here.
 * `openBatch` is find-or-create: asking twice for the same month returns the batch that
 * already exists rather than a second one, which is what makes the button safe to press again
 * after a back button or a double click.
 *
 * Staff only. The repository checks the engagement scope and returns null for a client the
 * caller cannot see, which is answered as a 404 rather than a 403 — whether a client exists is
 * itself something a stranger should not learn.
 *
 * POST /api/labour-registers/open  { engagementId, stateCode, periodFrom, periodTo }
 *   → { batchId }
 */
const bodySchema = z.object({
  engagementId: z.string().min(1).max(64),
  stateCode: z.string().min(2).max(3),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });

  const batch = await openBatch(guard.ctx, body.data);
  if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ batchId: batch.id });
}
