'use client';

import { BadgeCheck, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import type { PayrollCycle } from '@/lib/payroll/cycle';
import { formatDay } from '@/lib/payroll/cycle';
import { computeSalary, formatInr, summaryToCsv, totalsFor } from '@/lib/payroll/salaries';
import { RelatedFiles } from '@/views/payroll/RelatedFiles';
import { SUMMARY_FOLDERS, downloadText, type usePayrollCycle } from '@/views/payroll/use-payroll-cycle';

type Payroll = ReturnType<typeof usePayrollCycle>;

/**
 * The Payroll Summary tab: related files, the totals for the cycle and the per-worker
 * breakdown. The summary can be approved only after the salaries are marked ready.
 */
export function PayrollSummaryTab({ payroll, cycle, companyName }: { payroll: Payroll; cycle: PayrollCycle; companyName: string }) {
  const { state, addFiles, removeFile, approveSummary, reopenSummary } = payroll;
  const days = Number(cycle.to.slice(-2));
  const totals = totalsFor(state.rows, days);
  const salariesReady = state.salaryStatus === 'Done';
  const fileBase = `${companyName.replace(/[^A-Za-z0-9]+/g, '-')}-${cycle.key}`;

  const tiles = [
    { label: 'Workers', value: String(totals.workers) },
    { label: 'Gross pay', value: formatInr(totals.gross) },
    { label: 'Deductions', value: formatInr(totals.deductions) },
    { label: 'Net pay', value: formatInr(totals.net) },
    { label: 'Employer cost', value: formatInr(totals.employerCost) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[24px] font-semibold text-ink">Payroll summary</h2>
            <Chip>{state.summaryStatus}</Chip>
          </div>
          <p className="mt-1 text-[15px] text-ink-muted">Download, review and approve the payroll summary from the approval page.</p>
          {!salariesReady ? (
            <p className="mt-1 text-[13px] text-ink-faint">Opens for approval once the salary updates are marked ready.</p>
          ) : null}
          {state.approvedAt ? (
            <p className="mt-1 text-[13px] text-positive">Approved on {formatDay(state.approvedAt.slice(0, 10))}.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" disabled={state.rows.length === 0} onClick={() => downloadText(`payroll-summary-${fileBase}.csv`, summaryToCsv(state.rows, days))}>
            <Download aria-hidden />
            Download summary
          </Button>
          {state.summaryStatus === 'Done' ? (
            <Button variant="outline" size="lg" onClick={reopenSummary}>
              <RotateCcw aria-hidden />
              Reopen
            </Button>
          ) : (
            <Button size="lg" disabled={!salariesReady} onClick={approveSummary}>
              <BadgeCheck aria-hidden />
              Approve
            </Button>
          )}
        </div>
      </div>

      <RelatedFiles folders={SUMMARY_FOLDERS} files={state.files} onAdd={addFiles} onRemove={removeFile} readOnly={state.summaryStatus === 'Done'} />

      <section className="rounded-lg border-1.5 border-line bg-surface-raised p-5 sm:p-7">
        <h3 className="text-[19px] font-semibold text-ink">Summary</h3>
        <p className="mt-1 text-[15px] text-ink-muted">
          {cycle.label} · {days} days · PF and ESI worked out from the salary updates.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md border-1.5 border-line-soft p-4">
              <div className="text-[13px] text-ink-muted">{t.label}</div>
              <div className="mt-1 font-mono text-[20px] text-ink">{t.value}</div>
            </div>
          ))}
        </div>

        {state.rows.length === 0 ? (
          <p className="mt-6 rounded-md border-1.5 border-line py-8 text-center text-[14px] text-ink-muted">
            No salaries yet. Add them in the Salary updates tab.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b-1.5 border-line text-left text-[12px] font-medium text-ink-muted">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2 text-right">Paid days</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  <th className="px-2 py-2 text-right">PF</th>
                  <th className="px-2 py-2 text-right">ESI</th>
                  <th className="px-2 py-2 text-right">Prof. tax</th>
                  <th className="px-2 py-2 text-right">TDS</th>
                  <th className="px-2 py-2 text-right">Net pay</th>
                  <th className="px-2 py-2 text-right">Employer cost</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, i) => {
                  const c = computeSalary(r, days);
                  return (
                    <tr key={i} className="border-b border-line-soft">
                      <td className="px-2 py-2">
                        <div className="text-ink">{r.name || '—'}</div>
                        <div className="font-mono text-[11px] text-ink-faint">
                          {r.employeeId} · {r.state}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{r.paidDays}</td>
                      <td className="px-2 py-2 text-right font-mono">{formatInr(c.gross)}</td>
                      <td className="px-2 py-2 text-right font-mono">{formatInr(c.pf)}</td>
                      <td className="px-2 py-2 text-right font-mono">{formatInr(c.esi)}</td>
                      <td className="px-2 py-2 text-right font-mono">{formatInr(r.professionalTax)}</td>
                      <td className="px-2 py-2 text-right font-mono">{formatInr(r.tds)}</td>
                      <td className="px-2 py-2 text-right font-mono font-medium text-ink">{formatInr(c.net)}</td>
                      <td className="px-2 py-2 text-right font-mono">{formatInr(c.employerCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-1.5 border-line font-medium text-ink">
                  <td className="px-2 py-2">Total</td>
                  <td />
                  <td className="px-2 py-2 text-right font-mono">{formatInr(totals.gross)}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatInr(totals.pf)}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatInr(totals.esi)}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatInr(state.rows.reduce((s, r) => s + r.professionalTax, 0))}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatInr(state.rows.reduce((s, r) => s + r.tds, 0))}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatInr(totals.net)}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatInr(totals.employerCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
