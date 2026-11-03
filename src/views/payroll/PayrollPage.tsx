'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarDays, ChevronDown, Download, FileStack, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DashHeroCompanyTile } from '@/components/dash/DashHero';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import {
  checkDates,
  cutoffLocalLabel,
  cycleOptions,
  daysToCutoff,
  formatDay,
  parseCycleKey,
  CUTOFF_TIME_UTC,
} from '@/lib/payroll/cycle';
import { emptyRow, salariesToCsv } from '@/lib/payroll/salaries';
import { LabourRegistersPage } from '@/views/labour-registers/LabourRegistersPage';
import { PayrollSummaryTab } from '@/views/payroll/PayrollSummaryTab';
import { SalaryUpdatesTab } from '@/views/payroll/SalaryUpdatesTab';
import { downloadText, usePayrollCycle } from '@/views/payroll/use-payroll-cycle';

/**
 * PAYROLL — one client's monthly payroll cycle, laid out like the payroll provider screens the
 * firm already works in: the client header, a Cycle info card (cycle, cut-off date, payment
 * date, active workers, files), the cut-off countdown, and the tabs.
 *
 * The tabs are Salary updates, Payroll summary and Labour registers. Labour registers used to
 * be its own sidebar row; it now opens here, to the right of the two payroll tabs, for the
 * same client and the same month, because the registers are built from the month's payroll.
 *
 * `?company=`, `?cycle=` (`YYYY-MM`), `?tab=` and the labour register `?state=` carry the
 * choice across a refresh.
 */

export type PayrollTab = 'salary-updates' | 'payroll-summary' | 'labour-registers';

const TABS: Array<{ key: PayrollTab; label: string }> = [
  { key: 'salary-updates', label: 'Salary updates' },
  { key: 'payroll-summary', label: 'Payroll summary' },
  { key: 'labour-registers', label: 'Labour registers' },
];

export interface PayrollPageProps {
  shellBase: string;
  company?: string;
  cycle?: string;
  tab?: string;
  stateCode?: string;
  /** False on the client portal: salaries are read-only there. */
  canEdit?: boolean;
}

