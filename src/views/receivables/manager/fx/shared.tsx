'use client';

import type { ReactNode } from 'react';
import { inr } from '../../format';

/**
 * Shared pieces of the FX tab (Phase 10): the table cell classes, a titled section and a
 * scrolling table, the same look as the Reports tab so the two read as one workspace.
 */

export function Section({ title, aside, action, children, id }: { title: string; aside?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="mb-6" id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id={id ? `${id}-title` : undefined} className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">
            {title}
          </h2>
          {aside ? <div className="text-[12.5px] text-ink-muted">{aside}</div> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Table({ head, children, minWidth = 640, label }: { head: ReactNode; children: ReactNode; minWidth?: number; label?: string }) {
  return (
    <div className="relative overflow-x-auto rounded-md border border-line bg-surface-raised">
      <table className="w-full border-collapse text-[13px]" style={{ minWidth }} aria-label={label}>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** "+₹12,400" or "−₹3,100", green for a gain and red for a loss. */
export function Signed({ n, cost = false }: { n: number | null; cost?: boolean }) {
  if (n === null) return <span className="text-ink-faint">—</span>;
  // For a cost (the bank's spread) a positive figure is bad.
  const good = cost ? n < 0 : n > 0;
  const bad = cost ? n > 0 : n < 0;
  const tone = good ? 'text-positive' : bad ? 'text-danger' : 'text-ink-muted';
  return <span className={tone}>{`${n > 0 ? '+' : n < 0 ? '−' : ''}₹${inr(Math.abs(n))}`}</span>;
}
