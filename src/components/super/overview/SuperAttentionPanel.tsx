'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ClientTile, DateTile } from '@/components/super/parts/super-parts';
import { superStateChip } from '@/components/super/overview/super-overview-format';
import {
  SUPER_PROJECTS_HREF,
  type SuperEngagementSummary,
  type SuperOverview,
} from '@/lib/super/super-overview';
import { cn } from '@/lib/utils';

/**
 * What needs a human, most urgent first. Every row drills to the engagement behind it.
 *
 * Row anatomy follows the prototype's attention list (R-20): the 44px date tile tinted by
 * urgency, the name with "<step> · <manager>, <lead>" under it, and the status chip on the
 * right. The date is the end of the manager-set window on the current step, else the
 * earliest open filing; a client with neither keeps its initials tile. An overdue or blocked
 * row is tinted soft red and carries a navy Open button instead of being one big link.
 */
export function SuperAttentionPanel({
  overview,
  dueOf,
}: {
  overview: SuperOverview;
  /** Next date per engagement id (YYYY-MM-DD), from the insights read when it has landed. */
  dueOf?: Map<string, string>;
}) {
  const rows = overview.needsAttention;

  return (
    <DashSection
      icon={AlertTriangle}
      tone="danger"
      title="Clients needing attention"
      meta={`${overview.kpis.needsAttention} of ${overview.kpis.engagements}`}
      href={SUPER_PROJECTS_HREF}
      hrefLabel="Clients"
      bodyClassName={rows.length === 0 ? 'p-4' : 'p-0'}
    >
      {rows.length === 0 ? (
        <EmptyState title="None" />
      ) : (
        <ul className="flex flex-col">
          {rows.map((summary) => (
            <AttentionRow key={summary.id} summary={summary} due={dueOf?.get(summary.id) ?? null} />
          ))}
        </ul>
      )}
    </DashSection>
  );
}

/** Overdue and blocked rows are the urgent ones (prototype: Overdue and Stuck). */
function isUrgentAttention(summary: SuperEngagementSummary): boolean {
  return summary.stateKey === 'overdue' || summary.stuckReason === 'blocked';
}

/** "<step> · <manager>, <lead>", dropping the parts nobody holds. */
function attentionSubLine(summary: SuperEngagementSummary): string {
  const step = summary.currentStep?.title ?? 'Every step is complete';
  const people = [summary.managerName, summary.leadName].filter(Boolean).join(', ');
  return people ? `${step} · ${people}` : step;
}

function AttentionRow({ summary, due }: { summary: SuperEngagementSummary; due: string | null }) {
  const chip = superStateChip(summary);
  const urgent = isUrgentAttention(summary);

  const body = (
    <>
      {due ? <DateTile ymd={due} /> : <ClientTile id={summary.id} name={summary.companyName} className="h-11 w-11 text-[13px]" />}
      <span className="min-w-0 flex-1">
        <b className="block min-w-0 truncate text-[13.5px] font-semibold text-ink">{summary.companyName}</b>
        <span className="block min-w-0 truncate text-[12.5px] text-ink-muted">{attentionSubLine(summary)}</span>
      </span>
      <span className="flex flex-none items-center gap-2">
        <Chip fixed tone={chip.tone} title={chip.title}>
          {chip.word}
        </Chip>
        {urgent ? (
          <Button asChild variant="strong" size="sm">
            <Link href={summary.href}>Open</Link>
          </Button>
        ) : null}
      </span>
    </>
  );
  const cls = cn(
    'flex min-w-0 items-center gap-3 px-4 py-3 md:px-5',
    urgent ? 'bg-danger-soft' : 'hover:bg-surface-sunken',
  );

  return (
    <li className="border-t border-line-soft first:border-t-0" title={summary.companyName}>
      {urgent ? (
        <div className={cls}>{body}</div>
      ) : (
        <Link href={summary.href} className={cls}>
          {body}
        </Link>
      )}
    </li>
  );
}
