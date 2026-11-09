import { NextResponse } from 'next/server';
import { listChanges } from '@/db/repositories/budgets';
import { budgetError, denied, guardBudgets, type IdContext } from '../../_respond';

/** GET — the change log, optionally for one row (`?row=`). */
export async function GET(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  try {
    return NextResponse.json({ changes: await listChanges(guard.ctx, id, { rowId: new URL(request.url).searchParams.get('row') }) });
  } catch (e) {
    return budgetError(e);
  }
}
