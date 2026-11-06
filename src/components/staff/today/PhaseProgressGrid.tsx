'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { ClientDot } from '@/components/staff/today/today-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import type { PhaseProgressRow } from '@/components/staff/today/today-rows';
import { cn } from '@/lib/utils';

/* The prototype's three phase columns; a registration phase, when the row has one, is left out as there. */
const PHASE_LABELS = ['Part A', 'Part B', 'Post-inc.'] as const;
type CellKind = 'done' | 'current' | 'stuck' | 'next';
const BAR: Record<CellKind, string> = {
  done: 'bg-positive-mid',
  current: 'bg-brand',
  stuck: 'bg-danger-mid',
  next: 'bg-ink-faint',
};
const LEGEND: { kind: CellKind; label: string }[] = [
  { kind: 'done', label: 'Done' },
  { kind: 'current', label: 'Current' },
  { kind: 'stuck', label: 'Stuck' },
  { kind: 'next', label: 'Next' },
];

function cellKind(r: PhaseProgressRow, i: number): CellKind {
  if (r.done[i]! >= r.totals[i]!) return 'done';
  const current = r.totals.findIndex((total, j) => r.done[j]! < total);
  if (i !== current) return 'next';
  return r.stuck ? 'stuck' : 'current';
}

/**
 * Phase progress (prototype PhaseProgress): one row per project with a 6px bar and a count per
 * phase, red when the project is stuck in that phase, and the days to the incorporation date the
 * manager set. Extra columns (manager) come from the caller.
 */
export function PhaseProgressGrid({
  rows,
  title = 'Phase progress',
  meta,
  href,
  hrefLabel,
  extraColumns = [],
  before,
  empty = 'No projects yet',
  pageSize = 8,
}: {
  rows: PhaseProgressRow[];
  title?: string;
  meta?: ReactNode;
  href?: string;
  hrefLabel?: string;
  extraColumns?: EFilingColumn<PhaseProgressRow>[];
  /** Content above the grid inside the card (for example the portfolio phase line). */
  before?: ReactNode;
  empty?: string;
  pageSize?: number;
}) {
  const router = useRouter();
  const columns: EFilingColumn<PhaseProgressRow>[] = [
    {
      key: 'client',
      header: 'Client',
      render: (r) => (
        <span className="inline-flex min-w-0 max-w-full items-center gap-2 font-medium text-ink" title={r.currentLabel}>
          <ClientDot name={r.companyName} />
          <span className="min-w-0 truncate">{shortCompany(r.companyName)}</span>
        </span>
      ),
    },
    ...PHASE_LABELS.map((label, i): EFilingColumn<PhaseProgressRow> => ({
      key: `p${i}`,
      header: label,
      width: '140px',
      render: (r) => {
        const kind = cellKind(r, i);
        const total = r.totals[i] ?? 0;
        const done = r.done[i] ?? 0;
        return (
          <span className="grid gap-1 text-left" title={`${label} · ${done} of ${total}${kind === 'stuck' ? ' · stuck' : ''}`}>
            <span className="block h-1.5 overflow-hidden rounded-bar bg-surface-sunken">
              <i className={cn('block h-full rounded-bar', BAR[kind])} style={{ width: `${total ? Math.min(100, (done / total) * 100) : 0}%` }} />
            </span>
            <span className={cn('text-[12px]', kind === 'done' ? 'text-positive' : kind === 'stuck' ? 'font-medium text-danger' : 'text-ink-2')}>
              {kind === 'done' ? '✓' : `${done}/${total}`}
            </span>
          </span>
        );
      },
    })),
    {
      key: 'coi',
      header: 'Days to COI',
      width: '100px',
      align: 'right',
      render: (r) =>
        r.daysToCoi === null ? null : (
          <span className={cn('font-medium tabular-nums', r.daysToCoi < 10 && 'text-danger')}>
            {r.daysToCoi < 0 ? `${-r.daysToCoi} days late` : `${r.daysToCoi} days`}
          </span>
        ),
    },
    ...extraColumns,
  ];

  return (
    <DashSection
      title={title}
      meta={meta ?? String(rows.length)}
      href={href}
      hrefLabel={hrefLabel}
      flush
    >
      {before ? <div className="px-2 pb-3 pt-2">{before}</div> : null}
      <EFilingGrid
        caption={title}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.engagementId}
        onRowClick={(r) => router.push(r.href)}
        pageSize={pageSize}
        minWidth={720}
        empty={empty}
        footer={
          <span className="hidden flex-wrap items-center gap-3 md:flex">
            {LEGEND.map((k) => (
              <span key={k.kind} className="flex items-center gap-1.5">
                <i className={cn('h-2 w-2 rounded-[2px]', BAR[k.kind])} aria-hidden />
                {k.label}
              </span>
            ))}
          </span>
        }
      />
    </DashSection>
  );
}
