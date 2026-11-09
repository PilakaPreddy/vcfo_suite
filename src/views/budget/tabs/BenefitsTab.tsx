'use client';

import { BENEFIT_BASES, MONTHS, type BenefitData } from '@/lib/budget/model';
import { cn } from '@/lib/utils';
import { Block, NumberCell, SelectCell, TextCell } from '../cells';
import { AddRow, CalcCells, GRID, GridScroll, IssueList, MonthHeads, MoreCell, NoRows, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import { departmentOptions, lineOptions, rowsOf, type Ready } from '../types';

const BASES = Object.entries(BENEFIT_BASES).map(([value, b]) => ({ value, label: b.label }));

/** The HR tab: per-employee costs, driven by the headcount of the hiring plan. */
export function BenefitsTab({ ready }: { ready: Ready }) {
  const { settings, result, b } = ready;
  const rows = rowsOf(ready, 'benefit');
  const canEdit = ready.canEdit('benefits');
  const departments = departmentOptions(settings);
  const timing = [{ value: 'monthly', label: 'Every month' }, { value: 'quarter_end', label: 'Quarter-end months' }, ...result.calendar.map((m) => ({ value: String(m), label: MONTHS[m - 1] }))];

  return (
    <div className="flex flex-col gap-4">
      <IssueList ready={ready} section="benefits" />
      <Block
        title="Benefits and per-employee costs"
        hint="Monthly cost = cost per employee × eligible employees × timing. Headcount comes from the hiring plan."
        footer={rows.length ? <AddRow ready={ready} kind="benefit" section="benefits" label="Add benefit" /> : null}
      >
        {!rows.length ? (
          <div className="p-4">
            <NoRows ready={ready} kind="benefit" section="benefits" title="No benefits yet. Add insurance, meals, transport and similar costs." label="Add benefit" />
          </div>
        ) : (
          <GridScroll>
            <table className={GRID}>
              <thead>
                <tr>
                  <th className={cn(TH, STICKY, 'z-[2] min-w-[210px] text-left')}>Benefit</th>
                  <th className={cn(TH, 'min-w-[170px] text-left')}>Master Budget line</th>
                  <th className={cn(TH, 'min-w-[170px] text-left')}>Cost basis</th>
                  <th className={cn(TH, 'min-w-[96px]')}>Cost per unit</th>
                  <th className={cn(TH, 'min-w-[130px] text-left')}>Applies to</th>
                  <th className={cn(TH, 'min-w-[130px] text-left')}>Except</th>
                  <th className={cn(TH, 'min-w-[72px]')}>% eligible</th>
                  <th className={cn(TH, 'min-w-[130px] text-left')}>When charged</th>
                  <MonthHeads labels={result.labels} />
                  <th className={cn(TH, 'min-w-[100px]')}>Year</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = row.data as BenefitData;
                  const r = result.rows[row.id];
                  const set = (patch: Record<string, unknown>) => b.patchRow(row.id, patch);
                  return (
                    <tr key={row.id}>
                      <td className={cn(TD_NAME, STICKY, 'p-0')}>
                        <TextCell label="Benefit" value={d.name} disabled={!canEdit} onChange={(v) => set({ name: v })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Master Budget line" value={d.lineId} disabled={!canEdit} options={lineOptions(settings)} onChange={(v) => set({ lineId: v })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Cost basis" blank={false} value={d.basis} disabled={!canEdit} options={BASES} onChange={(v) => set({ basis: v })} />
                      </td>
                      <td className={cn(TD, 'p-0')}>
                        <NumberCell label={d.basis === 'pct_salary' ? 'Percent of salary' : 'Cost per unit'} percent={d.basis === 'pct_salary'} value={d.rate} disabled={!canEdit} onChange={(v) => set({ rate: v ?? 0 })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Applies to" blank={false} value={d.appliesTo || 'all'} disabled={!canEdit} options={[{ value: 'all', label: 'All' }, ...departments]} onChange={(v) => set({ appliesTo: v })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Except department" value={d.excludeDepartmentId} disabled={!canEdit} options={departments} onChange={(v) => set({ excludeDepartmentId: v })} />
                      </td>
                      <td className={cn(TD, 'p-0')}>
                        <NumberCell label="Percent eligible" percent placeholder="100" value={d.eligiblePct} disabled={!canEdit} onChange={(v) => set({ eligiblePct: v })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="When charged" blank={false} value={d.timing || 'monthly'} disabled={!canEdit} options={timing} onChange={(v) => set({ timing: v })} />
                      </td>
                      <CalcCells series={r?.cost ?? Array(12).fill(0)} />
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
