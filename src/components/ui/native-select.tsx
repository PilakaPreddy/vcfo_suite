import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * R-10: the compact dropdown filter (prototype ui/Select). A native select, styled: 30px (`sm`,
 * the default) or 40px (`md`), 1.5px edge, a 14px chevron. Use a few of these in place of long
 * filter chip rows.
 */
export interface FilterSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: Array<{ value: string; label: string }>;
  size?: 'sm' | 'md';
}

export function FilterSelect({ options, className, size = 'sm', ...rest }: FilterSelectProps) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <select
        className={cn(
          'appearance-none rounded-md border-1.5 border-line-strong bg-surface-raised pl-2.5 pr-7 font-medium text-ink shadow-control outline-none focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-focus-ring/25',
          size === 'sm' ? 'h-control-sm text-[13px]' : 'h-10 text-[14px]',
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} strokeWidth={1.6} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
    </span>
  );
}

