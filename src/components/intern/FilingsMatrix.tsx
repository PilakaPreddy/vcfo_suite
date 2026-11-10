'use client';

import { useMemo } from 'react';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import { ClientDot } from '@/components/staff/today/today-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import type { ComplianceFiling } from '@/data/compliance';
import type { Engagement } from '@/data/engagements';
import { ymdInIst } from '@/lib/intern/intern-work';
import { cn } from '@/lib/utils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_FORMS = 9;
const LEGEND = [
  ['Filed', 'bg-positive-mid'],
  ['Due soon', 'bg-warning-mid'],
  ['Overdue', 'bg-danger-mid'],
  ['Upcoming', 'bg-upcoming-mid'],
  ['Not applicable', 'border-1.5 border-line-strong'],
] as const;

type Cell = { state: 'filed' | 'soon' | 'late' | 'upcoming'; day: number };

const CELL: Record<Cell['state'] | 'na', string> = {
  filed: 'bg-positive-soft text-positive',
  soon: 'bg-warning-soft text-warning',
  late: 'bg-danger-soft text-danger',
  upcoming: 'bg-surface-sunken text-ink-2',
  na: 'border-1.5 border-line',
};

/**
 * Clients × filings for this month (prototype `FilingsMatrix`): one row per client, one column
 * per form due this month (up to nine, the most common first). A cell shows ✓ when filed, ! when
 * late, else the due day; amber when due within seven days. A blank cell means that client has
 * no such filing this month. Built from the stored filings only.
 */
export function FilingsMatrix({ filings, engagements, now }: { filings: ComplianceFiling[]; engagements: Engagement[]; now: Date }) {
  const today = ymdInIst(now);
  const month = today.slice(0, 7);
  const { forms, rows } = useMemo(() => {
    const inMonth = filings.filter((f) => f.nextDue?.slice(0, 7) === month);
    const tally = new Map<string, number>();
    for (const f of inMonth) tally.set(f.filing, (tally.get(f.filing) ?? 0) + 1);
    const forms = [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_FORMS)
      .map(([form]) => form);
    const names = new Map(engagements.map((e) => [e.id, e.companyName]));
    const byClient = new Map<string, Map<string, Cell>>();
    const soonLimit = new Date(`${today}T00:00:00Z`).getTime() + 7 * 86_400_000;
    for (const f of inMonth) {
      if (!forms.includes(f.filing) || !names.has(f.engagementId)) continue;
      const due = f.nextDue.slice(0, 10);
      const dueT = new Date(`${due}T00:00:00Z`).getTime();
      const state: Cell['state'] =
        f.status === 'filed' ? 'filed' : f.status === 'overdue' || due < today ? 'late' : dueT <= soonLimit ? 'soon' : 'upcoming';
      const cells = byClient.get(f.engagementId) ?? new Map<string, Cell>();
      cells.set(f.filing, { state, day: Number(due.slice(8, 10)) });
      byClient.set(f.engagementId, cells);
    }
    const rows = [...byClient.entries()]
      .map(([id, cells]) => ({ id, name: names.get(id) ?? '', cells }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { forms, rows };
  }, [filings, engagements, month, today]);

  const legend = (
    <footer className="flex flex-wrap items-center gap-3 px-4 py-2 text-[13px] text-ink-muted md:px-5">
      <span className="tabular-nums">
        {rows.length ? `1–${rows.length} of ${rows.length}` : ''}
      </span>
      <span className="hidden flex-wrap items-center gap-3 md:flex">
        {LEGEND.map(([label, dot]) => (
          <span key={label} className="flex items-center gap-1.5">
            <i className={cn('h-2 w-2 rounded-[2px]', dot)} aria-hidden />
            {label}
          </span>
        ))}
      </span>
    </footer>
  );

  return (
    <DashSection title={`Clients × filings · ${MONTHS[Number(month.slice(5, 7)) - 1]}`} meta={String(rows.length)} flush>
      {rows.length === 0 ? (
        <EmptyState title="No filings due this month" className="m-4" />
      ) : (
        <>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]" style={{ minWidth: 200 + forms.length * 58 }}>
            <caption className="sr-only">Clients by filings due this month</caption>
            <thead>
              <tr>
                <th scope="col" className="h-9 border-b-1.5 border-line pl-4 pr-3 text-left md:pl-5 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted">
                  Client
                </th>
                {forms.map((form) => (
                  <th key={form} scope="col" title={form} className="h-9 w-[58px] whitespace-nowrap border-b-1.5 border-line px-1 text-center text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted">
                    {/* "MGT-7" fits the 58px column; "Form MGT-7" ran past the card edge. */}
                    {form.replace(/^form\s+/i, '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="h-11 border-b border-line-soft pl-4 pr-3 md:pl-5">
                    <span className="flex min-w-0 items-center gap-2">
                      <ClientDot name={r.name} />
                      <span className="truncate text-[14px] font-medium text-ink">{shortCompany(r.name)}</span>
                    </span>
                  </td>
                  {forms.map((form) => {
                    const c = r.cells.get(form);
                    return (
                      <td key={form} className="border-b border-line-soft px-1 text-center">
                        <span
                          className={cn('mx-auto grid h-6 w-10 place-items-center rounded-sm font-medium tabular-nums', CELL[c?.state ?? 'na'])}
                          title={c ? `${form} · ${c.state === 'filed' ? 'filed' : c.state === 'late' ? 'overdue' : `due ${c.day}`}` : `${form} · not applicable`}
                        >
                          {!c ? '' : c.state === 'filed' ? '✓' : c.state === 'late' ? '!' : c.day}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {legend}
        </>
      )}
    </DashSection>
  );
}
