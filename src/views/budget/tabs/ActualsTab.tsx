'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { budgetVsActual } from '@/lib/budget/engine';
import { fyIndexOfPeriod, periodOfFyIndex } from '@/lib/budget/model';
import { LOCKED_STATUSES } from '@/lib/budget/variance';
import type { ActualRow } from '@/lib/budget/wire';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { Block, NumberCell, SelectCell, TextCell } from '../cells';
import { ApiError, api, crore, errorText, inr } from '../format';
import { GRID, GridScroll, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import type { Ready } from '../types';
import { useVarianceData } from '../variance/use-variance';

const SAVE_DELAY_MS = 700;

/** Budget against actual cost, the forecast for the year, and where actual cost comes from. */
export function ActualsTab({ ready }: { ready: Ready }) {
  const { view, settings, state, result } = ready;
  const queryClient = useQueryClient();
  const key = ['budget-actuals', view.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api<{ actuals: ActualRow[] }>(`/api/budgets/${view.id}/actuals`) });
  const [show, setShow] = useState<'compare' | 'enter'>('compare');
  const [edits, setEdits] = useState<Record<string, { amount: number; reason?: string | null }>>({});
  const pending = useRef(new Map<string, { period: string; lineId: string; amount: number; reason: string | null }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEnter = view.access.canEnterActuals;
  /* Months submitted or approved on the Variance tab change only there. */
  const variance = useVarianceData(view.id, view.access.canSeeVariance).data;
  const locked = new Set((variance?.months ?? []).filter((m) => LOCKED_STATUSES.includes(m.status)).map((m) => m.monthIndex));

  const actuals = useMemo(() => {
    const map = new Map<string, ActualRow>();
    for (const a of data?.actuals ?? []) map.set(`${a.period}|${a.lineId}`, a);
    for (const [k, e] of Object.entries(edits)) {
      const [period, lineId] = k.split('|');
      map.set(k, { period, lineId, amount: e.amount, reason: e.reason ?? map.get(k)?.reason ?? null, source: 'manual' });
    }
    return [...map.values()];
  }, [data, edits]);
  const compare = useMemo(() => budgetVsActual(state, result, actuals, (p) => fyIndexOfPeriod(settings, p)), [state, result, actuals, settings]);
  const lookup = useMemo(() => new Map(actuals.map((a) => [`${a.period}|${a.lineId}`, a])), [actuals]);

  const flush = async () => {
    const entries = [...pending.current.values()];
    pending.current.clear();
    if (!entries.length) return;
    try {
      await api(`/api/budgets/${view.id}/actuals`, { method: 'POST', body: JSON.stringify({ entries }) });
    } catch (e) {
      toastError('Actual cost not saved', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    }
  };
  const change = (period: string, lineId: string, amount: number, reason?: string | null) => {
    const k = `${period}|${lineId}`;
    const keep = reason === undefined ? (lookup.get(k)?.reason ?? null) : reason;
    setEdits((all) => ({ ...all, [k]: { amount, reason: keep } }));
    pending.current.set(k, { period, lineId, amount, reason: keep });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const lastPeriod = compare.monthsClosed ? periodOfFyIndex(settings, compare.monthsClosed - 1) : '';
  const shown = compare.rows.filter((r) => r.budget || r.actual || r.fullYearBudget);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {canEnter ? <FilterSelect aria-label="View" value={show} onChange={(e) => setShow(e.target.value as 'compare' | 'enter')} options={[{ value: 'compare', label: 'Budget against actual' }, { value: 'enter', label: 'Enter actual cost' }]} /> : null}
        {canEnter ? <ImportActuals ready={ready} onDone={() => { setEdits({}); void queryClient.invalidateQueries({ queryKey: key }); }} /> : null}
      </div>

      {show === 'compare' ? (
        !compare.monthsClosed ? (
          <EmptyState title="No actual cost yet. Import an accounts export, or enter it by month." />
        ) : (
          <Block title={`Year to date: ${compare.monthsClosed} of 12 months`} hint={`Actual ${crore(compare.totals.actual)} against budget ${crore(compare.totals.budget)}. Forecast for the year ${crore(compare.totals.forecast)} against budget ${crore(compare.totals.fullYearBudget)}.`}>
            <GridScroll>
              <table className={GRID}>
                <thead>
                  <tr>
                    <th className={cn(TH, STICKY, 'z-[2] min-w-[220px] text-left')}>Line</th>
                    <th className={cn(TH, 'min-w-[104px]')}>Budget to date</th>
                    <th className={cn(TH, 'min-w-[104px]')}>Actual to date</th>
                    <th className={cn(TH, 'min-w-[104px]')}>Variance</th>
                    <th className={cn(TH, 'min-w-[70px]')}>%</th>
                    <th className={cn(TH, 'min-w-[110px]')}>Forecast, full year</th>
                    <th className={cn(TH, 'min-w-[110px]')}>Budget, full year</th>
                    <th className={cn(TH, 'min-w-[260px] text-left')}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const entry = lookup.get(`${lastPeriod}|${r.lineId}`);
                    return (
                      <tr key={r.lineId}>
                        <td className={cn(TD_NAME, STICKY)}>
                          <span className="flex items-center gap-2">
                            {r.name} {r.overLimit ? <Chip tone="bad" raw dot={false} className="min-w-0">Over limit</Chip> : null}
                          </span>
                        </td>
                        <td className={TD}>{inr(r.budget)}</td>
                        <td className={TD}>{inr(r.actual)}</td>
                        <td className={cn(TD, r.overLimit && 'text-danger')}>{inr(r.variance)}</td>
                        <td className={TD}>{r.variancePct == null ? '–' : `${r.variancePct.toFixed(1)}%`}</td>
                        <td className={TD}>{inr(r.forecast)}</td>
                        <td className={TD}>{inr(r.fullYearBudget)}</td>
                        <td className={cn(TD_NAME, 'p-0')}>
                          <TextCell label={`Reason for ${r.name}`} placeholder={canEnter ? 'Why it moved' : ''} value={entry?.reason ?? ''} disabled={!canEnter || locked.has(compare.monthsClosed - 1)} onChange={(v) => change(lastPeriod, r.lineId, entry?.amount ?? 0, v)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </GridScroll>
          </Block>
        )
      ) : (
        <Block title="Actual cost by month" hint={`Type the actual cost of each line. Imported values show here too.${locked.size ? ' Months submitted or approved on the Variance tab are locked here.' : ''}`}>
          <GridScroll>
            <table className={GRID}>
              <thead>
                <tr>
                  <th className={cn(TH, STICKY, 'z-[2] min-w-[220px] text-left')}>Line</th>
                  {result.labels.map((l) => (
                    <th key={l} className={cn(TH, 'min-w-[92px]')}>
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settings.lines.map((line) => (
                  <tr key={line.id}>
                    <td className={cn(TD_NAME, STICKY)}>{line.name}</td>
                    {result.labels.map((label, i) => {
                      const period = periodOfFyIndex(settings, i);
                      return (
                        <td key={label} className={cn(TD, 'p-0')}>
                          <NumberCell label={`${line.name} ${label}`} value={lookup.get(`${period}|${line.id}`)?.amount ?? 0} disabled={locked.has(i)} onChange={(v) => change(period, line.id, v ?? 0)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </GridScroll>
        </Block>
      )}
    </div>
  );
}

function ImportActuals({ ready, onDone }: { ready: Ready; onDone: () => void }) {
  const { view, settings } = ready;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const send = async (chosen: File, mapping: Record<string, string>) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', chosen);
      form.set('map', JSON.stringify(mapping));
      const res = await api<{ unmatched: string[]; saved: number }>(`/api/budgets/${view.id}/actuals/import`, { method: 'POST', body: form });
      if (res.unmatched.length) {
        setFile(chosen);
        setUnmatched(res.unmatched);
      } else {
        setUnmatched([]);
        setFile(null);
        toastSuccess(`Imported ${res.saved} line-months of actual cost`);
        onDone();
      }
    } catch (e) {
      toastError('File not imported', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" aria-label="Accounts export" onChange={(e) => e.target.files?.[0] && void send(e.target.files[0], {})} />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        <Upload className="h-4 w-4" /> Import accounts export
      </Button>
      {unmatched.length && file ? (
        <Modal
          open
          onOpenChange={(open) => !open && setUnmatched([])}
          title="Match ledgers to budget lines"
          sub="These ledgers have no line yet. The match is kept for later imports."
          footer={
            <>
              <Button variant="outline" onClick={() => setUnmatched([])}>
                Cancel
              </Button>
              <Button disabled={busy || unmatched.some((u) => !map[u])} onClick={() => void send(file, map)}>
                Import
              </Button>
            </>
          }
        >
          <ul className="flex flex-col gap-2">
            {unmatched.map((ledger) => (
              <li key={ledger} className="grid grid-cols-2 items-center gap-2 text-[14px] text-ink">
                <span className="truncate" title={ledger}>
                  {ledger}
                </span>
                <span className="overflow-hidden rounded-md border border-line-strong">
                  <SelectCell label={`Line for ${ledger}`} value={map[ledger] ?? ''} options={settings.lines.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => setMap((m) => ({ ...m, [ledger]: v }))} />
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
    </>
  );
}
