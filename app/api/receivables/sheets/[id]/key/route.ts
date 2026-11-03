import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/site-url';
import { publicPageUrl } from '@/lib/receivables/links';
import { resetPublicKey } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/** POST /api/receivables/sheets/:id/key — a new secret key; every link sent before stops working. */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const publicKey = await resetPublicKey(guard.ctx, id);
    return NextResponse.json({ publicUrl: publicPageUrl(siteUrl(), { publicKey, requireKey: true }) });
  } catch (e) {
    return receivablesError(e);
  }
}
