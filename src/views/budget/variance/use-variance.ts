'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { entriesOfMonth, monthBudget, taxActualsOf, type MonthEntry, type VarianceAction, type VarianceData } from '@/lib/budget/variance';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { ApiError, api, errorText } from '../format';
import type { Ready } from '../types';

export type { VarianceData };

const SAVE_DELAY_MS = 900;

/** The months of the Variance tab, shared with the advance tax section of the Finance costs tab. */
export function useVarianceData(budgetId: string, enabled: boolean) {
  const key = useMemo(() => ['budget-variance', budgetId], [budgetId]);
  const query = useQuery({ queryKey: key, queryFn: () => api<VarianceData>(`/api/budgets/${budgetId}/variance`), enabled, refetchInterval: 30_000 });
  return { key, query, data: query.data };
}

/** The approved months as the tax computation needs them, or null when there are none. */
export function useTaxActuals(ready: Ready) {
  const { view, settings } = ready;
  const { data } = useVarianceData(view.id, view.access.canSeeVariance);
  return useMemo(() => {
    if (!data) return null;
    const actuals = taxActualsOf(settings, data.months, data.actuals);
    return actuals.approved.some(Boolean) ? actuals : null;
  }, [data, settings]);
}

export interface MonthDraft {
  entries: Record<string, { amount: number | null; reason: string }>;
  headcount: number | null;
  advanceTaxPaid: number | null;
  advanceTaxReason: string;
}

/**
 * One month on screen. Typing changes the local draft at once and saves the whole month after a
 * short pause. Submit saves first, so the server checks exactly what the person sees.
 */
export function useVarianceMonth(ready: Ready) {
  const { view, settings, state, result } = ready;
  const queryClient = useQueryClient();
  const { key, query, data } = useVarianceData(view.id, true);
  const [picked, setPicked] = useState<number | null>(null);
  const [draft, setDraft] = useState<MonthDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const months = useMemo(() => data?.months ?? [], [data]);
  /* First visit: the first month that is not approved yet. */
  const firstOpen = months.findIndex((m) => m.status !== 'approved');
  const current = picked ?? (firstOpen < 0 ? 11 : firstOpen);
  const live = months[current];

  const stored = useMemo((): MonthDraft | null => {
    if (!data || !live) return null;
    const entries: MonthDraft['entries'] = {};
    for (const e of entriesOfMonth(settings, data.actuals, current)) entries[e.lineId] = { amount: e.amount, reason: e.reason ?? '' };
    return { entries, headcount: live.headcount, advanceTaxPaid: live.advanceTaxPaid, advanceTaxReason: live.advanceTaxReason ?? '' };
  }, [data, live, settings, current]);

  /* A refetch brings in other people's work, but never over unsaved typing. */
  useEffect(() => {
    if (!dirty.current) setDraft(stored);
  }, [stored]);

  const shown = draft ?? stored;
  const budget = useMemo(() => (live ? monthBudget(state, result, current, live.status === 'approved' ? live.budgetSnapshot : null) : null), [state, result, current, live]);
  const editable = view.access.canEnterVariance && live != null && ['open', 'draft', 'returned'].includes(live.status);

  const entriesList = (d: MonthDraft): MonthEntry[] => Object.entries(d.entries).map(([lineId, e]) => ({ lineId, amount: e.amount, reason: e.reason || null }));

  const save = useCallback(
    async (d: MonthDraft | null, quiet = true) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (!d) return true;
      try {
        await api(`/api/budgets/${view.id}/variance`, {
          method: 'PUT',
          body: JSON.stringify({ monthIndex: current, entries: entriesList(d), headcount: d.headcount, advanceTaxPaid: d.advanceTaxPaid, advanceTaxReason: d.advanceTaxReason || null }),
        });
        dirty.current = false;
        if (!quiet) toastSuccess('Draft saved');
        await queryClient.invalidateQueries({ queryKey: key });
        void queryClient.invalidateQueries({ queryKey: ['budget-actuals', view.id] });
        return true;
      } catch (e) {
        toastError('Month not saved', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
        return false;
      }
    },
    [view.id, current, queryClient, key],
  );

  const change = (fn: (d: MonthDraft) => MonthDraft) => {
    if (!editable || !shown) return;
    const next = fn(shown);
    dirty.current = true;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), SAVE_DELAY_MS);
  };

  const pick = async (m: number) => {
    if (dirty.current) await save(draft);
    dirty.current = false;
    setDraft(null);
    setPicked(m);
  };

  const act = async (action: VarianceAction, note?: string) => {
    setBusy(true);
    try {
      if (action === 'submit' && dirty.current && !(await save(draft))) return false;
      const res = await api<{ monthLabel: string }>(`/api/budgets/${view.id}/variance/${current}`, { method: 'POST', body: JSON.stringify({ action, note: note ?? null }) });
      const done = { submit: 'submitted for approval', approve: 'approved. Advance tax now uses these actuals', send_back: 'sent back to the project lead', reopen: 'reopened' }[action];
      toastSuccess(`${res.monthLabel} ${done}`);
      await queryClient.invalidateQueries({ queryKey: key });
      return true;
    } catch (e) {
      toastError('Not done', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { query, data, months, monthIndex: current, month: live, shown, budget, editable, busy, change, pick, act, saveNow: () => save(draft, false), entriesList };
}
