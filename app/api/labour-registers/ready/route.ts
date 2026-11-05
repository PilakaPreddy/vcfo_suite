import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publicErrorMessage } from '@/lib/api-error';

import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { markReady, reopenInputs } from '@/db/repositories/labour-registers';

/**
 * The monthly close, and the only way back from it.
 *
 * Marking the inputs ready locks the period: the uploads and the mapping stop accepting
 * changes, and the registers are built from exactly what was locked. It is a statement by a
 * person, so the tick is required and the readiness summary that was on screen at that moment
 * is stored verbatim — what somebody was told when they took responsibility is part of the
 * record, and recomputing it later answers a different question.
 *
 * **This is deliberately not the generate route.** `markReady` refuses a second call, but
 * generation has to stay retryable: a network failure halfway through twenty-nine registers
 * must be recoverable by pressing the button again, and every form that succeeded will then be
 * a cache hit. One route that both closed and generated could not offer that.
 *
 * Reopening takes a reason and is counted. An unexplained reopen is the thing to avoid: a
 * register that changed after it was produced is a question somebody will eventually ask.
 *
 * POST  /api/labour-registers/ready   { batchId, accuracyConfirmed, readiness }
 * PATCH /api/labour-registers/ready   { batchId, reason }   — reopen
 */
const readySchema = z.object({
  batchId: z.string().min(1).max(64),
  /** The preparer's own confirmation. Never inferred, never defaulted. */
  accuracyConfirmed: z.literal(true),
  /** The summary as it stood on screen, stored with the confirmation. */
  readiness: z.record(z.string(), z.unknown()),
});

const reopenSchema = z.object({
  batchId: z.string().min(1).max(64),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await parseJsonBody(request, readySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });

  try {
    const batch = await markReady(guard.ctx, {
      batchId: body.data.batchId,
      accuracyConfirmed: body.data.accuracyConfirmed,
      readiness: body.data.readiness,
    });
    if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ batchId: batch.id, status: batch.status, markedReadyAt: batch.markedReadyAt });
  } catch (e) {
    /* Already closed, or a tick that was not given. Both are the caller's state, not a fault. */
    return NextResponse.json({ error: publicErrorMessage(e, 'could_not_close') }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await parseJsonBody(request, reopenSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });

  try {
    const batch = await reopenInputs(guard.ctx, { batchId: body.data.batchId, reason: body.data.reason });
    if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ batchId: batch.id, status: batch.status, reopenCount: batch.reopenCount });
  } catch (e) {
    return NextResponse.json({ error: publicErrorMessage(e, 'could_not_reopen') }, { status: 409 });
  }
}
