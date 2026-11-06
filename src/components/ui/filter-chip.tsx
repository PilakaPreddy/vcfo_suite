'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { Check, Plus, SlidersHorizontal, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
  /** How many rows the option would show, printed muted at the right of the menu row. */
  count?: number;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25';

/**
 * Filter chip (VCFO Spectrum R-10, Q3, B-05; prototype `FilterChip`), 28px.
 *
 * - Set: a soft blurple fill, "Label Value" and an × that clears the filter.
 * - Not set: a dashed "+ Label" chip.
 * Both open a light menu with 34px rows (D2). This is a superset of `WorkFilterChip`: a chip with
 * no options can only be cleared (for a filter that arrives from a link), and `valueLabel`
 * replaces the shown value.
 */
export function FilterChip<V extends string | null = string>({
  label,
  value,
  options,
  onChange,
  none = '' as V,
  valueOnly,
  valueLabel,
  className,
}: {
  /** "Status", "Lead", "Area". */
  label: string;
  value: V;
  options: FilterOption[];
  onChange: (value: V) => void;
  /** The value that means "not set": "" by default; null or "all" where a screen stores it so. */
  none?: V;
  /** Set chip: hide the label and show the value only. */
  valueOnly?: boolean;
  /** Shown instead of the option label, for set-only chips. */
  valueLabel?: string;
  className?: string;
}) {
  const isSet = value !== none && value !== null && value !== '';
  const picked = options.find((o) => o.value === value);
  const shown = valueLabel ?? picked?.label ?? (isSet ? String(value) : undefined);
  const choices = options.filter((o) => o.value !== none);
  const menu =
    choices.length > 0 ? (
      <DropdownMenuContent align="start" sideOffset={4} collisionPadding={12} className="max-h-[320px] min-w-[180px] overflow-y-auto">
        {choices.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value as V)} className="flex h-[34px] items-center gap-2.5">
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count !== undefined ? <span className="flex-none text-[12px] tabular-nums text-ink-muted">{o.count}</span> : null}
            {o.value === value ? <Check className="h-3.5 w-3.5 flex-none text-brand-text" strokeWidth={1.6} aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    ) : null;

  if (isSet) {
    const body = (
      <>
        {valueOnly ? null : <span className="text-ink-2">{label}</span>}
        <b className="max-w-[160px] truncate font-medium">{shown}</b>
      </>
    );
    return (
      <span
        className={cn(
          'inline-flex h-7 max-w-full flex-none items-center gap-1.5 rounded-md border-1.5 border-brand-line bg-brand-soft pl-2.5 pr-1 text-[13px] text-brand-text',
          className,
        )}
      >
        {menu ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-sm', FOCUS)}
                aria-label={`${label}: ${shown}. Change`}
              >
                {body}
              </button>
            </DropdownMenuTrigger>
            {menu}
          </DropdownMenu>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">{body}</span>
        )}
        <button
          type="button"
          aria-label={`Remove ${label} filter`}
          onClick={() => onChange(none)}
          className={cn('grid h-[18px] w-[18px] flex-none place-items-center rounded-sm text-brand-text hover:bg-brand-line', FOCUS)}
        >
          <X className="h-[13px] w-[13px]" strokeWidth={1.6} aria-hidden />
        </button>
      </span>
    );
  }

  if (!menu) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 flex-none items-center gap-1.5 whitespace-nowrap rounded-md border-1.5 border-dashed border-line-strong px-2.5 text-[13px] font-medium text-ink-2',
            'hover:bg-surface-sunken data-[state=open]:bg-surface-sunken',
            FOCUS,
            className,
          )}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
          {label}
        </button>
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  );
}

/**
 * An on/off filter chip with an optional count, the shape of `DashFilterChip`: a set chip has the
 * soft blurple fill, an unset one is a quiet white chip with a 1.5px edge.
 */
export function FilterToggleChip({
  on,
  label,
  count,
  onClick,
  className,
}: {
  on: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex h-7 flex-none items-center whitespace-nowrap rounded-md border-1.5 border-line bg-surface-raised px-2.5 text-[13px] font-medium text-ink-2 hover:border-line-strong',
        on && 'border-brand-line bg-brand-soft text-brand-text hover:border-brand-line',
        FOCUS,
        className,
      )}
    >
      {label}
      {count === undefined ? null : <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
    </button>
  );
}

export interface FilterRowChip {
  key: string;
  /** The chip holds a value. Set chips always show, even past `max`. */
  set: boolean;
  node: ReactNode;
}

/**
 * Which chips a row shows. The first `max` chips show, and every set chip shows wherever it is.
 * The rest wait behind "More filters · n" until `more` is true.
 */
export function filterRowLayout(chips: FilterRowChip[], max: number, more: boolean) {
  const hidden = chips.filter((c, i) => i >= max && !c.set);
  const shown = more ? chips : chips.filter((c, i) => i < max || c.set);
  return { shown, hiddenCount: hidden.length, anySet: chips.some((c) => c.set) };
}

/**
 * A row of filter chips (Q3). Shows the first `max` chips (4), then "More filters" for the rest.
 * Set chips always show. "Clear all" appears when any chip is set and `onClear` is given.
 */
export function FilterChipRow({
  chips,
  onClear,
  max = 4,
  className,
  children,
}: {
  chips: FilterRowChip[];
  onClear?: () => void;
  max?: number;
  className?: string;
  /** Extra things at the end of the row (tabs, a count). */
  children?: ReactNode;
}) {
  const [more, setMore] = useState(false);
  const { shown, hiddenCount, anySet } = filterRowLayout(chips, max, more);
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((c) => (
        <Fragment key={c.key}>{c.node}</Fragment>
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          className={cn(
            'inline-flex h-7 flex-none items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-ink/[.06]',
            FOCUS,
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
          {more ? 'Fewer filters' : `More filters · ${hiddenCount}`}
        </button>
      ) : null}
      {anySet && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className={cn(
            'inline-flex h-7 flex-none items-center whitespace-nowrap rounded-md px-2 text-[13px] font-medium text-brand-text hover:bg-brand-soft',
            FOCUS,
          )}
        >
          Clear all
        </button>
      ) : null}
      {children}
    </div>
  );
}
