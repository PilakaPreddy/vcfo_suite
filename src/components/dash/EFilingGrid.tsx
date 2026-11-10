'use client';

import { useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BulkBar, type BulkAction } from '@/components/ui/bulk-bar';
import { DensityMenu } from '@/components/ui/density-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { NewSinceMark } from '@/components/ui/new-since';
import { Button } from '@/components/ui/button';
import { useDensity, useLastVisit } from '@/hooks/use-table-prefs';
import type { Density } from '@/lib/ui/table-prefs';

export type EFilingColumn<T> = {
  key: string;
  header: ReactNode;
  /** CSS width, for example '120px' or '18%'. */
  width?: string;
  align?: 'left' | 'right' | 'center';
  /** Let the cell wrap instead of truncating. */
  wrap?: boolean;
  render: (row: T) => ReactNode;
};

/** A one-key action on a focused row (E-02): R reminds, A assigns. Enter always opens. */
export type EFilingRowShortcut<T> = { key: string; run: (row: T) => void };

/** Class for a second line in a cell. Compact rows hide it (E-07). */
export const GRID_SUB = 'grid-sub';

/** E-09: the head sticks only when the table fits its card; a sideways-scrolling table keeps it at the top of the table. */
/**
 * A sticky head sticks to the nearest ancestor that clips overflow. When that ancestor is a card
 * with `overflow: hidden` (it does not scroll), the head's top offset pushes it down over the first
 * row instead. So the head only sticks when the nearest clipping ancestor really scrolls.
 */
function stickyCanWork(wrap: HTMLElement): boolean {
  for (let el = wrap.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'visible' || overflowY === 'clip') continue;
    return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
  }
  return true;
}

/** True while a sideways-scrolling table still has columns hidden past its right edge. */
function useMoreRight(wrap: RefObject<HTMLDivElement | null>) {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const w = wrap.current;
    if (!w || typeof ResizeObserver === 'undefined') return;
    const check = () => setMore(w.scrollWidth - w.clientWidth - w.scrollLeft > 2);
    check();
    w.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(w);
    if (w.firstElementChild) ro.observe(w.firstElementChild);
    return () => {
      w.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [wrap]);
  return more;
}

function useTableFits(wrap: RefObject<HTMLDivElement | null>, table: RefObject<HTMLTableElement | null>, on: boolean) {
  const [fits, setFits] = useState(false);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const w = wrap.current;
    const t = table.current;
    if (!w || !t || typeof ResizeObserver === 'undefined') return;
    const check = () => {
      setFits(on && t.offsetWidth <= w.clientWidth + 1 && stickyCanWork(w));
      setWidth(w.clientWidth);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(w);
    ro.observe(t);
    return () => ro.disconnect();
  }, [wrap, table, on]);
  return { fits, width };
}

/** A native checkbox in the R-57 look (app/globals.css), with the mixed state for the head. */
function RowBox({ checked, mixed, onChange, label }: { checked: boolean; mixed?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      data-grid-ctl
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !!mixed;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="block flex-none cursor-pointer"
    />
  );
}

/**
 * The grid (VCFO Spectrum rule R-07, Stripe T1): clean rows. A 36px head in 11.5px capitals
 * with a 1.5px line under it, 44px rows with one hairline, no column lines, no zebra, no navy
 * head. Page numbers sit under long tables. The table scrolls inside its card on narrow
 * screens instead of spilling past it (K-38).
 *
 * Rows with `onRowClick` are keyboard-focusable: Tab reaches them and Enter opens them.
 *
 * Opt-in parts (Spectrum parity, prototype `DataGrid`). Without them the grid looks and works as before:
 * - `selectable` + `bulkActions` (E-01): a checkbox column; picked rows show the bulk bar over the head.
 * - `rowActions` (E-02): quick actions at the row end, shown on hover and focus. `rowShortcuts` adds keys.
 * - `stickyHead` (E-09): the head sticks under the top bar when the table fits its card.
 *   `stickyFirstColumn`: the first column stays put under 640px while the table scrolls sideways.
 * - `density` or `densityScope` (E-07): Comfortable 44px or Compact 32px rows; `densityScope` adds the
 *   switch to the head and keeps the choice in localStorage.
 * - `changedAt` + `visitKey` (E-08): a 6px blurple square before rows changed since the last visit.
 * - `loading` (L1): grey row shapes in place of the rows.
 * - `onClearFilters` or `emptyAction` (E3): the plain-edged empty state with "Clear filters" or your action.
 */
