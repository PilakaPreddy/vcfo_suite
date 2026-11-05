import { NextResponse } from 'next/server';
import { hsbcFeedMissing } from '@/lib/receivables/bank-feed/hsbc';
import { configuredBankFeed } from '@/lib/receivables/bank-feed/run';
import { listCredits } from '@/db/repositories/receivables';
import { num } from '@/db/repositories/receivables/shared';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET /api/receivables/sheets/:id/credits — the From bank tab: credits from the feed or from
 * imported statements, newest first, and whether the live HSBC feed is connected to this sheet.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const rows = await listCredits(guard.ctx, id);
    const feed = configuredBankFeed();
    return NextResponse.json({
      feed: { live: feed?.sheetId === id, missing: feed?.sheetId === id ? hsbcFeedMissing() : [] },
      credits: rows.map((c) => ({
        id: c.id,
        source: c.source,
        externalRef: c.externalRef,
        valueDate: String(c.valueDate),
        payer: c.payer,
        currency: c.currency,
        fcAmount: num(c.fcAmount),
        inrAmount: num(c.inrAmount) ?? 0,
        narration: c.narration,
        status: c.status,
        matchInvoiceIds: c.matchInvoiceIds,
        matchNote: c.matchNote,
        decidedAt: c.decidedAt,
      })),
    });
  } catch (e) {
    return receivablesError(e);
  }
}
