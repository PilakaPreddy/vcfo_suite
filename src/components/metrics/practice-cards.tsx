'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { EmptyState } from '@/components/ui/empty-state';
import { PhaseBar } from '@/components/ui/step-track';
import { ClientTile, StackedBar, ToneBar } from '@/components/super/parts/super-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { plainDay } from '@/lib/date-format';
import type { ExpectedCoiRow, PracticeMetrics, StageRow } from '@/lib/metrics/practice-metrics';
import { cn } from '@/lib/utils';

/**
 * Practice cards (G-13, G-29), built only from `/api/metrics/practice`:
 *   - `AdminPracticeCards` — the admin Today row: Incorporation (clients per stage, average days
 *     to COI, the longest wait on one step), Registrations (done, in progress against pending)
 *     and this month's Compliances.
 *   - `StageDaysCard`, `ExpectedCoiCard` — the super admin Practice · Incorporation cards.
 * No target figures: the firm has not set stage targets, so none is printed.
 */

function CardFoot({ children, href, label }: { children: ReactNode; href: string; label: string }) {
  return (
    <div className="-mx-4 -mb-4 mt-auto flex items-center gap-2 border-t border-line-soft px-4 py-3 text-[12.5px] text-ink-muted">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Link href={href} className="whitespace-nowrap font-medium text-brand-text hover:underline">
        {label}
      </Link>
    </div>
  );
}

function days(n: number | null | undefined): string {
  return n === null || n === undefined ? '–' : `${n} ${n === 1 ? 'day' : 'days'}`;
}

