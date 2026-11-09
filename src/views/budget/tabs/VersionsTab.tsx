'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { compareBudgets } from '@/lib/budget/diff';
import type { BudgetState } from '@/lib/budget/model';
import { cn } from '@/lib/utils';
import { Block } from '../cells';
import { api, crore, inr, sectionLabel } from '../format';
import { GRID, GridScroll, TD, TD_NAME, TH } from '../grid-parts';
import type { Ready } from '../types';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Frozen versions and what changed between any two, or against an earlier year. */
export function VersionsTab({ ready, siblings }: { ready: Ready; siblings: { id: string; fyName: string }[] }) {
  const { view, state } = ready;
  const [from, setFrom] = useState(view.versions[0]?.id ?? '');
  const [to, setTo] = useState('current');

  const loadState = (key: string) => async (): Promise<BudgetState> => {
    if (key === 'current') return state;
    if (key.startsWith('year:')) return (await api<{ state: BudgetState }>(`/api/budgets/${key.slice(5)}`)).state;
    return (await api<{ state: BudgetState }>(`/api/budgets/${view.id}/versions/${key}`)).state;
  };
  const before = useQuery({ queryKey: ['budget-compare', view.id, from], queryFn: loadState(from), enabled: !!from && from !== 'current' });
  const after = useQuery({ queryKey: ['budget-compare', view.id, to], queryFn: loadState(to), enabled: to !== 'current' });
  const difference = useMemo(() => {
    const a = from === 'current' ? state : before.data;
    const b = to === 'current' ? state : after.data;
    return a && b ? compareBudgets(a, b) : null;
  }, [from, to, state, before.data, after.data]);

  const others = siblings.filter((s) => s.id !== view.id);
  const options = [...view.versions.map((v) => ({ value: v.id, label: `Version ${v.version}` })), ...others.map((s) => ({ value: `year:${s.id}`, label: s.fyName }))];

  if (!view.versions.length && !others.length) return <EmptyState title="No versions yet. Publishing freezes a version that cannot change." />;

  return (
    <div className="flex flex-col gap-4">
      {view.versions.length ? (
        <Block title="Published versions">
          <GridScroll>
            <table className={GRID}>
              <thead>
                <tr>
                  <th className={cn(TH, 'min-w-[90px] text-left')}>Version</th>
                  <th className={cn(TH, 'min-w-[120px]')}>Total</th>
                  <th className={cn(TH, 'min-w-[200px] text-left')}>Published</th>
                  <th className={cn(TH, 'min-w-[200px] text-left')}>Approved</th>
                  <th className={cn(TH, 'min-w-[240px] text-left')}>Note</th>
                </tr>
              </thead>
              <tbody>
                {view.versions.map((v) => (
                  <tr key={v.id}>
                    <td className={TD_NAME}>Version {v.version}</td>
                    <td className={TD}>{crore(v.grandTotal)}</td>
                    <td className={TD_NAME}>
                      {v.publishedByName ?? '–'}, {when(v.publishedAt)}
                    </td>
                    <td className={TD_NAME}>{v.approvedAt ? `${v.approvedByName ?? '–'}, ${when(v.approvedAt)}` : '–'}</td>
                    <td className={cn(TD_NAME, 'whitespace-normal')}>{v.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GridScroll>
        </Block>
      ) : null}

      <Block
        title="Compare"
        hint={difference ? `From ${crore(difference.beforeTotal)} to ${crore(difference.afterTotal)}: a change of ${crore(difference.afterTotal - difference.beforeTotal)}.` : undefined}
        right={
          <div className="flex items-center gap-2">
            <FilterSelect aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} options={options} />
            <span className="text-[13px] text-ink-muted">to</span>
            <FilterSelect aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} options={[{ value: 'current', label: 'This budget now' }, ...options]} />
          </div>
        }
      >
        {difference ? (
          <div className="flex flex-col gap-4 p-4">
            {!difference.lines.length && !difference.rows.length ? <p className="text-[13px] text-ink-muted">No difference.</p> : null}
            {difference.lines.length ? (
              <GridScroll>
                <table className={GRID}>
                  <thead>
                    <tr>
                      <th className={cn(TH, 'min-w-[240px] text-left')}>Line</th>
                      <th className={cn(TH, 'min-w-[110px]')}>Before</th>
                      <th className={cn(TH, 'min-w-[110px]')}>After</th>
                      <th className={cn(TH, 'min-w-[110px]')}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {difference.lines.map((l) => (
                      <tr key={l.lineId}>
                        <td className={TD_NAME}>{l.name}</td>
                        <td className={TD}>{inr(l.before)}</td>
                        <td className={TD}>{inr(l.after)}</td>
                        <td className={cn(TD, 'font-semibold')}>{inr(l.change)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GridScroll>
            ) : null}
            {difference.rows.length ? (
              <ul className="flex flex-col gap-1.5 text-[13px] text-ink">
                {difference.rows.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <Chip raw dot={false} className="min-w-0" tone={r.kind === 'added' ? 'ok' : r.kind === 'removed' ? 'bad' : 'prog'}>
                      {r.kind === 'added' ? 'Added' : r.kind === 'removed' ? 'Removed' : 'Changed'}
                    </Chip>
                    <span className="text-ink-muted">{sectionLabel(r.section)}:</span> {r.name}
                    {r.fields.length ? <span className="text-ink-muted">({r.fields.map((f) => f.field).join(', ')})</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="px-4 py-3 text-[13px] text-ink-muted">Choose what to compare.</p>
        )}
      </Block>
    </div>
  );
}
