'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Small status charts (VCFO Spectrum R-25; prototype cards/Donut and cards/StackedBar). Status
 * colours only, a legend beside or under the mark, the value right-aligned in the legend.
 *
 *   <Donut segments={[{ label: 'Done', value: 12, tone: 'ok' }, ...]} total={20} unit="filings" />
 *   <StackedBar title="Open steps" total={42} segments={...} />
 *
 * Pass `onSegment` to make each ring part and legend row a button (drill on click).
 */

export type SegmentTone = 'accent' | 'ok' | 'warn' | 'bad' | 'violet' | 'teal' | 'idle' | 'navy';

export interface Segment {
  label: string;
  value: number;
  tone: SegmentTone;
  /** Optional key passed back to `onSegment`; the label is used when it is missing. */
  key?: string;
}

/** Fill class per tone, for bars, swatches and dots. */
export const SEGMENT_FILL: Record<SegmentTone, string> = {
  accent: 'bg-brand',
  ok: 'bg-positive-mid',
  warn: 'bg-warning-mid',
  bad: 'bg-danger-mid',
  violet: 'bg-identity-mid',
  teal: 'bg-waiting-mid',
  idle: 'bg-upcoming-mid',
  navy: 'bg-navy',
};

/** Stroke colour per tone, for SVG marks. */
const SEGMENT_STROKE: Record<SegmentTone, string> = {
  accent: 'oklch(var(--brand))',
  ok: 'oklch(var(--positive-mid))',
  warn: 'oklch(var(--warning-mid))',
  bad: 'oklch(var(--danger-mid))',
  violet: 'oklch(var(--identity-mid))',
  teal: 'oklch(var(--waiting-mid))',
  idle: 'oklch(var(--upcoming-mid))',
  navy: 'oklch(var(--navy-fill))',
};

type RingPart = { value: number; stroke?: string; className?: string; label?: string; onClick?: () => void };

/**
 * The bare ring: 12px thick (scaled for other sizes), parts in order from twelve o'clock, a 2°
 * gap between parts when there is more than one. `children` sit in the centre.
 */
export function DonutRing({
  parts,
  size = 84,
  thickness = 12,
  children,
  className,
}: {
  parts: RingPart[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
  className?: string;
}) {
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((a, p) => a + p.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = shown.length > 1 ? (2 / 360) * c : 0;
  let offset = 0;
  return (
    <div className={cn('relative flex-none', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(var(--line-soft))" strokeWidth={thickness} />
        ) : (
          shown.map((p, i) => {
            const len = (p.value / total) * c;
            const dash = Math.max(0, len - gap);
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.stroke ?? 'currentColor'}
                className={cn(p.className, p.onClick && 'cursor-pointer transition-opacity hover:opacity-80')}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                onClick={p.onClick}
              />
            );
            offset += len;
            return el;
          })
        )}
      </svg>
      {children ? <span className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</span> : null}
    </div>
  );
}

/** R-25 (C1): donut in status colours, the total in the centre, the legend beside it. */
function Donut({
  segments,
  total,
  unit,
  title,
  size = 84,
  onSegment,
  className,
}: {
  segments: Segment[];
  total: ReactNode;
  /** Small word under the total: "tasks". */
  unit?: string;
  /** 13px muted title above the legend. */
  title?: string;
  size?: 72 | 84 | 96 | 120;
  /** Drill: called with the segment when its ring part or legend row is clicked. */
  onSegment?: (segment: Segment) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <DonutRing
        size={size}
        parts={segments.map((s) => ({
          value: s.value,
          stroke: SEGMENT_STROKE[s.tone],
          label: s.label,
          onClick: onSegment ? () => onSegment(s) : undefined,
        }))}
      >
        <b className={cn('font-medium leading-none text-ink', size === 120 ? 'text-[26px]' : 'text-[22px]')}>{total}</b>
        {unit ? <span className="mt-1 text-[12px] text-ink-muted">{unit}</span> : null}
      </DonutRing>
      <div className="min-w-0 flex-1">
        {title ? <h3 className="mb-1.5 text-[13px] font-medium text-ink-muted">{title}</h3> : null}
        <Legend segments={segments} onSegment={onSegment} />
      </div>
    </div>
  );
}

/** R-25 (C2): a split as one stacked bar with a legend under it. */
function StackedBar({
  segments,
  total,
  title,
  height = 8,
  format = (n) => String(n),
  onSegment,
  className,
}: {
  segments: Segment[];
  /** 26px number at the right of the title row. */
  total?: ReactNode;
  /** 13px muted title above the bar. */
  title?: string;
  height?: 6 | 8 | 10;
  format?: (n: number) => string;
  onSegment?: (segment: Segment) => void;
  className?: string;
}) {
  const sum = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className={cn('grid gap-2.5', className)}>
      {title || total !== undefined ? (
        <div className="flex items-baseline gap-2">
          {title ? <span className="text-[13px] font-medium text-ink-muted">{title}</span> : null}
          {total !== undefined ? <span className="ml-auto text-[26px] font-medium leading-none text-ink">{total}</span> : null}
        </div>
      ) : null}
      <span className="flex w-full gap-0.5 overflow-hidden rounded-bar" style={{ height }} aria-hidden>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <i key={s.key ?? s.label} className={cn('block h-full rounded-[2px]', SEGMENT_FILL[s.tone])} style={{ width: `${(s.value / sum) * 100}%` }} />
          ))}
      </span>
      <Legend segments={segments} format={format} onSegment={onSegment} />
    </div>
  );
}

/** Vertical legend: 8px swatch, the label, the value right-aligned, 13px ink-2. */
function Legend({
  segments,
  format = (n) => String(n),
  onSegment,
}: {
  segments: Segment[];
  format?: (n: number) => string;
  onSegment?: (segment: Segment) => void;
}) {
  return (
    <ul className="grid gap-1">
      {segments.map((s) => {
        const inner = (
          <>
            <i className={cn('h-2 w-2 flex-none rounded-[2px]', SEGMENT_FILL[s.tone])} aria-hidden />
            <span className="min-w-0 truncate">{s.label}</span>
            <b className="ml-auto pl-3 font-medium tabular-nums text-ink">{format(s.value)}</b>
          </>
        );
        return (
          <li key={s.key ?? s.label} className="text-[13px] text-ink-2">
            {onSegment ? (
              <button
                type="button"
                onClick={() => onSegment(s)}
                className="-mx-1 flex w-[calc(100%+8px)] items-center gap-2 rounded-mark px-1 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
              >
                {inner}
              </button>
            ) : (
              <span className="flex items-center gap-2">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
