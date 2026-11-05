import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { setEngagementWindow } from '@/db/repositories/schedule';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');

const bodySchema = z
  .object({
    target: z.enum(['incorporation', 'step']),
    itemId: z.string().trim().min(1).optional(),
    /** Both present = set; both null/absent = clear. */
    from: isoDate.nullable().optional(),
    to: isoDate.nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.target === 'step' && !d.itemId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'item_required', path: ['itemId'] });
    }
    const hasFrom = Boolean(d.from);
    const hasTo = Boolean(d.to);
    if (hasFrom !== hasTo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'window_needs_both_dates', path: ['to'] });
    }
  });

/**
 * POST /api/engagements/:id/schedule — set or clear a manager date window.
 * Manager (own project), admin, super admin. Leads and clients get 403 here
 * and would be refused by the repository regardless.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const { target, itemId, from, to } = body.data;
  try {
    const schedule = await setEngagementWindow(
      guard.ctx,
      id,
      target === 'incorporation' ? { kind: 'incorporation' } : { kind: 'step', itemId: itemId! },
      from && to ? { from, to } : null,
    );
    return NextResponse.json({ schedule });
  } catch (err) {
    const message = publicErrorMessage(err, 'schedule_failed');
    const status =
      message.includes('Only a project manager') ? 403
      : message.includes('not found') || message.includes('not permitted') ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
