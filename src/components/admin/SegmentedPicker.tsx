'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
  value: T;
  /** Text, or a node for icon/count labels. */
  label: ReactNode;
};

/**
 * A segmented choice (K-09, rule R-11): small buttons on a quiet track; the
 * picked option is navy with white text. No sliding highlight. Used by the
 * starting-phase picker, entity origin, legal form and the questionnaire's
 * Yes/No rows.
 */
export function SegmentedPicker<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  labelledBy,
  ariaInvalid,
  ariaDescribedBy,
  columns,
  size = 'md',
  className,
}: {
  value: T | null;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
  ariaLabel?: string;
  labelledBy?: string;
  /** Required answer missing or wrong: exposed as `aria-invalid` on the group. */
  ariaInvalid?: boolean;
  /** Id of the error text that describes the group. */
  ariaDescribedBy?: string;
  /** Force a column count; defaults to one column per option. */
  columns?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const cols = columns ?? options.length;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-invalid={ariaInvalid || undefined}
      aria-describedby={ariaDescribedBy}
      className={cn('grid gap-0.5 rounded-lg bg-surface-sunken p-0.5 ring-1 ring-line', className)}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-center font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-3 text-[12.5px]',
              active ? 'bg-brand font-semibold text-on-brand shadow-shine' : 'text-ink-muted hover:text-ink',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