export function PayrollPage({ shellBase, company, cycle: cycleKey, tab, stateCode, canEdit = true }: PayrollPageProps) {
  const router = useRouter();
  const { engagements, engagementsSettled } = useApp();
  const engagement = useMemo(
    () => engagements.find((e) => e.id === company || e.slug === company) ?? engagements[0],
    [engagements, company],
  );
  const cycle = parseCycleKey(cycleKey);
  const options = useMemo(() => {
    const list = cycleOptions();
    return list.some((c) => c.key === cycle.key) ? list : [cycle, ...list];
  }, [cycle]);
  const activeTab: PayrollTab = TABS.some((t) => t.key === tab) ? (tab as PayrollTab) : 'salary-updates';

  const payroll = usePayrollCycle(engagement?.id ?? 'none', cycle);
  const { state } = payroll;

  const [editingDates, setEditingDates] = useState(false);
  const [draft, setDraft] = useState({ cutoff: state.cutoff, payment: state.payment });
  const draftCheck = checkDates(cycle, draft.cutoff, draft.payment);

  const go = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = { company: engagement?.id, cycle: cycle.key, tab: activeTab, state: stateCode, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    router.replace(`${shellBase}/payroll?${params.toString()}`, { scroll: false });
  };

  if (engagementsSettled && !engagement) {
    return <EmptyState title="No clients yet. Payroll opens once a client is on your roster." />;
  }
  if (!engagement) {
    return <div className="h-64 animate-pulse rounded-lg bg-surface-sunken/40" aria-busy="true" aria-label="Loading payroll" />;
  }

  const days = daysToCutoff(state.cutoff);
  const cutoffPassed = days < 0;
  const locked = !canEdit || cutoffPassed || state.salaryStatus === 'Done';
  const lockReason = !canEdit
    ? 'Read only. Salary changes are made by the SBC team.'
    : cutoffPassed && state.salaryStatus !== 'Done'
      ? 'The cut-off has passed, so salaries can no longer be changed for this cycle.'
      : undefined;
  const fileCount = Object.values(state.files).reduce((n, list) => n + list.length, 0);
  const workerStates = [...new Set(state.rows.map((r) => r.state))];
  const labourBase = `${shellBase}/payroll?company=${engagement.id}&cycle=${cycle.key}&tab=labour-registers`;

  return (
    <div className="flex flex-col gap-5">
      {/* Client header */}
      <header className="flex flex-wrap items-center gap-4">
        <DashHeroCompanyTile name={engagement.companyName} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] font-semibold text-ink">{engagement.companyName}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-[13px] font-medium text-ink-2">
            <span className="rounded bg-surface-sunken px-2 py-0.5">Payroll</span>
            <span className="rounded bg-surface-sunken px-2 py-0.5">Monthly cycle</span>
          </div>
        </div>
        {engagements.length > 1 ? (
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            Client
            <span className="relative inline-flex">
              <select
                value={engagement.id}
                onChange={(e) => go({ company: e.target.value })}
                className="h-control-md max-w-[260px] appearance-none rounded-md border-1.5 border-line-strong bg-surface-raised pl-3 pr-8 text-[14px] font-medium text-ink shadow-control"
              >
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.companyName}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            </span>
          </label>
        ) : null}
      </header>

      {/* Cycle info */}
      <section className="rounded-lg border-1.5 border-line bg-surface-raised p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[22px] font-semibold text-ink">Cycle info</h2>
          <Button
            variant="outline"
            className="border-brand text-brand-text"
            disabled={state.rows.length === 0}
            title={state.rows.length === 0 ? 'No salaries in this cycle yet' : 'Download the salary data for this cycle'}
            onClick={() =>
              downloadText(
                `hr-data-${engagement.companyName.replace(/[^A-Za-z0-9]+/g, '-')}-${cycle.key}.csv`,
                salariesToCsv(state.rows.length ? state.rows : [emptyRow(1, 30)]),
              )
            }
          >
            <Download aria-hidden />
            HR data
          </Button>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_0.8fr] lg:gap-0 lg:divide-x lg:divide-line">
          <div className="lg:pr-6">
            <label htmlFor="payroll-cycle" className="text-[14px] text-ink-muted">
              Cycle (Monthly)
            </label>
            <span className="relative mt-2 flex">
              <select
                id="payroll-cycle"
                value={cycle.key}
                onChange={(e) => go({ cycle: e.target.value })}
                className="h-12 w-full appearance-none rounded-md border-1.5 border-line-strong bg-surface-raised pl-4 pr-10 text-[17px] text-ink shadow-control"
              >
                {options.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-ink" aria-hidden />
            </span>
          </div>

          <InfoCell label="Cut-off date" value={formatDay(state.cutoff)} onEdit={canEdit ? () => { setDraft({ cutoff: state.cutoff, payment: state.payment }); setEditingDates(true); } : undefined} />
          <InfoCell label="Payment date" value={formatDay(state.payment)} onEdit={canEdit ? () => { setDraft({ cutoff: state.cutoff, payment: state.payment }); setEditingDates(true); } : undefined} />
          <InfoCell label="Active workers" value={String(state.rows.length)} />
          <div className="lg:pl-6">
            <div className="text-[14px] text-ink-muted">Files</div>
            <div className="mt-2 flex items-center gap-1.5 text-[20px] text-brand-text">
              <FileStack className="size-5" aria-hidden />
              {fileCount}
            </div>
          </div>
        </div>

        {editingDates ? (
          <div className="mt-6 rounded-md border-1.5 border-line-soft bg-surface p-4">
            <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
              <CalendarDays className="size-4" aria-hidden /> Dates for {cycle.label}
            </div>
            <p className="mt-1 text-[13px] text-ink-muted">
              Both dates fall inside the cycle month. The cut-off closes salary changes at {CUTOFF_TIME_UTC} UTC (02:30 IST the next
              morning); the payment date must be on or after it.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
                Cut-off date
                <input
                  type="date"
                  min={cycle.from}
                  max={cycle.to}
                  value={draft.cutoff}
                  onChange={(e) => setDraft((d) => ({ ...d, cutoff: e.target.value }))}
                  className="h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
                Payment date
                <input
                  type="date"
                  min={draft.cutoff || cycle.from}
                  max={cycle.to}
                  value={draft.payment}
                  onChange={(e) => setDraft((d) => ({ ...d, payment: e.target.value }))}
                  className="h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] text-ink"
                />
              </label>
              <Button
                disabled={!draftCheck.ok}
                onClick={() => {
                  payroll.setDates(draft.cutoff, draft.payment);
                  setEditingDates(false);
                }}
              >
                Save dates
              </Button>
              <Button variant="quiet" onClick={() => setEditingDates(false)}>
                Cancel
              </Button>
            </div>
            {!draftCheck.ok ? <p className="mt-2 text-[13px] text-danger">{draftCheck.message}</p> : null}
          </div>
        ) : null}
      </section>

      {/* Cut-off countdown */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-md border-1.5 px-5 py-4 text-[16px]',
          cutoffPassed ? 'border-line bg-surface-sunken text-ink-muted' : 'border-warning-soft bg-warning-soft text-ink',
        )}
        role="status"
      >
        <AlertCircle className={cn('size-5 flex-none', cutoffPassed ? 'text-ink-muted' : 'text-warning')} aria-hidden />
        {cutoffPassed ? (
          <span>
            Cut-off passed on {formatDay(state.cutoff)} at {CUTOFF_TIME_UTC} UTC (your local time: {cutoffLocalLabel(state.cutoff)}).
          </span>
        ) : (
          <span>
            Cut-off is in <b>{days === 0 ? 'less than a day' : `${days} day${days === 1 ? '' : 's'}`}</b> on {formatDay(state.cutoff)} at{' '}
            {CUTOFF_TIME_UTC} UTC (your local time: {cutoffLocalLabel(state.cutoff)})
          </span>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Payroll" className="grid grid-cols-3 gap-3">
        {TABS.map((t) => {
          const on = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go({ tab: t.key })}
              className={cn(
                'border-b-[3px] px-2 pb-3 pt-2 text-[16px] transition-colors sm:text-[18px]',
                on ? 'border-brand text-brand-text' : 'border-line text-ink hover:text-brand-text',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.key === activeTab)!.label}>
        {activeTab === 'salary-updates' ? (
          <SalaryUpdatesTab payroll={payroll} cycle={cycle} companyName={engagement.companyName} locked={locked} lockReason={lockReason} />
        ) : activeTab === 'payroll-summary' ? (
          <PayrollSummaryTab payroll={payroll} cycle={cycle} companyName={engagement.companyName} />
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-[24px] font-semibold text-ink">Labour registers</h2>
              <p className="mt-1 text-[15px] text-ink-muted">
                The statutory registers for {engagement.companyName}, {cycle.label}. Pick the state the establishment is in.
              </p>
            </div>
            <LabourRegistersPage
              shellBase={shellBase}
              stateCode={stateCode ?? workerStates[0]}
              period={cycle.key}
              canPrepare={canEdit}
              linkBase={labourBase}
              relevantStates={workerStates.length ? workerStates : undefined}
              embedded
            />
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="lg:px-6">
      <div className="flex items-center gap-2 text-[14px] text-ink-muted">
        {label}
        {onEdit ? (
          <button type="button" onClick={onEdit} aria-label={`Change ${label.toLowerCase()}`} className="rounded p-0.5 text-brand-text hover:bg-hover">
            <Pencil className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-2 text-[20px] text-ink">{value}</div>
    </div>
  );
}
