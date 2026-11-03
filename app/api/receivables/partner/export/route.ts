import { NextResponse } from 'next/server';
import { requirePartner } from '@/auth/guards';
import { partnerExportRows } from '@/db/repositories/receivables';
import { todayIst } from '@/lib/receivables/dates';
import { receivablesWorkbook, receivablesWorkbookName } from '@/lib/receivables/xlsx';
import { denied, receivablesError } from '../../_respond';

/** GET /api/receivables/partner/export — the partner's own invoices of the latest published version, as Excel. */
export async function GET() {
  const guard = await requirePartner();
  if (guard.ok === false) return denied(guard);
  try {
    const { clientOrgName, rows } = await partnerExportRows(guard.ctx);
    const today = todayIst();
    const bytes = await receivablesWorkbook(rows, today);
    const name = receivablesWorkbookName(clientOrgName || 'Receivables', today);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${name.replace(/[^\w .-]/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return receivablesError(e);
  }
}
