'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * KPI tile outside a hero (docs/design/COMPONENTS.md). A raised card with a
 * hairline frame (no coloured top edge since K-08), an 11px label, a 20px tabular figure, an optional
 * delta chip and an optional six-bar trend strip. Replaces AccentKpi and
 * KpiNumber. Headline numbers that belong to the page go in DashHero stats,
 * not here.
 */
export type StatCardTone = 'brand' | 'positive' | 'warning' | 'danger' | 'info' | 'highlight' | 'neutral';

/* No coloured top edge (K-08, rule R-02): the tone shows in the icon tile only. */

const ICON: Record<StatCardTone, string> = {
  brand: 'text-brand',
  positive: 'text-positive',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  highlight: 'text-highlight',
  neutral: 'text-ink-muted',
};

const TINT: Record<StatCardTone, string> = {
  brand: 'bg-brand-soft',
  positive: 'bg-positive-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
  highlight: 'bg-highlight-soft',
  neutral: 'bg-surface-sunken',
};

const BAR: Record<StatCardTone, string> = {
  brand: 'bg-brand',
  positive: 'bg-positive',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  highlight: 'bg-highlight-bright',
  neutral: 'bg-line-strong',
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  delta,
  trend,
  href,
  tinted = false,
  className,
}: {
  label: string;
  value: ReactNode;
  /** One short line under the figure. */
  hint?: ReactNode;
  tone?: StatCardTone;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Signed change, shown as a chip: positive is good, negative is bad. */
  delta?: { value: number; label?: string };
  /** Up to six values, oldest first; the last one draws solid, the rest faint. Context, not a chart. */
  trend?: number[];
  href?: string;
  /** Soft fill of the tone (SBC-Track KPI style). */
  tinted?: boolean;
  className?: string;
}) {
  const max = trend && trend.length ? Math.max(1, ...trend) : 1;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-muted">{label}</span>
        {Icon ? <Icon className={cn('h-4 w-4 shrink-0', ICON[tone])} strokeWidth={1.75} /> : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[20px] font-semibold leading-6 tabular-nums tracking-[-0.01em] text-ink">{value}</span>
        {delta ? (
          <span
            className={cn(
              'inline-flex h-chip items-center rounded-sm px-2 text-[11px] font-semibold tabular-nums',
              delta.value > 0
                ? 'bg-positive-soft text-positive'
                : delta.value < 0
                  ? 'bg-danger-soft text-danger'
                  : 'bg-surface-sunken text-ink-muted',
            )}
          >
            {delta.value > 0 ? '+' : delta.value < 0 ? '−' : ''}
            {Math.abs(delta.value)}
            {delta.label ? ` ${delta.label}` : ''}
          </span>
        ) : null}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-ink-muted">{hint}</div> : null}
      {trend && trend.length > 0 ? (
        <div className="mt-2.5 flex h-5 items-end gap-1" aria-hidden>
          {trend.slice(-6).map((n, i, arr) => (
            <span
              key={i}
              className={cn('w-full rounded-[2px]', BAR[tone], i < arr.length - 1 && 'opacity-30')}
              style={{ height: `${Math.max(12, Math.round((n / max) * 100))}%` }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
  const shell = cn(
    'block rounded-lg border border-line p-4 shadow-card',
    tinted ? TINT[tone] : 'bg-surface-raised',
    href && 'transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
    className,
  );
  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
