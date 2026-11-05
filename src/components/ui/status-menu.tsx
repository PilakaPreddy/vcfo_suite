'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { statusParts } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';

/** R-13: the six status words, in the order of the work. */
const SIX_WORDS = ['Not started', 'In progress', 'Waiting', 'Due soon', 'Overdue', 'Done'] as const;
export type SixWord = (typeof SIX_WORDS)[number];

const DOT: Record<SixWord, string> = {
  'Not started': 'bg-upcoming-mid',
  'In progress': 'bg-brand',
  Waiting: 'bg-waiting-mid',
  'Due soon': 'bg-warning-mid',
  Overdue: 'bg-danger-mid',
  Done: 'bg-positive-mid',
};

/** The six-word form of any status ("With client" is Waiting, "Due this week" is Due soon). */
function sixOf(status: string): SixWord {
  const w = statusParts(status).word;
  if ((SIX_WORDS as readonly string[]).includes(w)) return w as SixWord;
  if (/due/i.test(status)) return 'Due soon';
  return 'Not started';
}

/**
 * E-03: click a status chip to change the status. The child is the chip; it becomes the trigger
 * of a small light menu (D2) with the six words and a tick on the current one. `onChange` runs
 * only for a different word; the caller saves it and may show `toastUndo`. Arrow keys, Enter and
 * Escape work. Pass `words` to offer fewer than six (for example when a status cannot go back).
 */
export function StatusMenu({
  value,
  onChange,
  label,
  words = SIX_WORDS,
  disabled,
  children,
}: {
  /** The current status, in any wording. */
  value: string;
  onChange: (word: SixWord) => void;
  /** Row name for the screen reader: "GSTR-3B · Tidewater". */
  label: string;
  words?: readonly SixWord[];
  disabled?: boolean;
  children: ReactNode;
}) {
  const current = sixOf(value);
  if (disabled) return <>{children}</>;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-grid-ctl
          aria-label={`${label} · status ${current}. Change status`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="-m-0.5 inline-flex max-w-full rounded-md p-0.5 hover:bg-ink/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring data-[state=open]:bg-ink/[.06]"
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={12} className="w-[200px]" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="pb-1 text-[12px] font-medium text-ink-muted">Status</DropdownMenuLabel>
        {words.map((w) => (
          <DropdownMenuItem key={w} onSelect={() => w !== current && onChange(w)} className="flex h-[34px] items-center gap-2.5">
            <i className={cn('h-[7px] w-[7px] flex-none rounded-[2px]', DOT[w])} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{w}</span>
            {w === current ? <Check className="h-3.5 w-3.5 flex-none text-brand-text" strokeWidth={1.6} aria-label="Current" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
