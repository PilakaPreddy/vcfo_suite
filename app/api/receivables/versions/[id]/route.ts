import { NextResponse } from 'next/server';
import { getVersion } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../_respond';

/** GET /api/receivables/versions/:id — one published version with its snapshot. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ version: await getVersion(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}
