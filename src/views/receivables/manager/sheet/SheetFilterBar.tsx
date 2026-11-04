'use client';

import { CheckCircle2, CirclePause, Download, FilterX, Link2, Search, UserRoundPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BulkBar } from '@/components/ui/bulk-bar';
import { FilterSelect } from '@/components/ui/native-select';
import { monthLong } from '@/lib/receivables/dates';
import type { ShareStatus } from '@/lib/receivables/share-filters';
import type { Partner } from '@/lib/receivables/model';
import { inr } from '../../format';
import { STATUS_CHOICES } from './sheet-filters';
import type { SheetTabState } from './use-sheet-tab';

const MULTI = '__multi';

/** One value of a list filter for a single-choice select; several values read "N picked". */
function listValue(list: string[] | undefined): string {
  if (!list?.length) return 'all';
  return list.length === 1 ? list[0]! : MULTI;
}

function listOptions(list: string[] | undefined, all: string, noun: string, choices: Array<{ value: string; label: string }>) {
  return [{ value: 'all', label: all }, ...(list && list.length > 1 ? [{ value: MULTI, label: `${list.length} ${noun}` }] : []), ...choices];
}

/**
 * The sheet's filter bar (Phase 10): search, partner, client, status, month and currency, all in
 * the URL; Clear filters; Share this view; and under it the count and total of the rows shown,
 * or the bulk bar while rows are picked.
 */
export function SheetFilterBar({ s, partners }: { s: SheetTabState; partners: Partner[] }) {
  const f = s.filters;
  const pick = (v: string) => (v === 'all' ? undefined : v === MULTI ? undefined : [v]);
  const active = partners.filter((p) => p.active);
  const openPicked = s.pickedRows.filter((r) => r.status === 'open').length;
  return (
    <div className="flex flex-col gap-2">
      <div role="search" aria-label="Filter invoices" className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[180px] flex-[1_1_220px] items-center sm:max-w-[280px]">
          <Search className="pointer-events-none absolute left-2.5 size-4 text-ink-muted" strokeWidth={1.6} aria-hidden />
          <span className="sr-only">Search client, invoice number or partner</span>
          <input
            type="search"
            value={s.search}
            onChange={(e) => s.setSearch(e.target.value)}
            placeholder="Client, invoice no. or partner"
            className="h-control-sm w-full rounded-md border-1.5 border-line-strong bg-surface-raised pl-8 pr-2.5 text-[13px] text-ink shadow-control outline-none placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-focus-ring/25"
          />
        </label>
        <FilterSelect
          aria-label="Client partner"
          value={listValue(f.partnerSlugs)}
          onChange={(e) => e.target.value !== MULTI && s.patchFilters({ partnerSlugs: pick(e.target.value) })}
          options={listOptions(f.partnerSlugs, 'All partners', 'partners', partners.map((p) => ({ value: p.slug, label: p.name })))}
        />
        <FilterSelect
          aria-label="Client"
          value={listValue(f.clients)}
          onChange={(e) => e.target.value !== MULTI && s.patchFilters({ clients: pick(e.target.value) })}
          options={listOptions(f.clients, 'All clients', 'clients', s.clients.map((c) => ({ value: c, label: c })))}
        />
        <FilterSelect aria-label="Status" value={s.status} onChange={(e) => s.patchFilters({ status: e.target.value as ShareStatus })} options={STATUS_CHOICES} />
        <FilterSelect
          aria-label="Invoice month"
          value={listValue(f.months)}
          onChange={(e) => e.target.value !== MULTI && s.patchFilters({ months: pick(e.target.value) })}
          options={listOptions(f.months, 'All months', 'months', [...s.months].reverse().map((m) => ({ value: m, label: monthLong(m) })))}
        />
        {s.currencies.length > 1 || f.currency ? (
          <FilterSelect
            aria-label="Currency"
            value={f.currency ?? 'all'}
            onChange={(e) => s.patchFilters({ currency: e.target.value === 'all' ? null : e.target.value })}
            options={[{ value: 'all', label: 'All currencies' }, ...s.currencies.map((c) => ({ value: c, label: c }))]}
          />
        ) : null}
        {s.filtered ? (
          <Button size="sm" variant="quiet" onClick={() => s.setFilters({})}>
            <FilterX aria-hidden />
            Clear filters
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => s.setDialog({ kind: 'share-view' })}>
          <Link2 aria-hidden />
          Share this view
        </Button>
      </div>

      <div className="flex min-h-[34px] items-center gap-3 rounded-md px-1 text-[13px]">
        {s.picked.size ? (
          <BulkBar
            count={s.picked.size}
            onClear={s.clearPicked}
            noun={['invoice', 'invoices']}
            actions={[
              { key: 'received', label: 'Mark received', icon: CheckCircle2, disabled: !s.bulkReceivable.length, onClick: () => s.setDialog({ kind: 'bulk-received' }) },
              {
                key: 'assign',
                label: 'Assign partner',
                icon: UserRoundPlus,
                people: {
                  label: 'Assign to',
                  names: [...active.map((p) => p.name), 'No partner'],
                  onPick: (name) => s.bulkAssign(active.find((p) => p.name === name)?.id ?? null, name),
                },
              },
              { key: 'pause', label: 'Pause reminders', icon: CirclePause, disabled: !openPicked, onClick: () => s.setDialog({ kind: 'bulk-pause' }) },
              { key: 'export', label: 'Export', icon: Download, onClick: s.exportPicked },
            ]}
          />
        ) : (
          <span className="text-ink-muted" aria-live="polite">
            <b className="font-medium text-ink">{`${s.rows.length} invoice${s.rows.length === 1 ? '' : 's'}`}</b>
            {` · ₹${inr(s.total)}`}
            {s.filtered ? ' · filtered' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
