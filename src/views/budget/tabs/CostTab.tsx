'use client';

import { sumSeries } from '@/lib/budget/engine';
import { FREQUENCIES, MONTHS, TAX_PRESETS, type OnceData, type RecurringData } from '@/lib/budget/model';
import { cn } from '@/lib/utils';
import { Block, Field, NumberCell, SelectCell, TextCell } from '../cells';
import { inr } from '../format';
import { AddRow, CalcCells, GRID, GridScroll, IssueList, MonthHeads, MoreCell, NoRows, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import { lineOptions, rowsOf, type Ready } from '../types';

const FREQS = Object.entries(FREQUENCIES).map(([value, f]) => ({ value, label: f.label }));

/** The Admin tab and the Finance tab: recurring costs by rule, one-off costs typed by month. */
export function CostTab({ ready, section }: { ready: Ready; section: 'admin' | 'finance' }) {
  const { result, settings, b } = ready;
  const recurringKind = section === 'admin' ? 'admin_rec' : 'finance_rec';
  const onceKind = section === 'admin' ? 'admin_once' : 'finance_once';
  const recurring = rowsOf(ready, recurringKind);
  const once = rowsOf(ready, onceKind);
  const canEdit = ready.canEdit(section);
  const lines = lineOptions(settings);
  const monthOptions = result.calendar.map((m) => ({ value: String(m), label: MONTHS[m - 1] }));
  const months = result.calendar.map((m) => m - 1);

  const pasteOnce = (rowAt: number, fyAt: number, grid: number[][]) => {
    grid.forEach((line, dr) => {
      const row = once[rowAt + dr];
      if (!row) return;
      const next = [...((row.data as OnceData).months ?? Array(12).fill(0))];
      line.forEach((v, dc) => {
        if (fyAt + dc < 12) next[months[fyAt + dc]] = v;
      });
      b.patchRow(row.id, { months: next });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <IssueList ready={ready} section={section} />
      {section === 'finance' ? <TaxBlock ready={ready} /> : null}
      <Block
        title="Recurring costs"
        hint={section === 'admin' ? 'Costs that do not follow headcount: rent, internet, compliance, software.' : 'Fees and charges: audit, valuation, bank charges.'}
        footer={recurring.length ? <AddRow ready={ready} kind={recurringKind} section={section} label="Add recurring cost" /> : null}
      >
        {!recurring.length ? (
          <div className="p-4">
            <NoRows ready={ready} kind={recurringKind} section={section} title="No recurring costs yet." label="Add recurring cost" />
          </div>
        ) : (
          <GridScroll>
            <table className={GRID}>
              <thead>
                <tr>
                  <th className={cn(TH, STICKY, 'z-[2] min-w-[210px] text-left')}>Cost item</th>
                  <th className={cn(TH, 'min-w-[170px] text-left')}>Master Budget line</th>
                  <th className={cn(TH, 'min-w-[100px]')}>Amount, excl. GST</th>
                  <th className={cn(TH, 'min-w-[150px] text-left')}>Frequency</th>
                  <th className={cn(TH, 'min-w-[72px] text-left')}>Start</th>
                  <th className={cn(TH, 'min-w-[72px] text-left')}>End</th>
                  <th className={cn(TH, 'min-w-[60px]')}>GST %</th>
                  <th className={cn(TH, 'min-w-[72px]')}>Escalation %</th>
                  <th className={cn(TH, 'min-w-[72px] text-left')}>From</th>
                  <MonthHeads labels={result.labels} />
                  <th className={cn(TH, 'min-w-[100px]')}>Year</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {recurring.map((row) => {
                  const d = row.data as RecurringData;
                  const set = (patch: Record<string, unknown>) => b.patchRow(row.id, patch);
                  return (
                    <tr key={row.id}>
                      <td className={cn(TD_NAME, STICKY, 'p-0')}>
                        <TextCell label="Cost item" value={d.name} disabled={!canEdit} onChange={(v) => set({ name: v })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Master Budget line" value={d.lineId} disabled={!canEdit} options={lines} onChange={(v) => set({ lineId: v })} />
                      </td>
                      <td className={cn(TD, 'p-0')}>
                        <NumberCell label="Amount" value={d.amount} disabled={!canEdit} onChange={(v) => set({ amount: v ?? 0 })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Frequency" value={d.frequency} disabled={!canEdit} options={FREQS} onChange={(v) => set({ frequency: v })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Start month" value={d.startMonth ? String(d.startMonth) : ''} disabled={!canEdit} options={monthOptions} onChange={(v) => set({ startMonth: Number(v) })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="End month" value={d.endMonth ? String(d.endMonth) : ''} disabled={!canEdit} options={monthOptions} onChange={(v) => set({ endMonth: Number(v) })} />
                      </td>
                      <td className={cn(TD, 'p-0')}>
                        <NumberCell label="GST percent" percent value={d.gstPct} disabled={!canEdit} onChange={(v) => set({ gstPct: v ?? 0 })} />
                      </td>
                      <td className={cn(TD, 'p-0')}>
                        <NumberCell label="Escalation percent" percent value={d.escalationPct} disabled={!canEdit} onChange={(v) => set({ escalationPct: v ?? 0 })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Escalation from" value={d.escalationMonth ? String(d.escalationMonth) : ''} disabled={!canEdit} options={monthOptions} onChange={(v) => set({ escalationMonth: Number(v) })} />
                      </td>
                      <CalcCells series={result.rows[row.id]?.cost ?? Array(12).fill(0)} />
                      <MoreCell ready={ready} row={row} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GridScroll>
        )}
      </Block>

      <Block title="One-off and irregular costs" hint="Type the amount in its month, including any GST." footer={once.length ? <AddRow ready={ready} kind={onceKind} section={section} label="Add one-off cost" /> : null}>
        {!once.length ? (
          <div className="p-4">
            <NoRows ready={ready} kind={onceKind} section={section} title="No one-off costs yet." label="Add one-off cost" />
          </div>
        ) : (
          <GridScroll>
            <table className={GRID}>
              <thead>
                <tr>
                  <th className={cn(TH, STICKY, 'z-[2] min-w-[210px] text-left')}>Cost item</th>
                  <th className={cn(TH, 'min-w-[170px] text-left')}>Master Budget line</th>
                  <th className={cn(TH, 'min-w-[60px]')}>GST % included</th>
                  <MonthHeads labels={result.labels} />
                  <th className={cn(TH, 'min-w-[100px]')}>Year</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {once.map((row, rowAt) => {
                  const d = row.data as OnceData;
                  const set = (patch: Record<string, unknown>) => b.patchRow(row.id, patch);
                  return (
                    <tr key={row.id}>
                      <td className={cn(TD_NAME, STICKY, 'p-0')}>
                        <TextCell label="Cost item" value={d.name} disabled={!canEdit} onChange={(v) => set({ name: v })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Master Budget line" value={d.lineId} disabled={!canEdit} options={lines} onChange={(v) => set({ lineId: v })} />
                      </td>
                      <td className={cn(TD, 'p-0')}>
                        <NumberCell label="GST percent included" percent value={d.gstPct} disabled={!canEdit} onChange={(v) => set({ gstPct: v ?? 0 })} />
                      </td>
                      {months.map((m, i) => (
                        <td key={m} className={cn(TD, 'p-0')}>
                          <NumberCell
                            label={`${d.name || 'Cost'} ${result.labels[i]}`}
                            value={d.months?.[m] ?? 0}
                            disabled={!canEdit}
                            onChange={(v) => {
                              const next = [...(d.months ?? Array(12).fill(0))];
                              next[m] = v ?? 0;
                              set({ months: next });
                            }}
                            onPasteGrid={(grid) => pasteOnce(rowAt, i, grid)}
                          />
                        </td>
                      ))}
                      <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(sumSeries(result.rows[row.id]?.cost ?? []))}</td>
                      <MoreCell ready={ready} row={row} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GridScroll>
        )}
      </Block>
    </div>
  );
}

function TaxBlock({ ready }: { ready: Ready }) {
  const { settings, result, b } = ready;
  const canEdit = ready.canEdit('settings');
  const t = settings.tax;
  const set = (patch: Partial<typeof t>) => b.patchSettings({ tax: { ...t, ...patch } });
  const on = t.mode === 'cost_plus';
  return (
    <Block title="Income tax assumptions" hint={on ? `Effective rate ${(result.effectiveTaxRate * 100).toFixed(3)}%. Tax = ((total cost − GST) × mark-up + gratuity and leave provisions) × effective rate. An estimate, not tax advice.` : 'Off for this client. Turn it on for a cost-plus company.'}>
      <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Include in budget">
          <SelectCell label="Include income tax" blank={false} value={t.mode} disabled={!canEdit} options={[{ value: 'none', label: 'No' }, { value: 'cost_plus', label: 'Yes, cost plus' }]} onChange={(v) => set({ mode: v as typeof t.mode })} />
        </Field>
        <Field label="Preset">
          <SelectCell
            label="Tax preset"
            value=""
            disabled={!canEdit || !on}
            options={TAX_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            onChange={(key) => {
              const p = TAX_PRESETS.find((x) => x.key === key);
              if (p) set({ ratePct: p.ratePct, surchargePct: p.surchargePct, cessPct: p.cessPct });
            }}
          />
        </Field>
        <Field label="Mark-up %">
          <NumberCell label="Mark-up percent" percent value={t.markupPct} disabled={!canEdit || !on} onChange={(v) => set({ markupPct: v ?? 0 })} />
        </Field>
        <Field label="Tax rate %">
          <NumberCell label="Tax rate" percent value={t.ratePct} disabled={!canEdit || !on} onChange={(v) => set({ ratePct: v ?? 0 })} />
        </Field>
        <Field label="Surcharge %">
          <NumberCell label="Surcharge" percent value={t.surchargePct} disabled={!canEdit || !on} onChange={(v) => set({ surchargePct: v ?? 0 })} />
        </Field>
        <Field label="Cess %">
          <NumberCell label="Cess" percent value={t.cessPct} disabled={!canEdit || !on} onChange={(v) => set({ cessPct: v ?? 0 })} />
        </Field>
      </div>
    </Block>
  );
}
