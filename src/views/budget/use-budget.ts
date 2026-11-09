'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { computeBudget, type BudgetResult } from '@/lib/budget/engine';
import type { BudgetRow, BudgetSettings, BudgetState, RowKind } from '@/lib/budget/model';
import type { BudgetView } from '@/lib/budget/wire';
import { toastError } from '@/lib/toast-errors';
import { ApiError, api, errorText } from './format';

export interface BudgetSibling {
  id: string;
  fyName: string;
}

export type SaveState = 'saved' | 'saving' | 'error';

const SAVE_DELAY_MS = 700;

/**
 * The live budget on screen. Edits change local state at once, so the Master Budget recalculates
 * as a person types, and each row saves on its own after a short pause with the version it last
 * saw. A refetch brings in other people's work and never overwrites a row with unsaved edits.
 */
export function useBudget(budgetId: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['budget', budgetId], [budgetId]);
  const query = useQuery({ queryKey, queryFn: () => api<BudgetView & { siblings: BudgetSibling[] }>(`/api/budgets/${budgetId}`), refetchInterval: 30_000 });
  const view = query.data;

  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [settings, setSettings] = useState<BudgetSettings | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(1);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const rowsRef = useRef<BudgetRow[]>([]);
  rowsRef.current = rows;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saving = useRef(new Set<string>());
  const settingsDirty = useRef(false);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef<{ settings: BudgetSettings | null; version: number }>({ settings: null, version: 1 });
  settingsRef.current = { settings, version: settingsVersion };

  useEffect(() => {
    if (!view) return;
    const pending = (id: string) => timers.current.has(id) || saving.current.has(id);
    setRows((current) => {
      const local = new Map(current.map((r) => [r.id, r]));
      return view.state.rows.map((server) => {
        const mine = local.get(server.id);
        return mine && pending(server.id) ? mine : server;
      });
    });
    if (!settingsDirty.current) {
      setSettings(view.state.settings);
      setSettingsVersion(view.settingsVersion);
    }
  }, [view]);

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey }), [queryClient, queryKey]);

  const updateSaveState = useCallback(() => {
    if (timers.current.size || saving.current.size || settingsDirty.current) return;
    setSaveState((s) => (s === 'error' ? s : 'saved'));
  }, []);

  const saveRow = useCallback(
    async (rowId: string) => {
      timers.current.delete(rowId);
      /* One save at a time per row: a later edit waits, so versions stay in order. */
      if (saving.current.has(rowId)) {
        timers.current.set(rowId, setTimeout(() => void saveRow(rowId), SAVE_DELAY_MS));
        return;
      }
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row) return;
      saving.current.add(rowId);
      setSaveState('saving');
      try {
        const saved = await api<BudgetRow>(`/api/budgets/${budgetId}/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify({ version: row.version, data: row.data }) });
        /* Keep values typed during the save; only the version moves. */
        setRows((list) => list.map((r) => (r.id === rowId ? { ...r, version: saved.version } : r)));
        setSaveState('saved');
      } catch (e) {
        if (e instanceof ApiError && e.code === 'conflict' && e.detail) {
          const theirs = e.detail as BudgetRow;
          timers.current.delete(rowId);
          setRows((list) => list.map((r) => (r.id === rowId ? theirs : r)));
          setSaveState('saved');
          toastError('Row changed by someone else', errorText('conflict'));
        } else {
          setSaveState('error');
          toastError('Not saved', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
        }
      } finally {
        saving.current.delete(rowId);
        updateSaveState();
      }
    },
    [budgetId, updateSaveState],
  );

  /** Change fields of a row. Saves after a short pause. */
  const patchRow = useCallback(
    (rowId: string, patch: Record<string, unknown>) => {
      setRows((list) => list.map((r) => (r.id === rowId ? { ...r, data: { ...r.data, ...patch } as BudgetRow['data'] } : r)));
      setSaveState('saving');
      const existing = timers.current.get(rowId);
      if (existing) clearTimeout(existing);
      timers.current.set(rowId, setTimeout(() => void saveRow(rowId), SAVE_DELAY_MS));
    },
    [saveRow],
  );

  const addRow = useCallback(
    async (kind: RowKind, data?: object) => {
      try {
        const row = await api<BudgetRow>(`/api/budgets/${budgetId}/rows`, { method: 'POST', body: JSON.stringify({ kind, data }) });
        setRows((list) => [...list, row]);
        return row;
      } catch (e) {
        toastError('Row not added', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
        return null;
      }
    },
    [budgetId],
  );

  const removeRow = useCallback(
    async (rowId: string) => {
      const before = rowsRef.current;
      const timer = timers.current.get(rowId);
      if (timer) clearTimeout(timer);
      timers.current.delete(rowId);
      setRows((list) => list.filter((r) => r.id !== rowId));
      try {
        await api(`/api/budgets/${budgetId}/rows/${rowId}`, { method: 'DELETE' });
      } catch (e) {
        setRows(before);
        toastError('Row not removed', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
      }
    },
    [budgetId],
  );

  const saveSettings = useCallback(async () => {
    settingsTimer.current = null;
    const { settings: current, version } = settingsRef.current;
    if (!current) return;
    setSaveState('saving');
    try {
      const saved = await api<{ settingsVersion: number }>(`/api/budgets/${budgetId}`, { method: 'PATCH', body: JSON.stringify({ version, settings: current }) });
      setSettingsVersion(saved.settingsVersion);
      settingsDirty.current = false;
      setSaveState('saved');
    } catch (e) {
      settingsDirty.current = false;
      setSaveState('saved');
      toastError('Settings not saved', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
      void refresh();
    }
  }, [budgetId, refresh]);

  const patchSettings = useCallback(
    (patch: Partial<BudgetSettings>) => {
      setSettings((s) => (s ? { ...s, ...patch } : s));
      settingsDirty.current = true;
      setSaveState('saving');
      if (settingsTimer.current) clearTimeout(settingsTimer.current);
      settingsTimer.current = setTimeout(() => void saveSettings(), SAVE_DELAY_MS);
    },
    [saveSettings],
  );

  const state: BudgetState | null = useMemo(() => (settings ? { settings, rows, maskedPayroll: view?.maskedPayroll ?? null } : null), [settings, rows, view?.maskedPayroll]);
  const result: BudgetResult | null = useMemo(() => (state ? computeBudget(state) : null), [state]);

  return { query, view, state, result, rows, settings, saveState, patchRow, addRow, removeRow, patchSettings, refresh };
}

export type BudgetController = ReturnType<typeof useBudget>;
