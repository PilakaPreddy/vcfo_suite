import { NextResponse } from 'next/server';
import { requirePartner } from '@/auth/guards';
import { partnerStatement } from '@/db/repositories/receivables';
import { todayIst } from '@/lib/receivables/dates';
import { parseStatementQuery, statementFileName } from '@/lib/receivables/statement';
import { statementWorkbook } from '@/lib/receivables/statement-xlsx';
import { denied, receivablesError } from '../../_respond';

/**
 * GET /api/receivables/partner/statement?client=&from=&to=[&format=xlsx] — the signed-in client
 * partner's statement of account (Phase 10), from their own rows of the latest published
 * version only. JSON by default, Excel with `format=xlsx`.
 */
export async function GET(request: Request) {
  const guard = await requirePartner();
  if (guard.ok === false) return denied(guard);
  const url = new URL(request.url);
  const parsed = parseStatementQuery(url.searchParams, todayIst());
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const { clientOrgName, statement } = await partnerStatement(guard.ctx, parsed.query);
    if (url.searchParams.get('format') !== 'xlsx') return NextResponse.json({ clientOrgName, statement }, { headers: { 'Cache-Control': 'no-store' } });
    const bytes = await statementWorkbook(statement, clientOrgName);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${statementFileName(statement.client ?? clientOrgName, statement.from, statement.to)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return receivablesError(e);
  }
}
