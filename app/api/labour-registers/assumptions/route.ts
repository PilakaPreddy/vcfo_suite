import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { getBatch, updateBatch } from '@/db/repositories/labour-registers';
import type { AssumptionSet } from '@/lib/labour-registers/cache-key';

/**
 * Record how a figure was arrived at, where it was not simply read off a sheet.
 *
 * Everything here is part of every document's content address, which is the reason it lives on
 * the batch rather than in a settings table: stating that the month was fully present, or that
 * a rate of wages means a day's rather than a month's, changes what the registers say — so
 * changing it has to rebuild exactly the registers that say it, and nothing else. Keying the
 * assumptions gets that for free.
 *
 * Refused once the period is closed. An assumption that moved after the registers were built
 * would leave files that no longer match the basis recorded against them.
 *
 * POST /api/labour-registers/assumptions  { batchId, assumptions }
 */
const establishmentSchema = z.object({
  name: z.string().max(200).optional(),
  address: z.string().max(400).optional(),
  shiftName: z.string().max(80).optional(),
  shiftStart: z.string().max(20).optional(),
  shiftEnd: z.string().max(20).optional(),
  restInterval: z.string().max(40).optional(),
  dateOfPayment: z.string().max(20).optional(),
});

const bodySchema = z.object({
  batchId: z.string().min(1).max(64),
  assumptions: z.object({
    fullAttendanceAssumed: z.boolean().optional(),
    /* The keys the grid understands, not free text. A value outside this set used to be
       accepted and then silently ignored by the grid, which is how a register came to print
       `P` on every Sunday under a footnote saying Sundays were off. */
    weekOff: z.enum(['none', 'sun', 'sat-sun', 'alt-sat-sun']).optional(),
    holidayList: z.string().max(200).optional(),
    dateOrder: z.enum(['day-first', 'month-first']).optional(),
    doubleRateOvertime: z.boolean().optional(),
    wageRateBasis: z.enum(['monthly', 'daily']).optional(),
    dailyHours: z.number().min(1).max(24).optional(),
    /* Whose rules this establishment is under. Decides which registers exist at all. */
    sphere: z.enum(['state', 'central']).optional(),
    establishment: establishmentSchema.optional(),
  }),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });

  const batch = await getBatch(guard.ctx, body.data.batchId);
  if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (batch.markedReadyAt) {
    return NextResponse.json(
      { error: 'The period is closed. Reopen the inputs to change how a figure was arrived at.' },
      { status: 409 },
    );
  }

  /* Merged, not replaced: the establishment's shift timings and the attendance decision are
     set on different screens at different times and neither should clear the other. */
  const current = (batch.assumptions ?? {}) as AssumptionSet & { establishment?: Record<string, string> };
  const incoming = body.data.assumptions;
  const merged = {
    ...current,
    ...incoming,
    ...(incoming.establishment
      ? { establishment: { ...(current.establishment ?? {}), ...incoming.establishment } }
      : {}),
  };

  const updated = await updateBatch(guard.ctx, body.data.batchId, { assumptions: merged });
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ batchId: updated.id, assumptions: merged });
}
