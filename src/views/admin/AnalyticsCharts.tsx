'use client';

import { useRecharts } from '@/components/charts/use-recharts';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import {
  CHART_CHROME,
  CHART_STATUS,
  chartAxisProps,
  chartBarProps,
  chartGridProps,
  chartReferenceProps,
} from '@/components/charts/chart-theme';

/** One month from `/api/metrics/analytics`; null where the month has nothing to measure. */
export type AnalyticsChartRow = {
  m: string;
  completion: number | null;
  delay: number | null;
};

/* VCFO Spectrum Analytics charts (prototype AnalyticsScreen.tsx, rule R-25): status colours
   only. A month at or above target is green, below target blurple; the target and the
   benchmark are amber dashed lines. */

/* Prototype axes: the X axis keeps a base line in muted words; the Y axis has faint ticks and no line. */
const AXIS_X = {
  ...chartAxisProps,
  axisLine: { stroke: 'oklch(var(--line))' },
  tick: { ...chartAxisProps.tick, fontSize: 11.5 },
} as const;
const AXIS_Y = {
  ...chartAxisProps,
  tick: { ...chartAxisProps.tick, fontSize: 11.5, fill: 'oklch(var(--ink-faint))' },
} as const;

function ChartPlaceholder() {
  return <div className="h-full w-full animate-pulse rounded-md bg-surface-sunken" aria-hidden />;
}

export function AnalyticsCompletionChart({ data, target = 95 }: { data: AnalyticsChartRow[]; target?: number }) {
  const RC = useRecharts();
  if (!RC) return <ChartPlaceholder />;

  const { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } = RC;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 16, right: 4, left: -10, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid {...chartGridProps} />
        <XAxis dataKey="m" interval={0} {...AXIS_X} />
        {/* Bars start at zero; a cut-off axis makes a 66% month look like a sliver and a month at the floor vanish. */}
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" allowDecimals={false} allowDataOverflow={false} {...AXIS_Y} />
        <Tooltip
          cursor={{ fill: CHART_CHROME.cursor }}
          content={<ChartTooltip valueFormatter={(v) => `${v}% on time`} />}
        />
        <ReferenceLine y={target} {...chartReferenceProps(`${target}% target`)} />
        <Bar
          dataKey="completion"
          name="Rate"
          isAnimationActive={false}
          maxBarSize={chartBarProps.maxBarSize}
          radius={chartBarProps.radius}
        >
          {data.map((r) => (
            <Cell key={r.m} fill={(r.completion ?? 0) >= target ? CHART_STATUS.done : CHART_STATUS.active} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AnalyticsDelayChart({ data, benchmark = 2 }: { data: AnalyticsChartRow[]; benchmark?: number }) {
  const RC = useRecharts();
  if (!RC) return <ChartPlaceholder />;

  const { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } = RC;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 16, right: 12, left: -24, bottom: 0 }}>
        <CartesianGrid {...chartGridProps} />
        <XAxis dataKey="m" interval={0} {...AXIS_X} />
        <YAxis domain={[0, (max: number) => Math.max(5, Math.ceil(max))]} {...AXIS_Y} />
        <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} days`} />} />
        <ReferenceLine y={benchmark} {...chartReferenceProps(`${benchmark}d benchmark`)} />
        <Line
          type="monotone"
          dataKey="delay"
          name="Delay"
          connectNulls
          stroke={CHART_STATUS.active}
          strokeWidth={2}
          isAnimationActive={false}
          dot={{ r: 4, fill: CHART_CHROME.surface, stroke: CHART_STATUS.active, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: CHART_STATUS.active, stroke: CHART_CHROME.surface, strokeWidth: 2 }}
          // A "0" label would sit on the axis line and the month names; zero months need no label.
          label={{ position: 'top', fill: CHART_CHROME.ink, fontSize: 11, formatter: (v: unknown) => (Number(v) ? String(v) : '') }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Steps completed per week (prototype StepsPerWeek): blurple bars, 28px at most, with a base line. */
export function AnalyticsStepsChart({ data }: { data: Array<{ w: string; steps: number }> }) {
  const RC = useRecharts();
  if (!RC) return <ChartPlaceholder />;

  const { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } = RC;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid {...chartGridProps} />
        <XAxis dataKey="w" interval="preserveStartEnd" {...AXIS_X} />
        <YAxis allowDecimals={false} {...AXIS_Y} />
        <Tooltip cursor={{ fill: CHART_CHROME.cursor }} content={<ChartTooltip valueFormatter={(v) => `${v} steps`} />} />
        <Bar
          dataKey="steps"
          name="Steps"
          fill={CHART_STATUS.active}
          isAnimationActive={false}
          maxBarSize={28}
          radius={chartBarProps.radius}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
