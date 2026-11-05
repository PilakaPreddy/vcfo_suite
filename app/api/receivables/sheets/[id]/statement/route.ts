import { NextResponse } from 'next/server';
import { sheetStatement } from '@/db/repositories/receivables';
import { todayIst } from '@/lib/receivables/dates';
import { parseStatementQuery, statementFileName } from '@/lib/receivables/statement';
import { statementWorkbook } from '@/lib/receivables/statement-xlsx';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET /api/receivables/sheets/:id/statement?client=&from=&to=[&format=xlsx] — a statement of
 * account (Phase 10) from the sheet's live invoices: JSON by default, Excel with `format=xlsx`.
 * Only the sheet's manager and the firm-wide admins get it (`scopedSheet` in the repository).
 */
export async function GET(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const url = new URL(request.url);
  const parsed = parseStatementQuery(url.searchParams, todayIst());
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const { clientOrgName, statement } = await sheetStatement(guard.ctx, id, parsed.query);
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
