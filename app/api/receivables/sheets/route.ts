import { NextResponse } from 'next/server';
import { listMySheets } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError } from '../_respond';

/** GET /api/receivables/sheets — the sheets the caller edits (one, for the one manager). */
export async function GET() {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  try {
    return NextResponse.json({ sheets: await listMySheets(guard.ctx) });
  } catch (e) {
    return receivablesError(e);
  }
}
