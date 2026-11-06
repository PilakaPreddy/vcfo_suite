'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashBarChart } from '@/components/charts/DashBarChart';
import type { ChartColor } from '@/components/charts/chart-theme';
import { FilterSelect } from '@/components/ui/native-select';
import { rollUp, sumSeries, toReportCurrency } from '@/lib/budget/engine';
import { cn } from '@/lib/utils';
import { Block } from '../cells';
import { crore, inr, people } from '../format';
import { GRID, GridScroll, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import type { Ready } from '../types';

type Period = 'month' | 'quarter' | 'half';

const COLORS: ChartColor[] = [1, 2, 3, 4, 5, 6].map((n) => `oklch(var(--data-${n}))`);

/** The Master Budget. Nobody types here: it is the sum of every tab. */
export function MasterTab({ ready }: { ready: Ready }) {
  const { result, settings } = ready;
  const [period, setPeriod] = useState<Period>('month');
  /* A year of months does not fit a phone, so a phone opens on quarters. */
  useEffect(() => {
    if (window.innerWidth < 640) setPeriod('quarter');
  }, []);

  const shape = (s: number[]) => (period === 'month' ? s : rollUp(s, period === 'quarter' ? 3 : 6));
  const heads = period === 'month' ? result.labels : period === 'quarter' ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['H1', 'H2'];
  const grand = sumSeries(result.grandTotal);
  const report = toReportCurrency(settings, result.grandTotal);
  const reportCode = settings.reportCurrency;
  const difference = sumSeries(result.reconciliation.difference);
  const balanced = !result.unmapped.length && Math.abs(difference) < 1;
  const benefits = result.groups.find((g) => g.group.toLowerCase() === 'employee benefits');
  const salaryTotal = sumSeries(result.salary);

  const chart = useMemo(
    () =>
      result.labels.map((label, i) => {
        const row: Record<string, string | number> = { label };
        result.groups.forEach((g) => (row[g.group] = g.total[i]));
        row.Tax = result.tax[i];
        return row;
      }),
    [result],
  );
  const hasTax = sumSeries(result.tax) !== 0;
  const series = [...result.groups.map((g, i) => ({ key: g.group, label: g.group, color: COLORS[i % COLORS.length], stackId: 'cost' })), ...(hasTax ? [{ key: 'Tax', label: 'Income tax', color: COLORS[result.groups.length % COLORS.length], stackId: 'cost' }] : [])];

  const line = (label: string, s: number[], opts: { bold?: boolean; indent?: boolean; negative?: boolean } = {}) => {
    const total = sumSeries(s);
    const cls = cn(opts.bold && 'bg-surface-sunken font-semibold');
    return (
      <tr key={label}>
        <td className={cn(TD_NAME, STICKY, 'whitespace-normal', cls, opts.indent && 'pl-4')}>{label}</td>
        {shape(s).map((v, i) => (
          <td key={i} className={cn(TD, cls)}>
            {inr(opts.negative ? -v : v)}
          </td>
        ))}
        <td className={cn(TD, 'font-semibold', cls)}>{inr(opts.negative ? -total : total)}</td>
        <td className={cn(TD, cls)}>{inr(total / 12)}</td>
        <td className={cn(TD, cls)}>{grand ? `${((total / grand) * 100).toFixed(1)}%` : '–'}</td>
      </tr>
    );
  };

  const headRow = (label: string, values: number[], total: string) => (
    <tr key={label}>
      <td className={cn(TD_NAME, STICKY)}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={TD}>
          {people(v)}
        </td>
      ))}
      <td className={cn(TD, 'font-semibold')}>{total}</td>
      <td className={TD} />
      <td className={TD} />
    </tr>
  );
  const size = period === 'month' ? 1 : period === 'quarter' ? 3 : 6;
  const atEnd = (s: number[]) => s.filter((_, i) => (i + 1) % size === 0);
  const atStart = (first: number) => [first, ...result.headcount.closing.filter((_, i) => (i + 1) % size === 0).slice(0, -1)];

  const metric = (label: string, s: number[], format: (v: number) => string, total: string) => (
    <tr key={label}>
      <td className={cn(TD_NAME, STICKY, 'whitespace-normal')}>{label}</td>
      {s.map((v, i) => (
        <td key={i} className={TD}>
          {format(v)}
        </td>
      ))}
      <td className={cn(TD, 'font-semibold')}>{total}</td>
      <td className={TD} />
      <td className={TD} />
    </tr>
  );

  /* A metric for a period is its total cost over the people paid across it. */
  const perEmployee = heads.map((_, p) => {
    const cost = sumSeries(result.grandTotal.slice(p * size, (p + 1) * size));
    const months = sumSeries(result.headcount.closing.slice(p * size, (p + 1) * size));
    return months ? cost / months : 0;
  });
  const benefitShare = heads.map((_, p) => {
    const salary = sumSeries(result.salary.slice(p * size, (p + 1) * size));
    const cost = sumSeries((benefits?.total ?? []).slice(p * size, (p + 1) * size));
    return salary ? (cost / salary) * 100 : 0;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Total cost" value={crore(grand)} note={hasTax ? 'Including estimated tax' : 'For the year'} />
        <Tile label="Operating cost" value={crore(sumSeries(result.operating))} note="Before tax" />
        <Tile label="Closing headcount" value={people(result.headcount.closing[11])} note={`From ${people(result.headcount.opening)} at the start`} />
        <Tile label="Cost per employee, per month" value={crore(result.costPerEmployeeMonth)} note="Average across the year" />
        {report ? <Tile label={`Total in ${reportCode}`} value={Math.round(sumSeries(report)).toLocaleString('en-IN')} note="At the rates in Settings" /> : <Tile label="Income tax" value={crore(sumSeries(result.tax))} note={hasTax ? 'Estimate' : 'Off for this client'} />}
      </div>

      <Block title="Cost by month">
        <div className="p-4">
          <DashBarChart data={chart} categoryKey="label" series={series} height={220} valueFormatter={(v) => crore(Number(v ?? 0))} emptyLabel="Nothing entered yet." />
        </div>
      </Block>

      <Block
        title="Master Budget"
        hint={balanced ? 'All costs mapped. The tabs add up to this total.' : `₹${inr(Math.abs(difference))} is not mapped to a line. ${result.unmapped.map((u) => u.name).join(', ')}.`}
        right={<FilterSelect aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} options={[{ value: 'month', label: 'Months' }, { value: 'quarter', label: 'Quarters' }, { value: 'half', label: 'Half-years' }]} />}
      >
        <GridScroll>
          <table className={GRID}>
            <thead>
              <tr>
                <th className={cn(TH, STICKY, 'z-[2] min-w-[220px] text-left')}>INR</th>
                {heads.map((h) => (
                  <th key={h} className={cn(TH, 'min-w-[92px]')}>
                    {h}
                  </th>
                ))}
                <th className={cn(TH, 'min-w-[110px]')}>Year</th>
                <th className={cn(TH, 'min-w-[92px]')}>Avg per month</th>
                <th className={cn(TH, 'min-w-[70px]')}>% of total</th>
              </tr>
            </thead>
            <tbody>
              {headRow('Opening headcount', atStart(result.headcount.opening), people(result.headcount.opening))}
              {headRow('New joiners', shape(result.headcount.joiners), people(sumSeries(result.headcount.joiners)))}
              {sumSeries(result.headcount.exits) ? headRow('Exits', shape(result.headcount.exits), people(sumSeries(result.headcount.exits))) : null}
              {headRow('Closing headcount', atEnd(result.headcount.closing), people(result.headcount.closing[11]))}
              {result.groups.map((g) => (
                <GroupRows key={g.group}>
                  {g.lineIds
                    .filter((id) => !settings.lines.find((l) => l.id === id)?.system || sumSeries(result.lines[id]) !== 0)
                    .map((id) => line(settings.lines.find((l) => l.id === id)?.name ?? '', result.lines[id], { indent: true }))}
                  {line(`Total ${g.group.toLowerCase()}`, g.total, { bold: true })}
                </GroupRows>
              ))}
              {line('Total operating cost, before tax', result.operating, { bold: true })}
              {hasTax ? line('Less: GST included above', result.gstInCost, { negative: true }) : null}
              {hasTax ? line('Cost base for income tax', result.taxBase) : null}
              {hasTax ? line('Income tax (estimate)', result.tax) : null}
              {line('Total cost', result.grandTotal, { bold: true })}
              {report ? metric(`Total cost (${reportCode})`, shape(report), (v) => Math.round(v).toLocaleString('en-IN'), Math.round(sumSeries(report)).toLocaleString('en-IN')) : null}
              {metric('Cost per employee per month', perEmployee, inr, inr(result.costPerEmployeeMonth))}
              {metric('Benefits as % of salaries', benefitShare, (v) => (v ? `${v.toFixed(1)}%` : '–'), salaryTotal ? `${((sumSeries(benefits?.total ?? []) / salaryTotal) * 100).toFixed(1)}%` : '–')}
            </tbody>
          </table>
        </GridScroll>
        {hasTax ? <p className="px-4 py-2.5 text-[12px] text-ink-muted">Income tax is an estimate from the assumptions on the Finance tab. It is not tax advice.</p> : null}
      </Block>
    </div>
  );
}

const GroupRows = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-4 py-3">
      <div className="text-[12px] font-semibold text-ink-muted">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-[12px] text-ink-muted">{note}</div>
    </div>
  );
}
