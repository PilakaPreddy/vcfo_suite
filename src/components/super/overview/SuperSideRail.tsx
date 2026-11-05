'use client';

import Link from 'next/link';
import { Activity, CalendarClock, Scale } from 'lucide-react';
import { DashDonut, DashLegendRow, DashSection } from '@/components/dash/DashSection';
import { CHART_STATUS, ChartLegend, DashBarChart, type ChartRow, type ChartSeries } from '@/components/charts';
import {
  FILING_BUCKET_COLOR,
  formatSuperAgo,
} from '@/components/super/overview/super-overview-format';
import { todayKey } from '@/components/super/parts/super-text';
import { plainDay } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import type { SuperOverview } from '@/lib/super/super-overview';

/**
 * The 318px rail, composed exactly like the lead dashboard's: a donut panel on
 * top, then the two dense reading panels. Same `DashSection` anatomy, same
 * donut, same legend rows — nothing bespoke.
 */
export function SuperSideRail({ overview }: { overview: SuperOverview }) {
  return (
    <div className="flex flex-col gap-3">
      <SuperBallInCourtPanel overview={overview} />
      <SuperRunwayPanel overview={overview} />
      <SuperActivityPanel overview={overview} />
    </div>
  );
}

/** Who owns the firm's open work right now — three slices, nothing more. */
function SuperBallInCourtPanel({ overview }: { overview: SuperOverview }) {
  const { firm, client, done } = overview.charts.ballInCourt;
  const open = firm + client;

  return (
    <DashSection icon={Scale} tone="primary" title="Ball in court" meta={`${open} open`}>
      {open === 0 && done === 0 ? (
        <p className="py-3 text-center text-[13px] text-ink-muted">No checklist work yet</p>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <DashDonut
            segments={[
              { n: firm, color: CHART_STATUS.active },
              { n: client, color: CHART_STATUS.waiting },
              { n: done, color: CHART_STATUS.done },
            ]}
            centerLabel={open}
            centerCaption="open"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <DashLegendRow swatchClassName="bg-brand" label="With SBC" count={firm} />
            <DashLegendRow swatchClassName="bg-waiting-mid" label="With the client" count={client} />
            <DashLegendRow swatchClassName="bg-positive-mid" label="Done" count={done} />
          </div>
        </div>
      )}
    </DashSection>
  );
}

/** The next 90 days of statutory work, bucketed by how soon it bites. */
function SuperRunwayPanel({ overview }: { overview: SuperOverview }) {
  const buckets = overview.charts.filings;
  const data: ChartRow[] = buckets.map((bucket) => ({
    bucket: bucket.label,
    count: bucket.count,
  }));
  const series: ChartSeries[] = [
    { key: 'count', label: 'Filings', color: CHART_STATUS.active },
  ];
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  const next = overview.filings
    .filter((filing) => filing.status !== 'filed')
    .slice(0, 3);

  return (
    <DashSection
      icon={CalendarClock}
      tone="cyan"
      title="Compliance runway"
      meta={total === 0 ? undefined : `${total} in 90 days`}
    >
      <DashBarChart
        data={data}
        categoryKey="bucket"
        series={series}
        layout="rows"
        categoryWidth={78}
        hideValueAxis
        height={132}
        emptyLabel="No filings scheduled."
      />
      <ChartLegend
        className="mt-1.5"
        items={buckets
          .filter((bucket) => bucket.count > 0)
          .map((bucket) => ({
            label: bucket.label,
            count: bucket.count,
            color: FILING_BUCKET_COLOR[bucket.bucket] ?? CHART_STATUS.active,
          }))}
      />

      {next.map((filing) => {
        const late = filing.dueDate < todayKey();
        return (
          <Link key={filing.id} href={filing.href} className="mt-2.5 flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'grid h-11 w-11 shrink-0 place-items-center rounded-md text-center leading-none',
                late ? 'bg-danger-soft text-danger' : 'bg-surface-sunken text-ink',
              )}
            >
              <span>
                <b className="block text-[15px] font-medium tabular-nums">{Number(filing.dueDate.slice(8, 10))}</b>
                <span className="block text-[10.5px]">{plainDay(filing.dueDate).split(' ')[1]}</span>
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{filing.title}</span>
              <span className="block truncate text-[12px] text-ink-muted">
                {filing.companyName} · {plainDay(filing.dueDate)}
              </span>
            </span>
          </Link>
        );
      })}
    </DashSection>
  );
}

/** Firm-wide audit trail, newest first. Read-only, like everything here. */
function SuperActivityPanel({ overview }: { overview: SuperOverview }) {
  const entries = overview.activity.slice(0, 8);

  return (
    <DashSection
      icon={Activity}
      tone="violet"
      title="Live activity"
      href="/app/admin/audit-log"
      hrefLabel="Full log"
    >
      {entries.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-ink-muted">No activity yet</p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((entry) => {
            const body = (
              <>
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">
                  {entry.label}
                </p>
                <p className="mt-0.5 min-w-0 truncate text-[11px] text-ink-muted">
                  {[entry.companyName, entry.actor].filter(Boolean).join(' · ')}
                  <span className="ml-1.5 text-[10.5px] text-ink-faint">
                    {formatSuperAgo(entry.at)}
                  </span>
                </p>
              </>
            );
            return (
              <li key={entry.id} className="border-t border-line py-2 first:border-t-0 first:pt-0.5">
                {entry.href ? (
                  <Link href={entry.href} className="block min-w-0">
                    {body}
                  </Link>
                ) : (
                  <div className="min-w-0">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashSection>
  );
}
