'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { cn } from '@/lib/utils';
import { CountBadge } from '@/views/compliances/spectrum-parts';

/**
 * GROUPED GRID — the R-07 T1 table with a folding band per group (prototype
 * register-parts `GroupedGrid`), for the staff Obligations and Registrations
 * lists. 36px head, 44px rows, 1px hairlines and page numbers under the
 * table. A band is either a plain label with a swatch and a count, or a
 * custom head (Obligations "by filing": date tile, name, area pill, "3 of 5
 * filed"). The whole row opens the record; links and buttons inside keep
 * their own click.
 */

export interface GridColumn<T> {
  key: string;
  label: ReactNode;
  /** CSS width, for example 128 or '18%'. */
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  /** For example "hidden md:table-cell" so the grid fits a phone. */
  className?: string;
  render: (row: T) => ReactNode;
}

export interface GridGroup<T> {
  id: string;
  label: string;
  /** Swatch class for a plain band, for example "bg-reg-gst". */
  dot?: string;
  rows: T[];
  /** Custom band content. */
  head?: ReactNode;
}

/**
 * The 52px card head with filters on the right (R-08). `DashSection` puts its
 * `meta` in a non-shrinking slot, which overflows on a phone once a head
 * carries a picker, switches and buttons, so the grids use this head instead.
 */
function GridHead({ title, count, right }: { title: string; count?: number; right?: ReactNode }) {
  return (
    <header className="flex min-h-[52px] flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-2">
      <CardHeadTile title={title} />
      <h2 className="min-w-0 truncate text-[15px] font-medium text-ink">{title}</h2>
      {count !== undefined ? <CountBadge n={count} /> : null}
      {right ? <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">{right}</div> : null}
    </header>
  );
}

/** A surface card with the filter head and a flush body (a T1 grid or a matrix). */
export function HeadCard({ title, count, right, children }: { title: string; count?: number; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="surface min-w-0 overflow-hidden" aria-label={title}>
      <GridHead title={title} count={count} right={right} />
      {children}
    </section>
  );
}

/**
 * List keys of the register pages (prototype `useListKeys`): "/" moves focus to the
 * list's filter (the search box or the first select in `filterRef`) instead of opening
 * Ask VCFO, and the up and down arrows move between the row links of the list in `ref`.
 * Enter on a focused link opens it, as any link does. Typing in a field is left alone.
 */
export function useListKeys(ref: RefObject<HTMLElement | null>, filterRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el) return;
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = filterRef.current?.matches('input, select, button')
          ? filterRef.current
          : filterRef.current?.querySelector<HTMLElement>('input, select, button');
        if (!target) return;
        // On a list page "/" goes to the list filter; capture runs before the shell's own listener.
        e.preventDefault();
        e.stopPropagation();
        target.focus();
        return;
      }
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || typing) return;
      const links = [...el.querySelectorAll<HTMLAnchorElement>('tbody a[href]')];
      if (links.length === 0) return;
      const active = document.activeElement;
      const at = links.indexOf(active as HTMLAnchorElement);
      // Only take the arrows when focus is in the list or nowhere in particular.
      if (at < 0 && !el.contains(active) && active && active !== document.body) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(links.length - 1, at + 1) : Math.max(0, at - 1);
      links[next]?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [ref, filterRef]);
}

/** The keyboard hint under a register list. Hidden on phones. */
export function KeyHint() {
  const k = 'rounded-sm border border-line px-1 text-[11px] text-ink-muted';
  return (
    <span className="hidden items-center gap-1 text-[12px] text-ink-faint md:inline-flex" aria-hidden>
      <kbd className={k}>↑</kbd>
      <kbd className={k}>↓</kbd> move · <kbd className={k}>Enter</kbd> open · <kbd className={k}>/</kbd> filter
    </span>
  );
}

type Entry<T> = { kind: 'g'; g: GridGroup<T>; open: boolean } | { kind: 'r'; row: T };

