'use client';

import Link from 'next/link';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ClientTile, DateTile } from '@/components/super/parts/super-parts';
import { stepWord, superOwnerOf, superStateChip } from '@/components/super/overview/super-overview-format';
import { usePracticeMetrics } from '@/components/metrics/use-metrics';
import {
  SUPER_PROJECTS_HREF,
  type SuperEngagementSummary,
  type SuperOverview,
} from '@/lib/super/super-overview';
import { cn } from '@/lib/utils';

/**
 * What needs a human, most urgent first. Every row drills to the engagement behind it.
 *
 * Row anatomy follows the prototype's attention list (R-20): the 44px date tile, the name with
 * "Step 17 <title> · <manager>, <holder> · 4d" under it, and the status chip on the right. The
 * date is the end of the manager-set window on the current step, else the earliest open filing;
 * a client with neither keeps its initials tile. An overdue or blocked row is tinted soft red
 * across the card and carries a navy Open button instead of being one big link.
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
  const practice = usePracticeMetrics().data;

  return (
    <DashSection title="Clients needing attention" href={SUPER_PROJECTS_HREF} hrefLabel="Clients" flush>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="None" />
        </div>
      ) : (
        <ul className="flex flex-col">
          {rows.map((summary) => (
            <AttentionRow
              key={summary.id}
              summary={summary}
              due={dueOf?.get(summary.id) ?? null}
              days={practice?.currentStep[summary.id]?.days ?? null}
            />
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

const HOLDER_WORD = { client: 'Client', sbc: 'SBC', manager: 'Manager' } as const;

/** "Step 17 <title> · <manager>, <holder> · 4d", dropping the parts nothing says. */
export function attentionSubLine(summary: SuperEngagementSummary, days: number | null = null): string {
  const step = summary.currentStep
    ? [stepWord(summary.currentStep.id), summary.currentStep.title].filter(Boolean).join(' ')
    : 'Every step is complete';
  const owner = superOwnerOf(summary);
  const people = [summary.managerName, owner ? HOLDER_WORD[owner] : null].filter(Boolean).join(', ');
  return [step, people, days !== null ? `${days}d` : null].filter(Boolean).join(' · ');
}

function AttentionRow({ summary, due, days }: { summary: SuperEngagementSummary; due: string | null; days: number | null }) {
  const chip = superStateChip(summary);
  const urgent = isUrgentAttention(summary);

  const body = (
    <>
      {due ? <DateTile ymd={due} tint="prog" /> : <ClientTile id={summary.id} name={summary.companyName} className="h-11 w-11 text-[13px]" />}
      <span className="min-w-0 flex-1">
        <b className="block min-w-0 truncate text-[13.5px] font-semibold text-ink">{summary.companyName}</b>
        <span className="block min-w-0 truncate text-[12.5px] text-ink-muted">{attentionSubLine(summary, days)}</span>
      </span>
      <span className="flex flex-none items-center gap-2">
        {/* On the tinted row the pill keeps its edge in dark, where the soft fills would merge. */}
        <Chip fixed tone={chip.tone} title={chip.title} className={urgent ? 'dark:bg-danger-mid/25' : undefined}>
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
    urgent ? 'bg-danger-soft' : 'transition-colors hover:bg-hover',
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
