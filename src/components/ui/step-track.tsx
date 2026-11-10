import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/* VCFO Spectrum steps (ST5, rule R-22; prototype StepMark.tsx and PhaseBar.tsx). */

export type StepState = 'done' | 'now' | 'next';
export type StepTone = 'prog' | 'teal' | 'warn' | 'bad';

const RING: Record<StepTone, string> = {
  prog: 'shadow-[inset_0_0_0_1.5px_oklch(var(--brand)),0_0_0_4px_oklch(var(--brand-soft))]',
  teal: 'shadow-[inset_0_0_0_1.5px_oklch(var(--waiting-mid)),0_0_0_4px_oklch(var(--waiting-soft))]',
  warn: 'shadow-[inset_0_0_0_1.5px_oklch(var(--warning-mid)),0_0_0_4px_oklch(var(--warning-soft))]',
  bad: 'shadow-[inset_0_0_0_1.5px_oklch(var(--danger-mid)),0_0_0_4px_oklch(var(--danger-soft))]',
};
const DOT: Record<StepTone, string> = { prog: 'bg-brand', teal: 'bg-waiting-mid', warn: 'bg-warning-mid', bad: 'bg-danger-mid' };

/**
 * ST5 step marker, 22px. Done: a green square with a tick. Live: a ring with a square in the
 * status colour and a soft halo. Upcoming: an empty square with a 1.5px solid edge (R-56, R-57:
 * never a dashed or dotted box). The mark is positioned and filled, so a `StepLink` drawn behind
 * it never shows through.
 */
export function StepMark({
  state,
  tone = 'prog',
  size = 22,
  className,
  label,
}: {
  state: StepState;
  tone?: StepTone;
  size?: 18 | 20 | 22;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'relative z-[1] inline-grid flex-none place-items-center rounded-mark',
        state === 'done' && 'bg-positive-mid text-white',
        state === 'now' && cn('bg-surface-raised', RING[tone]),
        state === 'next' && 'border-[1.5px] border-line-strong bg-surface-raised',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {state === 'done' ? <Check size={size - 9} strokeWidth={2.6} /> : null}
      {state === 'now' ? <i className={cn('h-2 w-2 rounded-[2px]', DOT[tone])} /> : null}
    </span>
  );
}

type Len = number | string;
/** A half-line's state; any falsy value draws nothing (so `i > 0 && …` reads naturally). */
export type StepLinkState = 'done' | 'todo' | false | '' | null | undefined;
const px = (v: Len) => (typeof v === 'number' ? `${v}px` : v);

/**
 * R-58: the line between two step marks (or checkboxes) in a vertical list, centred on the marks
 * at every size and every row height. Each row draws its own two half-lines: `up` runs from the
 * top of the row (and across the `gap` above it) down to this mark's centre, `down` runs from this
 * mark's centre to the bottom of the row. Two rows together join centre to centre, even when the
 * rows have different heights. The row must be `position: relative`; the line sits behind the
 * mark (StepMark is positioned and filled).
 *
 * - `x`: the mark's centre from the row's left edge (mark left + size / 2), a number in px or any
 *   CSS length (for example `var(--step-x)` for a value that changes at a breakpoint).
 * - `y`: the mark's centre from the row's top edge. Default `50%`, for rows that centre the mark.
 * - `up` / `down`: draw that half; `'done'` draws it green (the step above is done), `'todo'` grey.
 *   The `up` half of a row takes the state of the step above it.
 */
export function StepLink({
  x,
  y = '50%',
  up,
  down,
  gap = 0,
  className,
}: {
  x: Len;
  y?: Len;
  up?: StepLinkState;
  down?: StepLinkState;
  /** Space between this row and the row above it, which the `up` half also covers. */
  gap?: number;
  className?: string;
}) {
  const line = 'pointer-events-none absolute w-[1.5px] -translate-x-1/2';
  const tone = (s: 'done' | 'todo') => (s === 'done' ? 'bg-positive-mid' : 'bg-line');
  return (
    <>
      {up ? (
        <span
          aria-hidden
          data-step-link="up"
          className={cn(line, tone(up), className)}
          style={{ left: px(x), top: -gap, height: `calc(${px(y)} + ${gap}px)` }}
        />
      ) : null}
      {down ? (
        <span
          aria-hidden
          data-step-link="down"
          className={cn(line, tone(down), className)}
          style={{ left: px(x), top: px(y), bottom: 0 }}
        />
      ) : null}
    </>
  );
}

/**
 * ST5 phase track: one bar per phase, sized by its step count. A finished phase is green, the
 * current phase is blurple with a soft ring, a later phase is grey. On phones and in client
 * lists this is the whole step view. `stuck` draws the current phase red; `hrefFor` makes each
 * phase bar a link (for example to that phase of the record).
 */
export function PhaseBar({
  done,
  totals,
  names,
  className,
  tall = false,
  stuck = false,
  hrefFor,
}: {
  done: number[];
  totals: readonly number[];
  names?: string[];
  className?: string;
  /** 8px bars by default; `tall` draws the 10px home-card track. */
  tall?: boolean;
  /** The current phase is stuck: red fill and ring instead of blurple. */
  stuck?: boolean;
  /** A link per phase (index from 0); the bar becomes a link with the phase title. */
  hrefFor?: (phase: number) => string | undefined;
}) {
  const cur = totals.findIndex((t, i) => (done[i] ?? 0) < t);
  return (
    <span
      className={cn('flex min-w-[96px] items-center gap-1', tall ? 'h-2.5' : 'h-2', className)}
      role={hrefFor ? undefined : 'img'}
      aria-label={hrefFor ? undefined : totals.map((t, i) => `${names?.[i] ?? `Phase ${i + 1}`} ${done[i] ?? 0} of ${t}`).join(', ')}
    >
      {totals.map((t, i) => {
        const pct = t > 0 ? Math.round(((done[i] ?? 0) / t) * 100) : 0;
        const label = `${names?.[i] ?? `Phase ${i + 1}`} · ${done[i] ?? 0} of ${t}`;
        const isStuck = stuck && i === cur;
        const cls = cn(
          'relative h-full overflow-hidden rounded-bar bg-surface-sunken',
          i === cur && (isStuck ? 'ring-[1.5px] ring-danger-mid/50' : 'ring-[1.5px] ring-brand-line'),
        );
        const fill = (
          <span
            className={cn('absolute inset-y-0 left-0 rounded-bar', pct === 100 ? 'bg-positive-mid' : isStuck ? 'bg-danger-mid' : 'bg-brand')}
            style={{ width: pct > 0 ? `max(${pct}%, 6px)` : 0 }}
          />
        );
        const href = hrefFor?.(i);
        if (href)
          return (
            <Link key={i} href={href} className={cn(cls, 'hover:opacity-80')} style={{ flex: Math.max(1, t) }} title={label} aria-label={label}>
              {fill}
            </Link>
          );
        return (
          <span key={i} className={cls} style={{ flex: Math.max(1, t) }} title={label}>
            {fill}
          </span>
        );
      })}
    </span>
  );
}
