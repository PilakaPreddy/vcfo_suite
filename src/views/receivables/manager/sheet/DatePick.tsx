'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { addDaysIso, sheetDate } from '@/lib/receivables/dates';
import { isoOfLocal, localDateOf, parseDateText } from './date-text';

/**
 * The sheet's date picker (Phase 10): the day reads `02-Nov-26`, like every date on the sheet,
 * and a click opens a small card with a typed field (day first, see date-text.ts), the month
 * calendar (`ui/calendar`) and quick days. It replaces the browser's `mm/dd/yyyy` date input.
 *
 * `variant="cell"` is the borderless 32px look of an editable table cell; `variant="field"` is
 * the 40px form field of a dialog.
 */
export function DatePick({
  value,
  onChange,
  label,
  id,
  variant = 'field',
  min,
  max,
  quick = [0, 7, 15, 30],
  placeholder = 'Pick a date',
  className,
}: {
  /** ISO `YYYY-MM-DD`, or empty. */
  value: string;
  onChange: (iso: string) => void;
  /** Accessible name of the trigger ("Due date of Duravant SC/09/01"). */
  label: string;
  id?: string;
  variant?: 'cell' | 'field';
  min?: string;
  max?: string;
  /** Quick buttons, in days from today (0 is Today). */
  quick?: number[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const typed = parseDateText(text);
  const outOfRange = (iso: string) => Boolean((min && iso < min) || (max && iso > max));
  const today = isoOfLocal(new Date());
  const pick = (iso: string) => {
    if (outOfRange(iso)) return;
    onChange(iso);
    setOpen(false);
  };
  const selected = value ? localDateOf(value) : undefined;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setText(value ? sheetDate(value) : '');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={`${label}: ${value ? sheetDate(value) : 'not set'}`}
          className={cn(
            'inline-flex items-center gap-2 whitespace-nowrap text-left text-ink outline-none focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-focus-ring/25 data-[state=open]:border-brand',
            variant === 'cell'
              ? 'h-8 w-full rounded-md border border-transparent px-1.5 text-[13px] tabular-nums hover:border-line'
              : 'h-10 w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] tabular-nums',
            className,
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-ink-faint')}>{value ? sheetDate(value) : placeholder}</span>
          {variant === 'field' ? <CalendarDays className="size-4 flex-none text-ink-muted" strokeWidth={1.6} aria-hidden /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[292px] bg-surface-raised p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed) pick(typed);
          }}
        >
          <Input
            aria-label={`${label}, typed`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="02-Nov-26 or 2/11/2026"
            className="h-control-sm text-[13px]"
            aria-invalid={Boolean(text.trim()) && (!typed || outOfRange(typed))}
          />
          <Button type="submit" size="sm" disabled={!typed || outOfRange(typed)}>
            Set
          </Button>
        </form>
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected ?? localDateOf(typed ?? today)}
          onSelect={(d) => d && pick(isoOfLocal(d))}
          disabled={(d) => outOfRange(isoOfLocal(d))}
          className="relative -mx-1 p-1"
          classNames={{
            month_caption: 'flex h-8 items-center pl-1.5',
            caption_label: 'text-[13px] font-medium text-ink',
            nav: 'absolute right-1 top-1 z-10 flex items-center gap-1',
            button_previous: cn(buttonVariants({ variant: 'outline', size: 'iconSm' }), 'h-7 w-7'),
            button_next: cn(buttonVariants({ variant: 'outline', size: 'iconSm' }), 'h-7 w-7'),
            month: 'space-y-2',
            day_button: 'h-9 w-9 rounded-md p-0 text-[13px] font-normal tabular-nums text-ink hover:bg-ink/[.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25 aria-selected:bg-brand aria-selected:text-on-brand aria-selected:hover:bg-brand-strong',
            selected: 'rounded-md bg-brand text-on-brand [&>button]:text-on-brand',
            today: 'font-semibold [&>button]:ring-1 [&>button]:ring-brand/40',
            outside: 'text-ink-faint opacity-60',
          }}
        />
        {quick.length ? (
          <div className="flex gap-1.5 border-t border-line-soft pt-2.5" aria-label="Quick days, from today" role="group">
            {quick.map((n) => {
              const iso = addDaysIso(today, n);
              return (
                <Button key={n} type="button" size="sm" variant="ghost" className="flex-1 px-0" aria-label={n === 0 ? 'Today' : `${n} days from today`} disabled={outOfRange(iso)} onClick={() => pick(iso)}>
                  {n === 0 ? 'Today' : `+${n}d`}
                </Button>
              );
            })}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
