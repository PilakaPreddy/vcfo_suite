'use client';

import { sumSeries } from '@/lib/budget/engine';
import { FREQUENCIES, MONTHS, type OnceData, type RecurringData } from '@/lib/budget/model';
import { cn } from '@/lib/utils';
import { Block, NumberCell, SelectCell, TextCell } from '../cells';
import { inr } from '../format';
import { AddRow, CalcCells, GRID, GridScroll, IssueList, MonthHeads, MoreCell, NoRows, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import { AdvanceTax } from '../tax/AdvanceTax';
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
      {section === 'finance' ? <AdvanceTax ready={ready} /> : null}
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
