import { NextResponse } from 'next/server';
import { todayIst } from '@/lib/receivables/dates';
import { receivablesWorkbook, receivablesWorkbookName } from '@/lib/receivables/xlsx';
import { getSummarySource } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/** GET /api/receivables/sheets/:id/export — the published version as Excel, for the manager's Share. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const src = await getSummarySource(guard.ctx, id);
    const today = todayIst();
    const bytes = await receivablesWorkbook(src.version.snapshot, today);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${receivablesWorkbookName(src.sheet.clientOrgName, today).replace(/[^\w .-]/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return receivablesError(e);
  }
}