export function AdminPracticeCards({
  practice,
  loading,
  base,
}: {
  practice: PracticeMetrics | undefined;
  loading: boolean;
  /** Staff base path, for example `/app/admin`. */
  base: string;
}) {
  const inc = practice?.incorporation;
  const reg = practice?.registrations;
  const comp = practice?.compliances;
  const maxStage = Math.max(1, ...(inc?.stages ?? []).map((s) => s.clients));
  const card = 'flex flex-col';
  const body = 'flex flex-1 flex-col gap-4 p-4';

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:items-stretch">
      <DashSection title="Incorporation" meta={inc ? String(inc.clients) : undefined} loading={loading} className={card} bodyClassName={body}>
        {inc && inc.clients > 0 ? (
          <ul className="grid gap-2.5">
            {inc.stages.map((stage) => (
              <li key={stage.phaseId} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_28px] items-center gap-3 text-[12.5px]">
                <span className="truncate font-medium">{stage.label}</span>
                <ToneBar pct={(stage.clients / maxStage) * 100} />
                <b className="text-right font-medium tabular-nums">{stage.clients}</b>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No client is in incorporation" />
        )}
        <CardFoot href={`${base}/projects`} label="Open clients">
          {inc?.avgDaysToCoi !== null && inc?.avgDaysToCoi !== undefined ? (
            <>
              Average <b className="font-medium text-ink">{days(inc.avgDaysToCoi)}</b> to COI
            </>
          ) : inc?.longestInStep ? (
            <>
              Longest in one step: <b className="font-medium text-ink">{shortCompany(inc.longestInStep.companyName)}</b>, {days(inc.longestInStep.days)}
            </>
          ) : (
            'No certificate this year'
          )}
        </CardFoot>
      </DashSection>

      <DashSection title="Registrations" loading={loading} className={card} bodyClassName={body}>
        <div className="flex flex-wrap gap-6">
          {[
            { n: reg?.done ?? 0, label: 'Done', cls: 'text-positive' },
            { n: reg?.inProgress ?? 0, label: 'In progress', cls: 'text-brand-text' },
            { n: reg?.pending ?? 0, label: 'Pending', cls: 'text-warning' },
          ].map((x) => (
            <div key={x.label}>
              <b className={cn('block text-[24px] font-medium leading-tight tabular-nums', x.cls)}>{x.n}</b>
              <span className="text-[12px] text-ink-muted">{x.label}</span>
            </div>
          ))}
        </div>
        {reg && reg.byType.length > 0 ? (
          <ul className="-mt-1 grid gap-2">
            {[...reg.byType]
              .sort((a, b) => b.inProgress + b.pending - (a.inProgress + a.pending))
              .slice(0, 3)
              .map((t) => (
                <li
                  key={t.id}
                  className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_28px] items-center gap-3 text-[12.5px]"
                  title={`${t.title}: ${t.done} done, ${t.inProgress} in progress, ${t.pending} pending`}
                >
                  <span className="truncate font-medium">{t.title}</span>
                  <StackedBar
                    height={8}
                    legend={false}
                    segments={[
                      { label: 'Done', value: t.done, tone: 'ok' },
                      { label: 'In progress', value: t.inProgress, tone: 'prog' },
                      { label: 'Pending', value: t.pending, tone: 'warn' },
                    ]}
                  />
                  <b className="text-right font-medium tabular-nums">{t.inProgress + t.pending}</b>
                </li>
              ))}
          </ul>
        ) : null}
        <CardFoot href={`${base}/registrations`} label="Open registrations">
          {reg?.mostPending ? (
            <>
              Most pending: <b className="font-medium text-ink">{reg.mostPending}</b>
            </>
          ) : (
            'Nothing waiting on a client'
          )}
        </CardFoot>
      </DashSection>

      <DashSection
        title={comp ? `Compliances · ${comp.monthLabel}` : 'Compliances'}
        loading={loading}
        className={card}
        bodyClassName={body}
      >
        {comp && comp.total > 0 ? (
          <div>
            <p className="flex items-baseline gap-1.5">
              <b className="text-[24px] font-medium leading-tight tabular-nums">{comp.total}</b>
              <span className="text-[12.5px] text-ink-muted">filings</span>
            </p>
            <StackedBar
              className="mt-2"
              height={8}
              legend={false}
              segments={[
                { label: 'Overdue', value: comp.overdue, tone: 'bad' },
                { label: 'Filed late', value: comp.late, tone: 'warn' },
                { label: 'Due this week', value: comp.dueThisWeek, tone: 'prog' },
                { label: 'Upcoming', value: comp.upcoming, tone: 'idle' },
                { label: 'Filed on time', value: comp.onTime, tone: 'ok' },
              ]}
            />
            <ul className="mt-2.5 grid gap-1">
              {(
                [
                  ['Overdue', comp.overdue, 'bg-danger-mid'],
                  ['Filed late', comp.late, 'bg-warning-mid'],
                  ['Due this week', comp.dueThisWeek, 'bg-brand'],
                  ['Upcoming', comp.upcoming, 'bg-upcoming-mid'],
                  ['Filed on time', comp.onTime, 'bg-positive-mid'],
                ] as const
              ).map(([label, value, fill]) => (
                <li key={label} className="flex items-center gap-2 text-[12.5px]">
                  <i className={cn('h-2 w-2 flex-none rounded-[2px]', fill)} aria-hidden />
                  <span className="flex-1 font-medium">{label}</span>
                  <b className="font-medium tabular-nums">{value}</b>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState title="No filing due this month" />
        )}
        <CardFoot href={`${base}/compliances/calendar`} label="Open calendar">
          {comp?.worstAuthority ? (
            <>
              Worst statute: <b className="font-medium text-ink">{comp.worstAuthority}</b>
            </>
          ) : (
            'Nothing late this month'
          )}
        </CardFoot>
      </DashSection>
    </div>
  );
}

/** Days in each stage over the last 12 months, and the slowest open stage now. */
export function StageDaysCard({ rows, loading }: { rows: StageRow[]; loading?: boolean }) {
  const columns: EFilingColumn<StageRow>[] = [
    { key: 'stage', header: 'Stage', render: (r) => <span className="font-medium">{r.label}</span> },
    {
      key: 'avg',
      header: 'Average',
      width: '92px',
      align: 'right',
      render: (r) => <span className="tabular-nums">{days(r.avgDays)}</span>,
    },
    { key: 'finished', header: 'Finished', width: '84px', align: 'right', render: (r) => <span className="tabular-nums">{r.finished}</span> },
    {
      key: 'slowest',
      header: 'Slowest now',
      render: (r) =>
        r.slowest ? (
          <span className="whitespace-nowrap">
            {shortCompany(r.slowestCompany ?? 'A client')}, {days(r.slowest.days)}
          </span>
        ) : (
          <span className="text-ink-faint">None open</span>
        ),
    },
  ];
  return (
    <DashSection title="Days in each stage" meta="Last 12 months" loading={loading} flush>
      <EFilingGrid caption="Days in each stage" columns={columns} rows={rows} rowKey={(r) => r.phaseId} empty="No stage has started yet" minWidth={460} />
    </DashSection>
  );
}

/** Clients with an expected certificate date, soonest first. */
export function ExpectedCoiCard({
  rows,
  loading,
  hrefFor,
}: {
  rows: ExpectedCoiRow[];
  loading?: boolean;
  hrefFor: (row: ExpectedCoiRow) => string;
}) {
  return (
    <DashSection title="Expected certificates" meta={rows.length ? String(rows.length) : undefined} loading={loading} bodyClassName="p-0">
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No expected date set" />
        </div>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.engagementId} className="border-t border-line-soft first:border-t-0">
              <Link href={hrefFor(row)} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-surface-sunken/60">
                <ClientTile id={row.engagementId} name={row.companyName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{shortCompany(row.companyName)}</span>
                  <span className="line-clamp-2 text-[12px] text-ink-muted">
                    {[row.currentStepTitle, row.managerName].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <PhaseBar
                  done={row.phases.map((p) => p.done)}
                  totals={row.phases.map((p) => p.total)}
                  names={row.phases.map((p) => p.label)}
                  className="hidden w-24 flex-none sm:flex"
                />
                <b className="w-14 flex-none text-right text-[13px] font-medium tabular-nums">{plainDay(row.expectedOn)}</b>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}
