'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SkippedFile } from './collect';

const SHOWN = 8;

/**
 * The files a drop left out, each with its reason. It is always visible when anything was left out,
 * because a file must never be dropped without the person seeing it. Long lists show the first few
 * and fold the rest into a "show all" line.
 */
export function SkippedList({ skipped, onDismiss, className }: { skipped: SkippedFile[]; onDismiss?: () => void; className?: string }) {
  if (skipped.length === 0) return null;
  const head = skipped.slice(0, SHOWN);
  const rest = skipped.slice(SHOWN);
  const row = (item: SkippedFile, i: number) => (
    <li key={`${item.path}-${i}`} className="flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 truncate font-mono text-[11.5px] text-ink" title={item.path}>
        {item.path}
      </span>
      <span className="flex-none text-ink-muted">{item.reason}</span>
    </li>
  );
  return (
    <section
      role="status"
      aria-label="Files left out"
      data-testid="ask-drop-skipped"
      className={cn('rounded-md border border-warning-mid/40 bg-warning-soft px-2.5 py-2 text-[12px] text-ink', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-warning">
          {skipped.length === 1 ? 'One file was left out' : `${skipped.length} files were left out`}
        </p>
        {onDismiss ? (
          <button type="button" aria-label="Hide the list of files left out" onClick={onDismiss} className="grid h-5 w-5 flex-none place-items-center rounded-mark text-ink-muted hover:bg-surface-raised">
            <X className="h-3 w-3" strokeWidth={1.6} />
          </button>
        ) : null}
      </div>
      <ul className="mt-1 space-y-0.5">{head.map(row)}</ul>
      {rest.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-brand-text">Show {rest.length} more</summary>
          <ul className="mt-1 space-y-0.5">{rest.map((item, i) => row(item, i + SHOWN))}</ul>
        </details>
      ) : null}
    </section>
  );
}
