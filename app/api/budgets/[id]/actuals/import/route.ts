import { NextResponse } from 'next/server';
import { getBudgetView, saveActuals, saveLedgerMap } from '@/db/repositories/budgets';
import { parseActualsFile } from '@/lib/budget/xlsx';
import { MAX_IMPORT_BYTES, budgetError, denied, guardBudgets, type IdContext } from '../../../_respond';

/**
 * POST — read an accounts export (Tally, Zoho, payroll). Each ledger is matched to a budget line by
 * name or by the map kept from earlier imports. When ledgers remain unmatched, nothing is saved and
 * they come back, so the person can map them and send the file again with `map`.
 */
export async function POST(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(String(form.get('map') ?? '{}')) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: 'invalid_map' }, { status: 400 });
  }
  try {
    const view = await getBudgetView(guard.ctx, id);
    if (!view.access.canEnterActuals) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const { settings } = view.state;
    const parsed = await parseActualsFile(new Uint8Array(await file.arrayBuffer()), file.name, settings);
    if (!parsed.length) return NextResponse.json({ error: 'no_rows_found' }, { status: 400 });
    const byName = new Map(settings.lines.map((l) => [l.name.toLowerCase(), l.id]));
    const known = { ...settings.ledgerMap, ...map };
    const lineOf = (ledger: string) => known[ledger.toLowerCase()] || byName.get(ledger.toLowerCase());
    const unmatched = [...new Set(parsed.filter((p) => !lineOf(p.ledger)).map((p) => p.ledger))];
    if (unmatched.length) return NextResponse.json({ unmatched, saved: 0 });

    /* Several ledgers can share a line, so amounts add up within a line and month. */
    const totals = new Map<string, { period: string; lineId: string; amount: number; reason: string | null }>();
    for (const p of parsed) {
      const lineId = lineOf(p.ledger) as string;
      const key = `${p.period}|${lineId}`;
      const entry = totals.get(key) ?? { period: p.period, lineId, amount: 0, reason: null };
      entry.amount += p.amount;
      entry.reason = entry.reason ?? p.reason;
      totals.set(key, entry);
    }
    const saved = await saveActuals(guard.ctx, id, [...totals.values()], 'import');
    if (Object.keys(map).length) await saveLedgerMap(guard.ctx, id, Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v])));
    return NextResponse.json({ unmatched: [], saved });
  } catch (e) {
    return budgetError(e);
  }
}
