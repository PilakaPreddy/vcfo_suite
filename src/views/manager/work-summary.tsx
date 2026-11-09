'use client';

import { DashDonut, DashLegendRow, DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import { AreaPill } from '@/components/ui/spectrum-chip';
import type { TodayStatus } from '@/components/staff/today/today-rows';
import { areaSplit, statusCounts } from '@/views/manager/team-work';

type Counted = { status: TodayStatus; area: string };

const CHART_ORDER: TodayStatus[] = ['Done', 'In progress', 'Due soon', 'Overdue', 'Waiting', 'Not started'];

/**
 * "Name · status" (prototype `statusSegments` donut): the items by status word, with the
 * total in the middle and a legend. The head link opens the matching Work list.
 */
export function WorkStatusCard({
  title,
  items,
  href,
  hrefLabel = 'Open Work',
  loading,
}: {
  title: string;
  items: Counted[];
  href?: string;
  hrefLabel?: string;
  loading?: boolean;
}) {
  // The prototype's chart order: Done first.
  const counts = [...statusCounts(items)].sort((a, b) => CHART_ORDER.indexOf(a.status) - CHART_ORDER.indexOf(b.status));
  return (
    <DashSection title={title} href={href} hrefLabel={hrefLabel} loading={loading}>
      {items.length === 0 ? (
        <EmptyState title="No work items" />
      ) : (
        <div className="flex min-w-0 items-center gap-6">
          <DashDonut
            size={96}
            segments={counts.map((c) => ({ n: c.n, color: c.stroke }))}
            centerLabel={items.length}
            centerCaption=""
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {counts.map((c) => (
              <DashLegendRow key={c.status} swatchClassName={c.bar} label={c.status} count={c.n} />
            ))}
          </div>
        </div>
      )}
    </DashSection>
  );
}

/** "By area": one row per area with done, pending and overdue parts and "done / total". */
export function WorkAreaCard({ items, title = 'By area', loading }: { items: Counted[]; title?: string; loading?: boolean }) {
  const rows = areaSplit(items);
  const legend = (
    <ul className="mt-3 flex flex-wrap gap-3 text-[12px] text-ink-muted">
      {[
        ['bg-positive-mid', 'Done'],
        ['bg-brand', 'Pending'],
        ['bg-danger-mid', 'Overdue'],
      ].map(([cls, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <i className={`h-2 w-2 rounded-[2px] ${cls}`} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
  return (
    <DashSection title={title} loading={loading}>
      {rows.length === 0 ? (
        <EmptyState title="No work items" />
      ) : (
        <>
        <ul className="grid gap-3">
          {rows.map((r) => {
            const w = (n: number) => `${(n / r.total) * 100}%`;
            return (
              <li
                key={r.area}
                className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-3 text-[12.5px]"
                title={`${r.area}: ${r.done} done, ${r.pending} pending, ${r.late} overdue`}
              >
                <AreaPill area={r.area} />
                <span className="flex h-2.5 overflow-hidden rounded-bar bg-line-soft" aria-hidden>
                  {r.done > 0 ? <i className="block bg-positive-mid" style={{ width: w(r.done) }} /> : null}
                  {r.pending > 0 ? <i className="block bg-brand" style={{ width: w(r.pending) }} /> : null}
                  {r.late > 0 ? <i className="block bg-danger-mid" style={{ width: w(r.late) }} /> : null}
                </span>
                <span className="whitespace-nowrap text-right text-[12.5px] text-ink-muted tabular-nums">
                  {r.done} of {r.total} done
                </span>
              </li>
            );
          })}
        </ul>
        {legend}
        </>
      )}
    </DashSection>
  );
}
