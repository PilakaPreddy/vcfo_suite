'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * The calendar month stepper (prototype `MonthNav`): a 32 px bordered pill
 * with ‹ "October ▾" "2026 ▾" ›. The month or the year opens a 304 px
 * picker: a 3 x 4 month grid, or a scrolling four-column year grid, with a
 * "Today" link at the foot. Keys are `yyyy-mm`.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthKeyOfParts = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`;

function parse(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y!, month: m! - 1 };
}

function stepMonthKey(key: string, k: number): string {
  const { year, month } = parse(key);
  const t = year * 12 + month + k;
  return monthKeyOfParts(Math.floor(t / 12), ((t % 12) + 12) % 12);
}

const pkBtn =
  'inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-[13px] font-medium text-ink hover:bg-surface-sunken aria-expanded:bg-surface-sunken';
const stepBtn = 'grid h-7 w-6 place-items-center rounded-sm text-ink-2 hover:bg-surface-sunken';
const headBtn = 'grid h-[30px] w-[30px] place-items-center rounded-md border border-line text-ink-2 hover:bg-surface-sunken';

export function MonthNav({ value, onChange, now }: { value: string; onChange: (key: string) => void; now: string }) {
  const { year, month } = parse(value);
  const nowP = parse(now);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'m' | 'y'>('m');
  const [viewY, setViewY] = useState(year);
  const [base, setBase] = useState(year - 12);
  const anchor = useRef<HTMLDivElement>(null);
  const yearsRef = useRef<HTMLDivElement>(null);

  const toggle = (m: 'm' | 'y') => {
    if (open && mode === m) {
      setOpen(false);
      return;
    }
    setMode(m);
    setViewY(year);
    setBase(year - 12 - ((((year - 12) % 4) + 4) % 4));
    setOpen(true);
  };

  useEffect(() => {
    if (!open || mode !== 'y') return;
    const g = yearsRef.current;
    const on = g?.querySelector<HTMLElement>('[data-on]');
    if (g && on) g.scrollTop = on.offsetTop - g.clientHeight / 2 + on.offsetHeight / 2;
  }, [open, mode, base]);

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchor} className="inline-flex h-8 flex-none items-center rounded-md border border-line bg-surface-raised px-0.5">
          <button type="button" className={stepBtn} aria-label="Previous month" onClick={() => onChange(stepMonthKey(value, -1))}>
            <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
          </button>
          <button type="button" className={pkBtn} aria-haspopup="dialog" aria-expanded={open && mode === 'm'} aria-label="Choose month" onClick={() => toggle('m')}>
            {MONTHS[month]}
            <ChevronDown className="h-3 w-3 text-ink-muted" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" className={pkBtn} aria-haspopup="dialog" aria-expanded={open && mode === 'y'} aria-label="Choose year" onClick={() => toggle('y')}>
            {year}
            <ChevronDown className="h-3 w-3 text-ink-muted" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" className={stepBtn} aria-label="Next month" onClick={() => onChange(stepMonthKey(value, 1))}>
            <ChevronRight className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        onInteractOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault();
        }}
        aria-label="Choose month and year"
        className="w-[304px] max-w-[calc(100vw-24px)] border-1.5 border-line bg-surface-raised p-3 text-ink"
      >
        <div className="mb-2.5 flex items-center justify-between gap-1.5">
          <button
            type="button"
            className={headBtn}
            aria-label={mode === 'm' ? 'Previous year' : 'Earlier years'}
            onClick={() => (mode === 'm' ? setViewY(viewY - 1) : setBase(base - 32))}
          >
            <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
          </button>
          <span className="flex items-center gap-1">
            <button
              type="button"
              className={cn('inline-flex h-[30px] items-center gap-1 rounded-md px-2.5 text-[14px] font-medium hover:bg-surface-sunken', mode === 'm' && 'bg-surface-sunken')}
              onClick={() => setMode('m')}
            >
              {MONTHS[month]} <ChevronDown className="h-3 w-3 text-ink-muted" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className={cn('inline-flex h-[30px] items-center gap-1 rounded-md px-2.5 text-[14px] font-medium hover:bg-surface-sunken', mode === 'y' && 'bg-surface-sunken')}
              onClick={() => setMode('y')}
            >
              {viewY} <ChevronDown className="h-3 w-3 text-ink-muted" strokeWidth={2} aria-hidden />
            </button>
          </span>
          <button
            type="button"
            className={headBtn}
            aria-label={mode === 'm' ? 'Next year' : 'Later years'}
            onClick={() => (mode === 'm' ? setViewY(viewY + 1) : setBase(base + 32))}
          >
            <ChevronRight className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
          </button>
        </div>
        {mode === 'm' ? (
          <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Months of ${viewY}`}>
            {SHORT.map((s, k) => {
              const on = viewY === year && k === month;
              const isNow = viewY === nowP.year && k === nowP.month;
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={`${MONTHS[k]} ${viewY}`}
                  aria-current={on ? 'date' : undefined}
                  onClick={() => pick(monthKeyOfParts(viewY, k))}
                  className={cn(
                    'h-[42px] rounded-md text-[14px] font-medium',
                    on ? 'bg-navy text-on-navy' : 'hover:bg-surface-sunken',
                    !on && isNow && 'shadow-[inset_0_0_0_1px_oklch(var(--navy-fill))]',
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        ) : (
          <div ref={yearsRef} className="grid max-h-[240px] grid-cols-4 gap-1 overflow-y-auto" role="group" aria-label="Years">
            {Array.from({ length: 32 }, (_, i) => base + i).map((y) => (
              <button
                key={y}
                type="button"
                data-on={y === year ? '' : undefined}
                aria-current={y === year ? 'date' : undefined}
                onClick={() => pick(monthKeyOfParts(y, month))}
                className={cn(
                  'h-[42px] rounded-md text-[13.5px] tabular-nums',
                  y === year ? 'bg-navy text-on-navy' : 'hover:bg-surface-sunken',
                  y !== year && y === nowP.year && 'shadow-[inset_0_0_0_1px_oklch(var(--navy-fill))]',
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2.5 flex justify-end border-t border-line-soft pt-2">
          <button type="button" className="rounded-sm px-1 text-[13px] font-medium text-brand-text hover:underline" onClick={() => pick(now)}>
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
