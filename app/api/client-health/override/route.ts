import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { setClientHealth } from '@/lib/actions/statuses/set-client-health';
import { parseJsonBody } from '@/lib/api/parse-body';
import { HEALTH_BANDS } from '@/lib/client-health/score';
import { healthError, routeActionContext } from '../_respond';

/**
 * POST /api/client-health/override — the screen's side of the `statuses.setClientHealth` card.
 *
 *   { engagementId, band, reason }                 returns `{ review }`: the checks and the old
 *                                                  and new band, for the person to read.
 *   { engagementId, band, reason, confirm: true }  is the person's approval: the checks run again
 *                                                  as that person, then the override is saved.
 * Managers and admins only; the repository checks the role and the client's scope again.
 */
const body = z.object({
  engagementId: z.string().min(1),
  band: z.enum([...HEALTH_BANDS, 'clear']),
  reason: z.string().trim().max(500).optional(),
  confirm: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const parsed = await parseJsonBody(request, body);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { confirm, ...input } = parsed.data;
  const actx = routeActionContext(guard.ctx);
  try {
    const checked = await setClientHealth.recheck!(actx, input, {});
    if (!confirm) {
      return NextResponse.json({
        review: {
          title: 'Client health band',
          tier: 'T2',
          displayOld: checked.displayOld,
          displayNew: checked.displayNew,
          checks: checked.checks,
          heldReason: checked.heldReason,
          canApply: checked.canApply,
        },
      });
    }
    if (!checked.canApply) return NextResponse.json({ error: checked.heldReason ?? 'Held' }, { status: 409 });
    const result = await setClientHealth.execute(actx, input);
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (e) {
    return healthError(e);
  }
}
