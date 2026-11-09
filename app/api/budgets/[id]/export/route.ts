import { NextResponse } from 'next/server';
import { getBudgetView, getVariance, recordBudgetExport } from '@/db/repositories/budgets';
import { renderBudgetPdf } from '@/lib/budget/pdf';
import { budgetTemplateWorkbook, budgetWorkbook } from '@/lib/budget/xlsx';
import { fyName } from '@/lib/budget/model';
import { budgetError, denied, guardBudgets, type IdContext } from '../../_respond';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** GET ?format=xlsx|pdf|template — the budget as this person may see it. */
export async function GET(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const format = new URL(request.url).searchParams.get('format') ?? 'xlsx';
  try {
    const view = await getBudgetView(guard.ctx, id);
    const { state, access } = view;
    const base = `${view.companyName} ${state.settings.title} ${fyName(state.settings)}`.replace(/[^\w\- ]+/g, '').trim();
    const sections = access.visibleSections.filter((s) => s !== 'hiring' || access.canSeeCtc);
    if (format === 'template') {
      const bytes = await budgetTemplateWorkbook(state.settings, access.editableSections.length ? access.editableSections : sections);
      return file(bytes, XLSX, `${base} template.xlsx`);
    }
    if (format === 'pdf') {
      if (!access.canSeeMaster) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      await recordBudgetExport(guard.ctx, id, 'pdf');
      const variance = access.canSeeVariance ? await getVariance(guard.ctx, id) : null;
      return file(await renderBudgetPdf({ state, status: view.status, version: view.currentVersion, approvedByName: view.approvedByName, approvedAt: view.approvedAt, companyName: view.companyName, variance }), 'application/pdf', `${base}.pdf`);
    }
    await recordBudgetExport(guard.ctx, id, 'xlsx');
    const variance = access.canSeeVariance ? await getVariance(guard.ctx, id) : null;
    return file(await budgetWorkbook(state, { sections, master: access.canSeeMaster, variance }), XLSX, `${base}.xlsx`);
  } catch (e) {
    return budgetError(e);
  }
}

function file(bytes: Uint8Array, type: string, name: string) {
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"` } });
}
