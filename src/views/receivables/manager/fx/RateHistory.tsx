'use client';

import { useState } from 'react';
import { DashLineChart } from '@/components/charts';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { sheetDate } from '@/lib/receivables/dates';
import type { FxCurrencyDto } from '@/lib/receivables/fx-desk-wire';
import type { TrendWindow } from '@/lib/receivables/fx-desk';
import { pctText, signedRate } from './fx-format';

/**
 * The rate history of the FX tab (Phase 10): 90 days of the rate in force for one currency at a
 * time (currencies sit on very different scales, so they never share an axis). The booked rates
 * of the open invoices in that currency show as a shaded band with their weighted average as a
 * dashed line, so the manager sees at a glance whether today's rate is above or below them.
 * Under the chart, the 30 and 90 day minimum, maximum, average and change.
 */

const LINE = 'oklch(var(--data-1))';
const BAND = 'oklch(var(--data-2))';

function Stats({ w }: { w: TrendWindow }) {
  const cell = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[.04em] text-ink-faint">{label}</dt>
      <dd className="font-mono text-[13px] tabular-nums text-ink">{value}</dd>
    </div>
  );
  const r = (n: number | null) => (n === null ? '—' : n.toFixed(4));
  return (
    <div className="rounded-md bg-surface-sunken px-3 py-2">
      <div className="mb-1 text-[12px] font-semibold text-ink-2">{`Last ${w.days} days · ${w.points} rate${w.points === 1 ? '' : 's'}`}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
        {cell('Low', r(w.min))}
        {cell('High', r(w.max))}
        {cell('Average', r(w.avg))}
        {cell('Change', w.change === null ? '—' : `${signedRate(w.change)} (${pctText(w.changePct)})`)}
      </dl>
    </div>
  );
}

export function RateHistory({ currencies }: { currencies: FxCurrencyDto[] }) {
  const [pick, setPick] = useState(currencies[0]?.currency ?? 'USD');
  const c = currencies.find((x) => x.currency === pick) ?? currencies[0];
  if (!c) return null;
  const rows = c.history.map((p) => ({ date: p.date, rate: p.rate }));
  const booked = c.booked.filter((b) => b.rate > 0);
  const fc = booked.reduce((a, b) => a + b.fcAmount, 0);
  const avg = fc > 0 ? booked.reduce((a, b) => a + b.rate * b.fcAmount, 0) / fc : null;
  const lo = booked.length ? Math.min(...booked.map((b) => b.rate)) : null;
  const hi = booked.length ? Math.max(...booked.map((b) => b.rate)) : null;
  return (
    <div className="rounded-md border border-line bg-surface-raised p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {currencies.length > 1 ? (
          <SpectrumTabs label="Currency" items={currencies.map((x) => ({ key: x.currency, label: x.currency }))} value={c.currency} onChange={setPick} />
        ) : (
          <span className="text-[13px] font-semibold text-ink-2">{c.currency}</span>
        )}
        <span className="text-[12px] text-ink-muted">
          {avg !== null ? `Open invoices booked between ${lo!.toFixed(4)} and ${hi!.toFixed(4)}, average ${avg.toFixed(4)}` : `No open ${c.currency} invoices to compare`}
        </span>
      </div>
      <DashLineChart
        data={rows}
        categoryKey="date"
        series={[{ key: 'rate', label: `INR per ${c.currency}`, color: LINE }]}
        valueFormatter={(v) => (v === undefined ? '—' : Number(v).toFixed(c.today && c.today.rate < 10 ? 4 : 2))}
        categoryFormatter={sheetDate}
        emptyLabel={`No ${c.currency} rates stored in the last 90 days`}
        band={lo !== null && hi !== null && hi > lo ? { from: lo, to: hi, label: 'Booked range', color: BAND } : undefined}
        reference={avg !== null ? { value: Math.round(avg * 1e4) / 1e4, label: `Booked avg ${avg.toFixed(2)}` } : undefined}
      />
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <Stats w={c.trend.d30} />
        <Stats w={c.trend.d90} />
      </div>
    </div>
  );
}
