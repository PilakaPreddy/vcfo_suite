'use client';

import { ChartFrame } from '@/components/charts/ChartFrame';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { useRecharts } from '@/components/charts/use-recharts';
import { CHART_CHROME, chartAxisProps, chartGridProps, chartMargin, chartReferenceProps, type ChartColor } from '@/components/charts/chart-theme';
import type { ChartRow, ChartSeries } from '@/components/charts/DashBarChart';

/**
 * The shared line chart, for a value over time (an exchange rate by day). Same frame, axes,
 * grid and tooltip as `DashBarChart`. The value axis fits the data instead of starting at zero,
 * since a rate moves in a narrow band. Optional `band` shades a range of values (for example
 * the booked rates of open invoices) and `reference` draws one dashed level with its label.
 * Lines are 2px with no dots; the hovered point shows a dot.
 */
export function DashLineChart({
  data,
  categoryKey,
  series,
  height = 220,
  loading,
  emptyLabel,
  valueFormatter,
  categoryFormatter,
  band,
  reference,
}: {
  data: ChartRow[];
  categoryKey: string;
  series: ChartSeries[];
  height?: number;
  loading?: boolean;
  emptyLabel?: string;
  valueFormatter?: (value: string | number | undefined) => string;
  /** How a category value (a date) reads on the axis and in the tooltip. */
  categoryFormatter?: (value: string) => string;
  band?: { from: number; to: number; label: string; color: ChartColor };
  reference?: { value: number; label: string };
}) {
  const RC = useRecharts();
  const empty = data.length === 0 || series.length === 0;
  if (!RC || empty) {
    return (
      <ChartFrame height={height} loading={(!RC || loading) && !empty} empty={empty} emptyLabel={emptyLabel}>
        <span />
      </ChartFrame>
    );
  }
  const { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } = RC;
  // The value axis covers the lines and any band or reference, with a little room above and below.
  const values = data.flatMap((r) => series.map((s) => Number(r[s.key]))).filter((n) => Number.isFinite(n));
  if (band) values.push(band.from, band.to);
  if (reference) values.push(reference.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.08;
  const fmt = (v: unknown) => (valueFormatter ? valueFormatter(v as number) : String(v));
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ ...chartMargin, left: 0, right: 12 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey={categoryKey} minTickGap={28} tickFormatter={categoryFormatter ? (v: string) => categoryFormatter(String(v)) : undefined} {...chartAxisProps} />
          <YAxis domain={[lo - pad, hi + pad]} width={56} tickFormatter={(v: number) => fmt(v)} {...chartAxisProps} />
          {band ? <ReferenceArea y1={band.from} y2={band.to} fill={band.color} fillOpacity={0.12} stroke="none" label={{ value: band.label, position: 'insideBottomLeft', fill: CHART_CHROME.muted, fontSize: 11 }} /> : null}
          {reference ? <ReferenceLine y={reference.value} {...chartReferenceProps(reference.label)} /> : null}
          <Tooltip
            cursor={{ stroke: CHART_CHROME.grid }}
            content={<ChartTooltip valueFormatter={valueFormatter} hideZero={false} />}
            labelFormatter={categoryFormatter ? (v: unknown) => categoryFormatter(String(v)) : undefined}
          />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_CHROME.surface }} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** A small trend line with no axes, for a stat card. Decorative: the card states the figures. */
export function DashSparkline({ data, valueKey, color, height = 36 }: { data: ChartRow[]; valueKey: string; color: ChartColor; height?: number }) {
  const RC = useRecharts();
  if (!RC || data.length < 2) return <div style={{ height }} aria-hidden />;
  const { Line, LineChart, ResponsiveContainer, YAxis } = RC;
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line type="monotone" dataKey={valueKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
