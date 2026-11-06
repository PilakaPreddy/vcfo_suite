import { NextResponse } from 'next/server';
import { getBudgetView, replaceRows, updateSettings } from '@/db/repositories/budgets';
import { parseLinkedWorkbook } from '@/lib/budget/import-linked';
import { parseBudgetWorkbook } from '@/lib/budget/xlsx';
import { MAX_IMPORT_BYTES, budgetError, denied, guardBudgets, type IdContext } from '../../_respond';

/**
 * POST — read a workbook. `mode=preview` only reports what it found. Without it, the rows of each
 * sheet in the file replace that tab's rows, and other tabs stay as they are. The owner's linked
 * workbook also brings its settings, so it needs access to the Settings tab.
 */
export async function POST(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  const preview = form.get('mode') === 'preview';
  try {
    const view = await getBudgetView(guard.ctx, id);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const linked = await parseLinkedWorkbook(bytes, view.state.settings);
    if (linked) {
      const body = { sheets: linked.sheets, rows: linked.rows.length, warnings: linked.warnings, linked: true };
      if (preview) return NextResponse.json({ ...body, saved: 0 });
      await updateSettings(guard.ctx, id, { version: view.settingsVersion, settings: linked.settings });
      const saved = await replaceRows(guard.ctx, id, linked.rows);
      return NextResponse.json({ ...body, saved });
    }
    const result = await parseBudgetWorkbook(bytes, view.state.settings);
    if (!result.sheets.length) return NextResponse.json({ error: 'no_sheets_found' }, { status: 400 });
    if (preview) return NextResponse.json({ sheets: result.sheets, rows: result.rows.length, warnings: result.warnings, saved: 0 });
    const saved = await replaceRows(guard.ctx, id, result.rows);
    return NextResponse.json({ sheets: result.sheets, rows: result.rows.length, warnings: result.warnings, saved });
  } catch (e) {
    return budgetError(e);
  }
}
