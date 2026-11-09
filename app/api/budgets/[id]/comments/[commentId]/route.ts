import { NextResponse } from 'next/server';
import { resolveComment } from '@/db/repositories/budgets';
import { budgetError, denied, guardBudgets } from '../../../_respond';

type Context = { params: Promise<{ id: string; commentId: string }> };

/** PATCH — mark a comment resolved. */
export async function PATCH(_request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, commentId } = await params;
  try {
    await resolveComment(guard.ctx, id, commentId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return budgetError(e);
  }
}