export function GroupedGrid<T>({
  title,
  right,
  bar,
  columns,
  groups,
  rowKey,
  rowHref,
  footer,
  pageSize = 30,
  empty = 'None',
  count,
}: {
  title: string;
  right?: ReactNode;
  /** A row under the head for switches (the Obligations category switch, S-1). */
  bar?: ReactNode;
  columns: GridColumn<T>[];
  groups: GridGroup<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  footer?: ReactNode;
  pageSize?: number;
  empty?: string;
  /** Number in the head badge. Default: every row. */
  count?: number;
}) {
  const router = useRouter();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const shown = groups.filter((g) => g.rows.length > 0);
  const entries: Entry<T>[] = shown.flatMap((g) => {
    const open = !closed[g.id];
    return [{ kind: 'g' as const, g, open }, ...(open ? g.rows.map((row) => ({ kind: 'r' as const, row })) : [])];
  });
  const total = shown.reduce((n, g) => n + g.rows.length, 0);
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = entries.slice((cur - 1) * pageSize, cur * pageSize);
  useEffect(() => setPage(1), [total]);
  const shownCount = count ?? total;

  return (
    <section className="surface min-w-0 overflow-hidden" aria-label={title}>
      <GridHead title={title} count={shownCount} right={right} />
      {bar ? <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">{bar}</div> : null}
      <div className="overflow-x-auto">
        <table className="grid-table md:min-w-[720px]">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.width }}
                  className={cn(c.className, c.align === 'right' && '!text-right', c.align === 'center' && '!text-center')}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-[13px] text-ink-faint">
                  {empty}
                </td>
              </tr>
            ) : null}
            {slice.map((e, i) => {
              if (e.kind === 'g') {
                return (
                  <tr key={`g-${e.g.id}`} className="[&>td]:!bg-surface-sunken">
                    <td
                      colSpan={columns.length}
                      className={cn('!h-auto !p-0', i === 0 ? '!border-t-0' : '!border-t-1.5 !border-t-line')}
                    >
                      <button
                        type="button"
                        aria-expanded={e.open}
                        onClick={() => setClosed({ ...closed, [e.g.id]: e.open })}
                        className={cn('flex w-full items-center gap-2 px-3 text-left', e.g.head ? 'py-3' : 'h-10 text-[13px] font-medium text-ink')}
                      >
                        {e.g.head ?? (
                          <>
                            {e.g.dot ? <i className={cn('h-2 w-2 flex-none rounded-[2px]', e.g.dot)} aria-hidden /> : null}
                            {e.g.label}
                            <span className="text-[12.5px] font-medium text-ink-muted">{e.g.rows.length}</span>
                          </>
                        )}
                        <ChevronDown
                          className={cn('ml-auto h-4 w-4 flex-none text-ink-muted transition-transform', !e.open && '-rotate-90')}
                          strokeWidth={1.6}
                          aria-hidden
                        />
                      </button>
                    </td>
                  </tr>
                );
              }
              const href = rowHref?.(e.row);
              return (
                <tr
                  key={rowKey(e.row)}
                  onClick={
                    href
                      ? (ev) => {
                          if (!(ev.target as HTMLElement).closest('a,button')) router.push(href);
                        }
                      : undefined
                  }
                  className={cn(href && 'cursor-pointer')}
                >
                  {columns.map((c, ci) => {
                    const v = c.render(e.row);
                    return (
                      <td key={c.key} className={cn(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                        {href && ci === 0 ? (
                          <Link href={href} className="-mx-2.5 block px-2.5 py-2 hover:underline">
                            {v}
                          </Link>
                        ) : (
                          v
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2 text-[13px] text-ink-muted">
        <span>
          {shownCount} row{shownCount === 1 ? '' : 's'} · page {cur} of {pages}
        </span>
        {footer}
        {pages > 1 ? (
          <nav className="ml-auto flex items-center gap-1" aria-label="Pages">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, cur - 1))}
              disabled={cur === 1}
              className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-sunken disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
            </button>
            {Array.from({ length: pages }, (_, n) => n + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === cur ? 'page' : undefined}
                className={cn('h-7 min-w-7 rounded-md px-1.5 font-medium tabular-nums', p === cur ? 'bg-brand text-on-brand' : 'hover:bg-surface-sunken')}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(Math.min(pages, cur + 1))}
              disabled={cur === pages}
              className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-sunken disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
            </button>
          </nav>
        ) : null}
      </footer>
    </section>
  );
}
