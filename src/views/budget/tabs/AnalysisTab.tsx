'use client';

import { useMemo, useState } from 'react';
import { FilterSelect } from '@/components/ui/native-select';
import { computeScenario, sumSeries } from '@/lib/budget/engine';
import { cn } from '@/lib/utils';
import { Block } from '../cells';
import { crore, inr, people } from '../format';
import { GRID, GridScroll, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import type { Ready } from '../types';

type View = 'cash' | 'department' | 'location' | 'scenarios';

/** The views a vCFO reads after the Master Budget: cash, who spends it, and what if. */
export function AnalysisTab({ ready }: { ready: Ready }) {
  const { result, state, settings } = ready;
  const [view, setView] = useState<View>('cash');
  const scenarios = useMemo(() => (view === 'scenarios' ? { high: computeScenario(state, 'high'), low: computeScenario(state, 'low') } : null), [view, state]);

  const table = (rows: { label: string; series: number[]; bold?: boolean }[]) => (
    <GridScroll>
      <table className={GRID}>
        <thead>
          <tr>
            <th className={cn(TH, STICKY, 'z-[2] min-w-[220px] text-left')}>INR</th>
            {result.labels.map((l) => (
              <th key={l} className={cn(TH, 'min-w-[92px]')}>
                {l}
              </th>
            ))}
            <th className={cn(TH, 'min-w-[110px]')}>Year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className={cn(TD_NAME, STICKY, r.bold && 'bg-surface-sunken font-semibold')}>{r.label}</td>
              {r.series.map((v, i) => (
                <td key={i} className={cn(TD, r.bold && 'bg-surface-sunken font-semibold')}>
                  {inr(v)}
                </td>
              ))}
              <td className={cn(TD, 'font-semibold', r.bold && 'bg-surface-sunken')}>{inr(sumSeries(r.series))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GridScroll>
  );

  const nonzero = (items: { name: string; total: number[] }[]) => items.filter((d) => sumSeries(d.total) !== 0).map((d) => ({ label: d.name, series: d.total }));
  const c = result.cash;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <FilterSelect aria-label="View" value={view} onChange={(e) => setView(e.target.value as View)} options={[{ value: 'cash', label: 'Cash flow' }, { value: 'department', label: 'By department' }, { value: 'location', label: 'By location' }, { value: 'scenarios', label: 'Scenarios' }]} />
      </div>

      {view === 'cash' ? (
        <Block title="Cash flow" hint={`Payment lag moves a cost to the month it is paid. Depreciation and provisions are not cash.${c.paidNextYear ? ` ₹${inr(c.paidNextYear)} falls due next year.` : ''}`}>
          {table([
            { label: 'Money going out', series: c.outflow },
            { label: 'Of which capital purchases', series: c.capex },
            { label: 'Of which recoverable GST', series: c.recoverableGst },
            { label: 'Funds needed', series: c.fundsRequest, bold: true },
          ])}
          <GridScroll>
            <table className={GRID}>
              <tbody>
                <tr>
                  <td className={cn(TD_NAME, STICKY, 'min-w-[220px] font-semibold')}>Closing cash after funding</td>
                  {c.closingBeforeFunding.map((v, i) => (
                    <td key={i} className={cn(TD, 'min-w-[92px]')}>
                      {inr(v)}
                    </td>
                  ))}
                  <td className={cn(TD, 'min-w-[110px]')} />
                </tr>
              </tbody>
            </table>
          </GridScroll>
        </Block>
      ) : null}

      {view === 'department' ? <Block title="Cost by department" hint="Costs with no department show as Shared.">{table(nonzero(result.byDepartment))}</Block> : null}
      {view === 'location' ? <Block title="Cost by location" hint="Costs with no location show as Shared. Add locations in Settings.">{table(nonzero(result.byLocation))}</Block> : null}

      {view === 'scenarios' && scenarios ? (
        <Block title="Scenarios" hint={`High: joiners ${settings.scenarios.high.hiresPct}%, costs ${settings.scenarios.high.costPct}%. Low: joiners ${settings.scenarios.low.hiresPct}%, costs ${settings.scenarios.low.costPct}%. Change these in Settings.`}>
          <GridScroll>
            <table className={GRID}>
              <thead>
                <tr>
                  <th className={cn(TH, STICKY, 'z-[2] min-w-[220px] text-left')}>Measure</th>
                  {['Low', 'Base', 'High'].map((h) => (
                    <th key={h} className={cn(TH, 'min-w-[120px]')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Total cost', (r) => crore(sumSeries(r.grandTotal))],
                    ['Operating cost', (r) => crore(sumSeries(r.operating))],
                    ['Income tax (estimate)', (r) => crore(sumSeries(r.tax))],
                    ['New joiners', (r) => people(sumSeries(r.headcount.joiners))],
                    ['Closing headcount', (r) => people(r.headcount.closing[11])],
                    ['Funds needed', (r) => crore(sumSeries(r.cash.fundsRequest))],
                  ] as [string, (r: typeof result) => string][]
                ).map(([label, value]) => (
                  <tr key={label}>
                    <td className={cn(TD_NAME, STICKY)}>{label}</td>
                    <td className={TD}>{value(scenarios.low)}</td>
                    <td className={cn(TD, 'font-semibold')}>{value(result)}</td>
                    <td className={TD}>{value(scenarios.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GridScroll>
        </Block>
      ) : null}
    </div>
  );
}
