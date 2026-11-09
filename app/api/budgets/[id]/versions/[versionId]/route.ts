import { NextResponse } from 'next/server';
import { getVersionState } from '@/db/repositories/budgets';
import { budgetError, denied, guardBudgets } from '../../../_respond';

type Context = { params: Promise<{ id: string; versionId: string }> };

/** GET — one frozen version, without CTC for a viewer who has no HR access. */
export async function GET(_request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, versionId } = await params;
  try {
    return NextResponse.json(await getVersionState(guard.ctx, id, versionId));
  } catch (e) {
    return budgetError(e);
  }
}
