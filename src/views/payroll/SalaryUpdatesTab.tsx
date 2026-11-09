'use client';

import { useRef, useState } from 'react';
import { Check, Download, MoreHorizontal, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import type { PayrollCycle } from '@/lib/payroll/cycle';
import {
  computeSalary,
  emptyRow,
  formatInr,
  mergeRows,
  salariesFromCsv,
  salariesToCsv,
  type SalaryRow,
} from '@/lib/payroll/salaries';
import { RelatedFiles } from '@/views/payroll/RelatedFiles';
import { SALARY_FOLDERS, downloadText, type usePayrollCycle } from '@/views/payroll/use-payroll-cycle';

type Payroll = ReturnType<typeof usePayrollCycle>;

const NUM_COLS: Array<{ key: keyof SalaryRow; label: string; width: string }> = [
  { key: 'paidDays', label: 'Paid days', width: 'w-12' },
  { key: 'basic', label: 'Basic', width: 'w-[76px]' },
  { key: 'hra', label: 'HRA', width: 'w-[76px]' },
  { key: 'allowances', label: 'Allowances', width: 'w-[76px]' },
  { key: 'variablePay', label: 'Variable pay', width: 'w-[76px]' },
  { key: 'professionalTax', label: 'Prof. tax', width: 'w-14' },
  { key: 'tds', label: 'TDS', width: 'w-[76px]' },
];

/** The Salary Updates tab: related files, then the salary table with Export and Import. */
export function SalaryUpdatesTab({
  payroll,
  cycle,
  companyName,
  locked,
  lockReason,
}: {
  payroll: Payroll;
  cycle: PayrollCycle;
  companyName: string;
  /** True once the cut-off has passed or the salaries are marked ready. */
  locked: boolean;
  lockReason?: string;
}) {
  const { state, setRows, addFiles, removeFile, markReady, reopenSalaries } = payroll;
  const days = Number(cycle.to.slice(-2));
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; lines: string[] } | null>(null);
  const [menu, setMenu] = useState(false);
  const fileBase = `${companyName.replace(/[^A-Za-z0-9]+/g, '-')}-${cycle.key}`;

  const update = (i: number, patch: Partial<SalaryRow>) => setRows(state.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const exportCsv = () => {
    /* An empty table exports the header row plus one sample line, as an import template. */
    const rows = state.rows.length ? state.rows : [{ ...emptyRow(1, days), name: 'Sample worker' }];
    downloadText(`salaries-${fileBase}.csv`, salariesToCsv(rows));
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const res = salariesFromCsv(text, days);
    if (res.rows.length === 0) {
      setNotice({ tone: 'bad', lines: res.errors.length ? res.errors : ['No rows were found in the file.'] });
      return;
    }
    const merged = mergeRows(state.rows, res.rows);
    setRows(merged.rows);
    setNotice({
      tone: res.errors.length ? 'bad' : 'ok',
      lines: [`Imported ${file.name}: ${merged.updated} updated, ${merged.added} added.`, ...res.errors],
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[24px] font-semibold text-ink">Salary updates</h2>
            <Chip>{state.salaryStatus}</Chip>
          </div>
          <p className="mt-1 text-[15px] text-ink-muted">Review and update workers’ salaries before the cut-off date.</p>
          {lockReason ? <p className="mt-1 text-[13px] text-warning">{lockReason}</p> : null}
        </div>
        {state.salaryStatus === 'Done' ? (
          <Button variant="outline" size="lg" onClick={reopenSalaries}>
            <RotateCcw aria-hidden />
            Reopen
          </Button>
        ) : (
          <Button
            variant="outline"
            size="lg"
            className="border-brand text-brand-text"
            disabled={state.rows.length === 0 || locked}
            onClick={markReady}
            title={state.rows.length === 0 ? 'Add or import salaries first' : undefined}
          >
            <Check aria-hidden />
            Mark as ready
          </Button>
        )}
      </div>

      <RelatedFiles folders={SALARY_FOLDERS} files={state.files} onAdd={addFiles} onRemove={removeFile} readOnly={locked} />

      <section className="rounded-lg border-1.5 border-line bg-surface-raised p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[19px] font-semibold text-ink">Salaries</h3>
            <p className="mt-1 text-[15px] text-ink-muted">Update the salaries here, or export to a file to import large-scale changes.</p>
            <details className="mt-1 text-[14px]">
              <summary className="cursor-pointer text-brand-text hover:underline">How to update a worker’s salary?</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-muted">
                <li>Edit a cell in the table below, or click Export to download the current salaries as a CSV file.</li>
                <li>Change the file in Excel. Keep the “Employee ID” column; columns may be in any order.</li>
                <li>Click Import and pick the file. Rows are matched by Employee ID: matches are replaced, new IDs are added.</li>
                <li>PF (12% of basic up to ₹15,000) and ESI (0.75% when gross is ₹21,000 or less) are worked out for you.</li>
              </ol>
            </details>
          </div>
          <div className="relative flex items-center gap-6">
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 text-[15px] font-medium text-brand-text hover:underline">
              <Download className="size-4" aria-hidden />
              Export
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-2 text-[15px] font-medium text-brand-text hover:underline disabled:opacity-40 disabled:no-underline"
            >
              <Upload className="size-4" aria-hidden />
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Import salaries CSV"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              aria-label="More salary actions"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
              className="rounded p-1 text-brand-text hover:bg-hover"
            >
              <MoreHorizontal className="size-5" aria-hidden />
            </button>
            {menu ? (
              <div className="absolute right-0 top-9 z-10 w-52 rounded-md border-1.5 border-line bg-surface-raised p-1 shadow-lg">
                <button
                  type="button"
                  disabled={locked}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] hover:bg-hover disabled:opacity-40"
                  onClick={() => {
                    setRows([...state.rows, emptyRow(state.rows.length + 1, days)]);
                    setMenu(false);
                  }}
                >
                  <Plus className="size-4" aria-hidden /> Add a worker
                </button>
                <button
                  type="button"
                  disabled={locked || state.rows.length === 0}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] text-danger hover:bg-hover disabled:opacity-40"
                  onClick={() => {
                    if (window.confirm('Remove every salary row for this cycle?')) setRows([]);
                    setMenu(false);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden /> Clear all rows
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {notice ? (
          <div
            className={cn(
              'mt-4 flex items-start gap-3 rounded-md p-3 text-[13px]',
              notice.tone === 'ok' ? 'bg-positive-soft text-positive' : 'bg-warning-soft text-warning',
            )}
          >
            <ul className="flex-1 space-y-0.5">
              {notice.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        {state.rows.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-md border-1.5 border-dashed border-line py-10 text-center">
            <p className="text-[14px] text-ink-muted">No salaries for this cycle yet.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={locked} onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden /> Import a CSV
              </Button>
              <Button size="sm" disabled={locked} onClick={() => setRows([emptyRow(1, days)])}>
                <Plus aria-hidden /> Add a worker
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b-1.5 border-line text-left text-[12px] font-medium text-ink-muted">
                  <th className="px-2 py-2">Employee ID</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">State</th>
                  {NUM_COLS.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-right">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center">PF</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  <th className="px-2 py-2 text-right">Net pay</th>
                  <th className="px-2 py-2" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row, i) => {
                  const c = computeSalary(row, days);
                  const cell = 'h-8 rounded border-1.5 border-transparent bg-transparent px-1 hover:border-line focus:border-brand focus:outline-none disabled:hover:border-transparent';
                  return (
                    <tr key={i} className="border-b border-line-soft">
                      <td className="px-1 py-1">
                        <input className={cn(cell, 'w-[72px] font-mono')} value={row.employeeId} disabled={locked} aria-label="Employee ID" onChange={(e) => update(i, { employeeId: e.target.value })} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={cn(cell, 'w-32')} value={row.name} placeholder="Name" disabled={locked} aria-label="Name" onChange={(e) => update(i, { name: e.target.value })} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={cn(cell, 'w-10 uppercase')} value={row.state} maxLength={2} disabled={locked} aria-label="State" onChange={(e) => update(i, { state: e.target.value.toUpperCase() })} />
                      </td>
                      {NUM_COLS.map((col) => (
                        <td key={col.key} className="px-1 py-1 text-right">
                          <input
                            type="number"
                            min={0}
                            inputMode="decimal"
                            className={cn(cell, col.width, 'text-right font-mono')}
                            value={row[col.key] as number}
                            disabled={locked}
                            aria-label={col.label}
                            onChange={(e) => update(i, { [col.key]: Math.max(0, Number(e.target.value) || 0) } as Partial<SalaryRow>)}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1 text-center">
                        <input type="checkbox" checked={row.pfApplicable} disabled={locked} aria-label="PF applicable" onChange={(e) => update(i, { pfApplicable: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{formatInr(c.gross)}</td>
                      <td className="px-2 py-1 text-right font-mono font-medium text-ink">{formatInr(c.net)}</td>
                      <td className="px-1 py-1">
                        {locked ? null : (
                          <button type="button" aria-label={`Remove ${row.name || row.employeeId}`} className="rounded p-1 text-ink-muted hover:bg-hover hover:text-danger" onClick={() => setRows(state.rows.filter((_, j) => j !== i))}>
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {locked ? null : (
              <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-text hover:underline" onClick={() => setRows([...state.rows, emptyRow(state.rows.length + 1, days)])}>
                <Plus className="size-4" aria-hidden /> Add a worker
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