export function EFilingGrid<T>({
  columns,
  rows,
  rowKey,
  pageSize = 10,
  footer,
  empty,
  onRowClick: onRowClickProp,
  rowHref,
  caption,
  minWidth = 640,
  rowClassName,
  selectable,
  selected: selectedProp,
  onSelectedChange,
  bulkActions,
  bulkNoun,
  rowActions,
  rowShortcuts,
  actionsColumn,
  stickyHead,
  stickyTop = 'var(--shell-sticky-top)',
  stickyFirstColumn,
  density: densityProp,
  densityScope,
  changedAt,
  visitKey,
  visitSeed,
  loading,
  onClearFilters,
  emptyAction,
}: {
  columns: EFilingColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  /** Extra content in the footer after the row count: "Clear filters", a note. */
  footer?: ReactNode;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Whole-row link: a click or Enter opens it; Ctrl, Cmd or a middle click opens a new tab. */
  rowHref?: (row: T) => string | undefined;
  caption?: string;
  minWidth?: number;
  /** Extra classes on a row (a late row, a picked record). */
  rowClassName?: (row: T) => string | undefined;
  /** E-01: a checkbox column. */
  selectable?: boolean;
  /** Controlled selection (row keys). Without it the grid keeps its own. */
  selected?: ReadonlySet<string>;
  onSelectedChange?: (keys: Set<string>) => void;
  /** E-01: the bulk bar's actions for the picked rows. After an action the caller clears the selection with `onSelectedChange` if it controls it; otherwise the grid clears it. */
  bulkActions?: (picked: T[]) => BulkAction[];
  bulkNoun?: [string, string];
  /** E-02: icon buttons at the row end (Open, Remind, Reassign), shown on row hover and focus. Give buttons `data-grid-ctl` and `tabIndex={-1}`. */
  rowActions?: (row: T) => ReactNode;
  /** E-02: one-key actions on a focused row. */
  rowShortcuts?: EFilingRowShortcut<T>[];
  /** E-02: show the row actions over the right end of this column (a text column) instead of in a column of their own. The density switch then sits in this column's head. */
  actionsColumn?: string;
  /** E-09: sticky head. */
  stickyHead?: boolean;
  /** Where the sticky head stops: the top bar plus the ribbon by default. Pass 0 inside a scrolling panel. */
  stickyTop?: number | string;
  /** E-09: the first column (and the checkbox column) stay put under 640px, or at every width with 'always'. */
  stickyFirstColumn?: boolean | 'always';
  /** E-07: controlled density. */
  density?: Density;
  /** E-07: show the density switch and keep the choice under this scope (a user id or a table name). */
  densityScope?: string;
  /** E-08: when the row last changed. */
  changedAt?: (row: T) => Date | string | null | undefined;
  /** E-08: page key for the last visit time ("manager:work"). */
  visitKey?: string;
  /** E-08: the last visit to assume when the browser has none stored (ms). */
  visitSeed?: number;
  /** L1: grey row shapes. */
  loading?: boolean;
  /** E3: shows the plain-edged empty state with "Clear filters" when there are no rows. */
  onClearFilters?: () => void;
  /** E3: a different action in the plain-edged empty state. */
  emptyAction?: ReactNode;
}) {
  // The router from context, not useRouter(): the grid also renders outside the app router (tests).
  const router = useContext(AppRouterContext);
  const onRowClick =
    onRowClickProp ??
    (rowHref
      ? (row: T) => {
          const href = rowHref(row);
          if (!href) return;
          if (router) router.push(href);
          else window.location.assign(href);
        }
      : undefined);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * pageSize, current * pageSize + pageSize);
  const alignClass = (a?: 'left' | 'right' | 'center') => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  // E-07
  const [storedDensity, setStoredDensity] = useDensity(densityScope ?? 'grid', !!densityScope);
  const density = densityProp ?? (densityScope ? storedDensity : 'comfortable');
  const compact = density === 'compact';

  // E-08
  const since = useLastVisit(changedAt ? visitKey : undefined, visitSeed);

  // E-09
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const sticky = useTableFits(wrapRef, tableRef, !!stickyHead);
  const moreRight = useMoreRight(wrapRef);

  // E-01
  const [ownPicked, setOwnPicked] = useState<Set<string>>(() => new Set());
  const picked = useMemo(() => (selectedProp ? new Set(selectedProp) : ownPicked), [selectedProp, ownPicked]);
  const setPicked = (next: Set<string>) => {
    if (!selectedProp) setOwnPicked(next);
    onSelectedChange?.(next);
  };
  const allKeys = rows.map(rowKey);
  const keySig = allKeys.join('|');
  // Rows that leave the list (a filter, a refetch) leave the selection too.
  useEffect(() => {
    if (selectedProp) return;
    setOwnPicked((s) => {
      if (s.size === 0) return s;
      const live = new Set(keySig.split('|'));
      const next = new Set([...s].filter((k) => live.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [keySig, selectedProp]);
  const pageKeys = shown.map(rowKey);
  const pageAll = pageKeys.length > 0 && pageKeys.every((k) => picked.has(k));
  const pageSome = pageKeys.some((k) => picked.has(k));
  const pickedRows = rows.filter((r) => picked.has(rowKey(r)));
  const bulk = !!selectable && picked.size > 0;
  const pickPage = (v: boolean) =>
    setPicked(v ? new Set([...picked, ...pageKeys]) : new Set([...picked].filter((k) => !pageKeys.includes(k))));
  const bulkList: BulkAction[] = bulk
    ? (bulkActions?.(pickedRows) ?? []).map((a) =>
        a.onClick
          ? {
              ...a,
              onClick: () => {
                a.onClick?.();
                if (!selectedProp) setOwnPicked(new Set());
              },
            }
          : a,
      )
    : [];

  const trailing = (!!rowActions || !!densityScope) && !actionsColumn;
  const colCount = columns.length + (selectable ? 1 : 0) + (trailing ? 1 : 0);
  const headTop = sticky.fits ? stickyTop : undefined;
  const stickTh = stickyHead ? 'sticky z-[2] bg-surface-raised' : '';
  const always = stickyFirstColumn === 'always';
  const boxSticky = always
    ? 'sticky left-0 z-[1] bg-surface-raised'
    : stickyFirstColumn
      ? 'max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-surface-raised'
      : '';
  const firstSticky = always
    ? cn('sticky z-[1] bg-surface-raised shadow-[1px_0_0_oklch(var(--line-soft))]', selectable ? 'left-[36px]' : 'left-0')
    : stickyFirstColumn
      ? cn('max-sm:sticky max-sm:z-[1] max-sm:bg-surface-raised', selectable ? 'max-sm:left-[36px]' : 'max-sm:left-0')
      : '';
  const showE3 = !loading && rows.length === 0 && (!!onClearFilters || !!emptyAction);
  const focusable = !!onRowClick || !!selectable || (!!rowShortcuts && rowShortcuts.length > 0);

  const onRowKey = (row: T) => (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter' && onRowClick) {
      e.preventDefault();
      onRowClick(row);
      return;
    }
    if (e.key === ' ' && selectable) {
      e.preventDefault();
      const k = rowKey(row);
      setPicked(picked.has(k) ? new Set([...picked].filter((x) => x !== k)) : new Set([...picked, k]));
      return;
    }
    const hit = rowShortcuts?.find((s) => s.key.toLowerCase() === e.key.toLowerCase());
    if (hit) {
      e.preventDefault();
      hit.run(row);
    }
  };

  return (
    <div className="min-w-0">
      <div className="relative">
      {/* Columns past the card edge: a fade says the table scrolls sideways. */}
      {moreRight ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-10 bg-gradient-to-l from-surface-raised to-transparent" />
      ) : null}
      {/* relative: an absolutely placed child (a screen-reader-only head label) must stay inside the
          scroll box; without a positioned ancestor here it escaped and widened the whole page. */}
      <div ref={wrapRef} className={cn('relative max-w-full', sticky.fits ? 'overflow-visible' : 'overflow-x-auto')}>
        <table
          ref={tableRef}
          className={cn('w-full table-fixed border-collapse text-[14px]', compact && '[&_.grid-sub]:hidden')}
          style={{ minWidth }}
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <colgroup>
            {selectable ? <col style={{ width: '36px' }} /> : null}
            {columns.map((c, ci) => (
              // The last cell's edge padding is 10px more than a normal cell's, and a fixed 104px chip
              // needs that room back or its cell ellipsis shows beside the chip.
              <col
                key={c.key}
                style={
                  c.width
                    ? { width: !trailing && ci === columns.length - 1 && c.width.endsWith('px') ? `calc(${c.width} + 20px)` : c.width }
                    : undefined
                }
              />
            ))}
            {trailing ? <col style={{ width: rowActions ? '104px' : '44px' }} /> : null}
          </colgroup>
          <thead>
            <tr>
              {selectable ? (
                <th
                  scope="col"
                  className={cn('h-9 border-b-1.5 border-line pl-3.5 pr-0', stickTh, boxSticky, stickyFirstColumn && 'max-sm:z-[3]')}
                  style={headTop !== undefined ? { top: headTop } : undefined}
                >
                  <RowBox checked={pageAll} mixed={!pageAll && pageSome} onChange={pickPage} label="Pick every row on this page" />
                </th>
              ) : null}
              {columns.map((c, ci) => (
                <th
                  key={c.key}
                  scope="col"
                  style={headTop !== undefined ? { top: headTop } : undefined}
                  className={cn(
                    'h-9 whitespace-nowrap border-b-1.5 border-line px-2.5 first:pl-4 md:first:pl-5 last:pr-4 md:last:pr-5 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted',
                    alignClass(c.align),
                    stickTh,
                    ci === 0 && firstSticky,
                    ci === 0 && stickyFirstColumn && 'max-sm:z-[3]',
                    bulk && ci === 0 && cn('z-[4] overflow-visible', stickyHead ? null : stickyFirstColumn ? 'sm:relative' : 'relative'),
                    c.key === actionsColumn && !stickyHead && 'relative',
                  )}
                >
                  {c.header}
                  {c.key === actionsColumn && !bulk && densityScope && densityProp === undefined ? (
                    <span className="absolute inset-y-0 right-1 flex items-center normal-case tracking-normal max-md:hidden">
                      <DensityMenu value={density} onChange={setStoredDensity} />
                    </span>
                  ) : null}
                  {bulk && ci === 0 ? (
                    // E-01: the bar covers the head row while rows are picked, so the rows do not move.
                    <div
                      className="absolute bottom-[1.5px] left-0 top-0 flex items-center bg-surface-raised px-2.5 text-left"
                      style={{ width: Math.max(240, sticky.width - (selectable ? 36 : 0)) }}
                    >
                      <BulkBar
                        count={picked.size}
                        total={rows.length}
                        pageAll={pageAll}
                        onSelectAll={() => setPicked(new Set(allKeys))}
                        onClear={() => setPicked(new Set())}
                        actions={bulkList}
                        noun={bulkNoun}
                      />
                    </div>
                  ) : null}
                </th>
              ))}
              {trailing ? (
                <th
                  scope="col"
                  style={headTop !== undefined ? { top: headTop } : undefined}
                  className={cn('h-9 border-b-1.5 border-line px-1.5 text-right', stickTh)}
                >
                  <span className="sr-only">Row actions</span>
                  {densityScope && densityProp === undefined ? (
                    <span className="inline-flex align-middle">
                      <DensityMenu value={density} onChange={setStoredDensity} />
                    </span>
                  ) : null}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                {Array.from({ length: Math.min(pageSize, 6) }, (_, i) => (
                  <tr key={`sk${i}`} aria-hidden>
                    {selectable ? <td className="border-b border-line-soft pl-2.5" /> : null}
                    {columns.map((c, ci) => (
                      <td key={c.key} className={cn('border-b border-line-soft px-2.5 first:pl-4 md:first:pl-5 last:pr-4 md:last:pr-5 align-middle', compact ? 'h-8' : 'h-11')}>
                        {ci === 0 && !compact ? (
                          <span className="grid gap-1.5">
                            <span className="block h-3 w-3/5 animate-pulse rounded-bar bg-line motion-reduce:animate-none" />
                            <span className="block h-2.5 w-2/5 animate-pulse rounded-bar bg-line motion-reduce:animate-none" />
                          </span>
                        ) : c.key === 'status' ? (
                          // The status column gets the 104px chip shape.
                          <span className="block h-6 w-[104px] animate-pulse rounded-md bg-line motion-reduce:animate-none" />
                        ) : (
                          <span
                            className={cn(
                              'block h-3 w-3/4 animate-pulse rounded-bar bg-line motion-reduce:animate-none',
                              c.align === 'right' && 'ml-auto',
                            )}
                          />
                        )}
                      </td>
                    ))}
                    {trailing ? <td className="border-b border-line-soft" /> : null}
                  </tr>
                ))}
                <tr className="sr-only">
                  <td colSpan={colCount}>
                    <span role="status">Loading</span>
                  </td>
                </tr>
              </>
            ) : shown.length === 0 ? (
              showE3 ? null : (
                <tr>
                  <td colSpan={colCount} className="px-3 py-6 text-center text-ink-muted">
                    {empty ?? 'Nothing to show.'}
                  </td>
                </tr>
              )
            ) : (
              shown.map((row, i) => {
                const key = rowKey(row);
                const isPicked = picked.has(key);
                const mark = changedAt ? <NewSinceMark changedAt={changedAt(row)} since={since} /> : null;
                return (
                  <tr
                    key={key}
                    tabIndex={focusable ? 0 : undefined}
                    aria-selected={selectable ? isPicked : undefined}
                    aria-keyshortcuts={
                      focusable
                        ? [onRowClick ? 'Enter' : '', selectable ? 'Space' : '', ...(rowShortcuts ?? []).map((s) => s.key.toUpperCase())]
                            .filter(Boolean)
                            .join(' ') || undefined
                        : undefined
                    }
                    className={cn(
                      'group/row hover:[&>td]:bg-hover',
                      onRowClick && 'cursor-pointer',
                      focusable &&
                        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring focus-visible:[&>td]:bg-hover',
                      isPicked && '[&>td]:!bg-brand-soft',
                      rowClassName?.(row),
                    )}
                    onClick={
                      onRowClick
                        ? (e) => {
                            if ((e.target as HTMLElement).closest('[data-grid-ctl], [role=menu], a, button')) return;
                            const href = rowHref?.(row);
                            if (href && (e.ctrlKey || e.metaKey)) {
                              window.open(href, '_blank', 'noopener');
                              return;
                            }
                            onRowClick(row);
                          }
                        : undefined
                    }
                    onAuxClick={
                      rowHref
                        ? (e) => {
                            const href = rowHref(row);
                            if (e.button === 1 && href) window.open(href, '_blank', 'noopener');
                          }
                        : undefined
                    }
                    onKeyDown={focusable ? onRowKey(row) : undefined}
                  >
                    {selectable ? (
                      <td className={cn('relative border-b border-line-soft pl-3.5 pr-0 align-middle', boxSticky)}>
                        {mark}
                        <RowBox
                          checked={isPicked}
                          onChange={(v) => setPicked(v ? new Set([...picked, key]) : new Set([...picked].filter((x) => x !== key)))}
                          label={`Pick row ${current * pageSize + i + 1}`}
                        />
                      </td>
                    ) : null}
                    {columns.map((c, ci) => (
                      <td
                        key={c.key}
                        className={cn(
                          'border-b border-line-soft px-2.5 first:pl-4 md:first:pl-5 last:pr-4 md:last:pr-5 align-middle text-ink-2',
                          compact ? 'h-8' : 'h-11',
                          alignClass(c.align),
                          c.wrap ? 'whitespace-normal' : 'truncate whitespace-nowrap',
                          ci === 0 && firstSticky,
                          ci === 0 && !selectable && mark && 'relative',
                          c.key === actionsColumn && 'relative',
                        )}
                      >
                        {ci === 0 && !selectable ? mark : null}
                        {c.render(row)}
                        {c.key === actionsColumn && rowActions ? (
                          <span className="invisible absolute inset-y-0 right-1 flex items-center gap-0.5 bg-surface-raised pl-1.5 group-hover/row:visible group-focus-within/row:visible group-focus-visible/row:visible max-md:hidden">
                            {rowActions(row)}
                          </span>
                        ) : null}
                      </td>
                    ))}
                    {trailing ? (
                      <td className={cn('border-b border-line-soft px-1.5 text-right align-middle', compact ? 'h-8' : 'h-11')}>
                        {rowActions ? (
                          <span className="invisible inline-flex items-center justify-end gap-0.5 group-hover/row:visible group-focus-within/row:visible group-focus-visible/row:visible">
                            {rowActions(row)}
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </div>
      {showE3 ? (
        <EmptyState
          className="mt-2"
          title={empty ?? 'No rows match'}
          action={
            emptyAction ??
            (onClearFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : null)
          }
        />
      ) : null}
      {rows.length > 0 && !loading ? (
        <footer className="flex flex-wrap items-center gap-3 px-4 py-2 text-[13px] text-ink-muted md:px-5">
          <span className="tabular-nums">
            {current * pageSize + 1}–{Math.min(rows.length, (current + 1) * pageSize)} of {rows.length}
          </span>
          {footer}
          {pages > 1 ? (
            <nav aria-label="Pages" className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(Math.max(0, current - 1))}
                disabled={current === 0}
                aria-label="Previous page"
                className="grid h-7 w-7 place-items-center rounded-md hover:bg-ink/[.06] disabled:opacity-40"
              >
                <ChevronLeft size={14} strokeWidth={1.6} aria-hidden />
              </button>
              {pageList(current, pages).map((n, i) =>
                n === null ? (
                  <span key={`e${i}`} className="px-1" aria-hidden>
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    aria-current={n === current ? 'page' : undefined}
                    onClick={() => setPage(n)}
                    className={cn(
                      'h-7 min-w-7 rounded-md px-1.5 font-medium tabular-nums',
                      n === current ? 'bg-brand text-on-brand' : 'text-ink-2 hover:bg-ink/[.06]',
                    )}
                  >
                    {n + 1}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => setPage(Math.min(pages - 1, current + 1))}
                disabled={current === pages - 1}
                aria-label="Next page"
                className="grid h-7 w-7 place-items-center rounded-md hover:bg-ink/[.06] disabled:opacity-40"
              >
                <ChevronRight size={14} strokeWidth={1.6} aria-hidden />
              </button>
            </nav>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}

/** Page indexes to show: the first, the last and the neighbours of the current one; null is a gap. */
function pageList(current: number, pages: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let p = 0; p < pages; p++) {
    if (p === 0 || p === pages - 1 || Math.abs(p - current) <= 1) {
      const prev = out[out.length - 1];
      if (typeof prev === 'number' && p - prev > 1) out.push(null);
      out.push(p);
    }
  }
  return out;
}
