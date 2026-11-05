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

