import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProgressBar, type ProgressTone } from '@/components/common/ProgressBar';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Progress rows (prototype cards/ProgressList, K-23): the name in 13.5px, the value on the
 * right, an optional sub line, then a 6px bar in a status colour. A row with `href` is a link
 * with a chevron. Body only: put it in a `DashSection` with `flush`.
 *
 *   <ProgressList items={[{ id, name: 'Asha', sub: '4 clients · 12 open', pct: 62, value: '25 h' }]} />
 */
export interface ProgressItem {
  id: string;
  name: string;
  /** "4 clients · 12 open · 2 overdue". */
  sub?: string;
  /** Bar fill, 0 to 100. */
  pct: number;
  /** The text on the right; `{pct}%` when missing. */
  value?: string;
  tone?: ProgressTone;
  href?: string;
}

export function ProgressList({ items, empty = 'Nothing to show', className }: { items: ProgressItem[]; empty?: string; className?: string }) {
  if (items.length === 0) return <EmptyState title={empty} className="m-4" />;
  return (
    <ul className={className}>
      {items.map((it) => {
        const inner = (
          <>
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{it.name}</span>
              <span className="text-[12.5px] tabular-nums text-ink-muted">{it.value ?? `${Math.round(it.pct)}%`}</span>
              {it.href ? <ChevronRight size={16} strokeWidth={1.6} className="text-ink-faint" aria-hidden /> : null}
            </span>
            {it.sub ? <span className="block truncate text-[12.5px] text-ink-muted">{it.sub}</span> : null}
            <ProgressBar value={it.pct} tone={it.tone} className="mt-2" label={`${it.name} ${it.value ?? `${Math.round(it.pct)}%`}`} />
          </>
        );
        const cls = cn('block border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5', it.href && 'hover:bg-hover');
        return (
          <li key={it.id}>
            {it.href ? (
              <Link href={it.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
