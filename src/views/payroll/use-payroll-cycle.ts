'use client';

import { useCallback, useEffect, useState } from 'react';
import { defaultDates, type PayrollCycle } from '@/lib/payroll/cycle';
import type { SalaryRow } from '@/lib/payroll/salaries';

/**
 * The working state of one client's payroll cycle: the two picked dates, the salary table, the
 * related files and the status of the two stages.
 *
 * FIRST PASS: the state is kept in this browser (localStorage, one key per client and cycle).
 * Nothing reaches the database or S3 yet, so another person or device does not see it. The
 * next pass moves it behind a `payroll` repository (with an `AuthContext`, like every other
 * repository) and uploads files through `src/storage/`; this hook is the only place to change.
 */

export type StageStatus = 'Not started' | 'In progress' | 'Done';

export interface PayrollFile {
  name: string;
  size: number;
  addedAt: string;
}

export const SALARY_FOLDERS = ['Workers', 'Expenses', 'Time off', 'Compensation'] as const;
export const SUMMARY_FOLDERS = ['Payslips source', 'Payroll data', 'Payroll summary', 'Banking/Payments', 'Journal entry'] as const;

export interface PayrollCycleState {
  cutoff: string;
  payment: string;
  rows: SalaryRow[];
  files: Record<string, PayrollFile[]>;
  salaryStatus: StageStatus;
  summaryStatus: StageStatus;
  /** When the salaries were marked ready and the summary approved. */
  readyAt?: string;
  approvedAt?: string;
}

function freshState(cycle: PayrollCycle): PayrollCycleState {
  const { cutoff, payment } = defaultDates(cycle);
  return { cutoff, payment, rows: [], files: {}, salaryStatus: 'Not started', summaryStatus: 'Not started' };
}

function storageKey(engagementId: string, cycleKey: string): string {
  return `vcfo:payroll:${engagementId}:${cycleKey}`;
}

function load(engagementId: string, cycle: PayrollCycle): PayrollCycleState {
  try {
    const raw = window.localStorage.getItem(storageKey(engagementId, cycle.key));
    if (raw) return { ...freshState(cycle), ...(JSON.parse(raw) as Partial<PayrollCycleState>) };
  } catch {
    /* Private window or blocked storage: start fresh. */
  }
  return freshState(cycle);
}

export function usePayrollCycle(engagementId: string, cycle: PayrollCycle) {
  const [state, setState] = useState<PayrollCycleState>(() => freshState(cycle));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const id = `${engagementId}:${cycle.key}`;

  /* Read after mount, so the server render and the first client render agree. */
  useEffect(() => {
    setState(load(engagementId, cycle));
    setLoadedFor(id);
    // `cycle` is derived from `cycle.key`, which `id` carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (loadedFor !== id) return;
    try {
      window.localStorage.setItem(storageKey(engagementId, cycle.key), JSON.stringify(state));
    } catch {
      /* Storage full or blocked: the page still works for this visit. */
    }
  }, [state, loadedFor, id, engagementId, cycle.key]);

  /** Any change to the salaries moves the stage to In progress and reopens the summary. */
  const setRows = useCallback((rows: SalaryRow[]) => {
    setState((s) => ({
      ...s,
      rows,
      salaryStatus: s.salaryStatus === 'Done' ? 'Done' : 'In progress',
      summaryStatus: 'Not started',
      approvedAt: undefined,
    }));
  }, []);

  const setDates = useCallback((cutoff: string, payment: string) => {
    setState((s) => ({ ...s, cutoff, payment }));
  }, []);

  const addFiles = useCallback((folder: string, files: PayrollFile[]) => {
    setState((s) => ({ ...s, files: { ...s.files, [folder]: [...(s.files[folder] ?? []), ...files] } }));
  }, []);

  const removeFile = useCallback((folder: string, index: number) => {
    setState((s) => ({ ...s, files: { ...s.files, [folder]: (s.files[folder] ?? []).filter((_, i) => i !== index) } }));
  }, []);

  const markReady = useCallback(() => {
    setState((s) => ({ ...s, salaryStatus: 'Done', readyAt: new Date().toISOString(), summaryStatus: 'In progress' }));
  }, []);

  const reopenSalaries = useCallback(() => {
    setState((s) => ({ ...s, salaryStatus: 'In progress', readyAt: undefined, summaryStatus: 'Not started', approvedAt: undefined }));
  }, []);

  const approveSummary = useCallback(() => {
    setState((s) => ({ ...s, summaryStatus: 'Done', approvedAt: new Date().toISOString() }));
  }, []);

  const reopenSummary = useCallback(() => {
    setState((s) => ({ ...s, summaryStatus: 'In progress', approvedAt: undefined }));
  }, []);

  return {
    state,
    loaded: loadedFor === id,
    setRows,
    setDates,
    addFiles,
    removeFile,
    markReady,
    reopenSalaries,
    approveSummary,
    reopenSummary,
  };
}

/** Start a download of text content in the browser. */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([`\uFEFF${text}`], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
