import { NextResponse } from 'next/server';
import { systemPublicSheet } from '@/db/repositories/receivables';
import { clientIp, createRateLimiter } from '@/lib/growth/demo-request';
import { todayIst } from '@/lib/receivables/dates';
import { rowsForPartner, validPartner } from '@/lib/receivables/public-view';
import { receivablesWorkbook, receivablesWorkbookName } from '@/lib/receivables/xlsx';

/**
 * GET /api/public/receivables/export?k=<key>[&partner=<slug>] — the client page's Download Excel.
 * No session, like the page: the key finds the sheet and only the published version is exported.
 * Rate limited per address, so the key cannot be guessed through this route.
 */
const limiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

export async function GET(request: Request) {
  if (!limiter.take(clientIp(request.headers))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const url = new URL(request.url);
  const sheet = await systemPublicSheet({ key: url.searchParams.get('k') });
  if (!sheet) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const today = todayIst();
  const partner = validPartner(url.searchParams.get('partner'), sheet.partners);
  const bytes = await receivablesWorkbook(rowsForPartner(sheet.rows, partner), today);
  const name = receivablesWorkbookName(sheet.clientOrgName, today);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\w .-]/g, '')}"`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
