import { NextResponse } from 'next/server';
import { z } from 'zod';
import { approveBudget, publishBudget, rejectBudget, startRevision } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { notifyDecision, notifyPublished } from '@/lib/budget/notify';
import { budgetError, denied, guardBudgets, type IdContext } from '../../_respond';

const note = z.string().trim().max(2000);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish'), note: note.optional() }),
  z.object({ action: z.literal('approve'), note: note.optional() }),
  z.object({ action: z.literal('reject'), note: note.min(1) }),
  z.object({ action: z.literal('revise'), note: note.min(1) }),
]);

/** POST /api/budgets/[id]/workflow — publish, approve, return or start a revision. */
export async function POST(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const actor = { id: guard.ctx.userId, name: guard.ctx.name };
  const input = body.data;
  try {
    if (input.action === 'publish') {
      const published = await publishBudget(guard.ctx, id, input.note || null);
      await notifyPublished(id, published.version, actor);
      return NextResponse.json(published);
    }
    if (input.action === 'approve') {
      await approveBudget(guard.ctx, id, input.note || null);
      await notifyDecision(id, true, input.note || null, actor);
    } else if (input.action === 'reject') {
      await rejectBudget(guard.ctx, id, input.note);
      await notifyDecision(id, false, input.note, actor);
    } else {
      await startRevision(guard.ctx, id, input.note);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return budgetError(e);
  }
}
