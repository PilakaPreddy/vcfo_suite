'use client';

/**
 * The journey tracker: four stops (Incorporation, Post-incorporation, Registration, Compliance)
 * joined by a thick line, like an order tracker. Travelled segments are green, the segment
 * leaving the current stop is blurple with a moving gradient, later segments are grey. A small
 * runner (framer-motion `layoutId`) runs from the first stop to the current one on mount.
 * Each stop is a button that opens its detail view.
 */
import { useEffect, useState } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { StepMark } from '@/components/ui/step-track';
import type { JStop } from './journey-model';
import { STATUS_WORD, markOf } from './status';

function Runner({ reduce }: { reduce: boolean }) {
  return (
    <m.div
      layoutId="journey-runner"
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 16 }}
      className="pointer-events-none absolute -top-7 left-1/2 -ml-[11px] h-[22px] w-[22px] text-brand-text"
      aria-hidden
    >
      <m.svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={reduce ? undefined : { y: [0, -2.5, 0] }}
        transition={reduce ? undefined : { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <circle cx="14" cy="4" r="2" fill="currentColor" />
        <path d="M13 7.5 10 12l3.5 2.5L12 20" />
        <path d="M10 12 6.5 10.5 5 13" />
        <path d="M13 8.5l3 2.5 3-1" />
        <path d="M13.5 14.5 17 16l1 4" />
      </m.svg>
    </m.div>
  );
}

export function TrackerBar({
  stops,
  currentStopId,
  selected,
  onSelect,
  reduce,
}: {
  stops: JStop[];
  currentStopId: JStop['id'];
  selected: JStop['id'];
  onSelect: (id: JStop['id']) => void;
  reduce: boolean;
}) {
  const current = Math.max(0, stops.findIndex((s) => s.id === currentStopId));
  // The runner starts at the first stop and runs to the current one after mount.
  const [at, setAt] = useState(reduce ? current : 0);
  useEffect(() => {
    if (reduce) {
      setAt(current);
      return;
    }
    const t = setTimeout(() => setAt(current), 350);
    return () => clearTimeout(t);
  }, [current, reduce]);

  const brand = 'oklch(var(--brand))';
  const soft = 'oklch(var(--brand-soft))';

  return (
    <div className="relative px-1 pt-8" role="group" aria-label="Journey stages">
      {/* The line runs between the first and last mark centres (each stop is a quarter wide). */}
      <div className="absolute left-[12.5%] right-[12.5%] top-[calc(2rem+10px)] flex h-1.5 overflow-hidden rounded-full" aria-hidden>
        {stops.slice(0, -1).map((s, i) =>
          i < current ? (
            <span key={s.id} className="h-full flex-1 bg-positive-mid" />
          ) : i === current ? (
            <m.span
              key={s.id}
              className="h-full flex-1"
              style={{ backgroundImage: `linear-gradient(90deg, ${brand}, ${soft}, ${brand})`, backgroundSize: '200% 100%' }}
              animate={reduce ? undefined : { backgroundPosition: ['0% 0%', '200% 0%'] }}
              transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: 'linear' }}
            />
          ) : (
            <span key={s.id} className="h-full flex-1 bg-line" />
          ),
        )}
      </div>
      <ol className="relative grid grid-cols-4">
        {stops.map((s, i) => {
          const mark = markOf(s.status);
          const isSel = s.id === selected;
          return (
            <li key={s.id} className="relative flex justify-center">
              {at === i ? <Runner reduce={reduce} /> : null}
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-pressed={isSel}
                aria-label={s.total ? `${s.label}: ${s.done} of ${s.total}, ${STATUS_WORD[s.status]}` : `${s.label}: starts later`}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-1.5 rounded-md px-1 pb-1.5 pt-0.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  isSel ? 'bg-brand-soft/60' : 'hover:bg-surface-sunken',
                )}
              >
                <StepMark state={mark.state} tone={mark.tone} />
                <span className={cn('max-w-full break-words text-[11.5px] font-medium leading-tight sm:truncate sm:text-[13.5px]', i === current ? 'text-brand-text' : 'text-ink')}>{s.label}</span>
                <span className="text-[11.5px] tabular-nums text-ink-muted sm:text-[12px]">
                  {s.total ? (
                    <>
                      {s.done} of {s.total}
                      <span className="max-sm:hidden"> · {STATUS_WORD[s.status]}</span>
                    </>
                  ) : (
                    'Starts later'
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
