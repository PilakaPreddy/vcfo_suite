'use client';

import Link from 'next/link';
import { DashSection, DashDonut } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { PersonCell, StatusLegend } from '@/components/staff/today/today-parts';
import {
  TODAY_STATUS_ORDER,
  countByStatus,
  type TeamTaskRow,
  type TodayStatus,
} from '@/components/staff/today/today-rows';
import { cn } from '@/lib/utils';

const CHART_ORDER: TodayStatus[] = ['Done', 'In progress', 'Due soon', 'Overdue', 'Waiting', 'Not started'];

/** Task status (C1, R-25): a donut in the status colours with the total in the centre and a legend. */
export function TaskStatusCard({ rows, title = 'Task status' }: { rows: Array<{ status: TodayStatus }>; title?: string }) {
  const counts = countByStatus(rows);
  // The prototype's chart order: Done first.
  const order = [...TODAY_STATUS_ORDER].sort((a, b) => CHART_ORDER.indexOf(a.status) - CHART_ORDER.indexOf(b.status));
  return (
    <DashSection title={title}>
      <div className="flex min-w-0 items-center gap-6">
        <DashDonut
          size={96}
          segments={order.map((s) => ({ n: counts[s.status], color: s.stroke }))}
          centerLabel={rows.length}
          centerCaption=""
        />
        <ul className="grid min-w-0 flex-1 gap-1">
          {order.map((s) => (
            <li key={s.status} className="flex items-center gap-2 text-[13px] text-ink-2">
              <i className={cn('h-2 w-2 flex-none rounded-[2px]', s.bar)} aria-hidden />
              {s.status}
              <b className="ml-auto pl-3 font-medium tabular-nums text-ink">{counts[s.status]}</b>
            </li>
          ))}
        </ul>
      </div>
    </DashSection>
  );
}

const LOAD_STATUSES: TodayStatus[] = ['Overdue', 'Due soon', 'In progress', 'Not started'];

/**
 * Workload by lead (C2, R-25): one stacked bar per person in the status colours, scaled to the
 * busiest lead. "Rebalance" opens the project leads page.
 */
export function WorkloadByLeadCard({ rows, rebalanceHref }: { rows: TeamTaskRow[]; rebalanceHref: string }) {
  const byLead = new Map<string, { name: string; rows: TeamTaskRow[] }>();
  for (const r of rows) {
    if (r.status === 'Done') continue;
    const entry = byLead.get(r.leadId);
    if (entry) entry.rows.push(r);
    else byLead.set(r.leadId, { name: r.leadName, rows: [r] });
  }
  const people = [...byLead.entries()]
    .map(([id, v]) => ({ id, name: v.name, open: v.rows.length, counts: countByStatus(v.rows) }))
    .sort((a, b) => b.open - a.open);
  const max = Math.max(1, ...people.map((p) => p.open));
  const bar = (s: TodayStatus) => TODAY_STATUS_ORDER.find((x) => x.status === s)?.bar ?? '';

  return (
    <section className="surface min-w-0 overflow-hidden">
      <div className="flex min-h-[52px] min-w-0 items-center gap-2.5 border-b border-line-soft px-4 py-2">
        <CardHeadTile title="Workload by lead" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">Workload by lead</h2>
        <Button size="sm" variant="secondary" asChild>
          <Link href={rebalanceHref}>Rebalance</Link>
        </Button>
      </div>
      <div className="px-4 pb-4 pt-3">
        {people.length === 0 ? (
          <p className="py-2 text-[13px] text-ink-muted">No open tasks</p>
        ) : (
          <ul className="grid gap-3.5">
            {people.map((p) => (
              <li
                key={p.id}
                className="grid gap-[7px]"
                title={LOAD_STATUSES.map((s) => `${s} ${p.counts[s]}`).join(' · ')}
              >
                <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                  <PersonCell name={p.name} full />
                  <span className="ml-auto text-[12.5px] font-normal text-ink-muted">{p.open} open</span>
                </div>
                <span className="flex h-2.5 gap-0.5" style={{ width: `${(p.open / max) * 100}%` }} aria-hidden>
                  {LOAD_STATUSES.filter((s) => p.counts[s] > 0).map((s) => (
                    <i key={s} className={cn('block h-full rounded-[2px]', bar(s))} style={{ flex: `${p.counts[s]} 1 0` }} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <StatusLegend statuses={LOAD_STATUSES} className="mt-4" />
      </div>
    </section>
  );
}
