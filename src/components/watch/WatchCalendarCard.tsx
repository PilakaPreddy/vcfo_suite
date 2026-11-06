'use client';

import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { useCalendarDecision } from '@/hooks/use-watch';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { formatSourceDate } from '@/lib/watch/source-status';
import type { CalendarProposalView } from '@/lib/watch/types';
import { ClientTag } from '@/views/compliances/identity';

const LOOK: Record<CalendarProposalView['status'], { label: string; tone: ChipTone }> = {
  preview: { label: 'Proposed on publish', tone: 'idle' },
  proposed: { label: 'Waiting for approval', tone: 'prog' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'idle' },
};

const day = (iso: string | null): string => (iso ? formatSourceDate(new Date(`${iso}T12:00:00+05:30`)) : 'Not given');

const plural = (count: number): string => `${count} client${count === 1 ? '' : 's'}`;

/** What a card says it moves. Once decided the count is what happened, not what was proposed. */
function moveLine({ status, total, clients }: CalendarProposalView): string {
  if (status === 'rejected') return `${plural(total)} left on the old date`;
  const line = status === 'approved' ? `Moved ${plural(total)}` : `Moves ${plural(total)}`;
  return clients.length < total ? `${line}, ${clients.length} of them yours` : line;
}

/** One due-date change. The calendar moves only when a manager approves this card. */
export function WatchCalendarCard({ proposal, canDecide }: { proposal: CalendarProposalView; canDecide: boolean }) {
  const decision = useCalendarDecision();
  const look = LOOK[proposal.status];
  const decide = (choice: 'approved' | 'rejected') => {
    if (!proposal.id) return;
    decision.mutate(
      { id: proposal.id, decision: choice },
      {
        onSuccess: ({ moved }) => toastSuccess(choice === 'approved' ? `Moved ${plural(moved)}` : 'Rejected', choice === 'approved' ? undefined : 'The calendar did not change.'),
        onError: (err) => toastError('Could not record that', err.message === 'already_decided' ? 'Someone else decided this first.' : err.message),
      },
    );
  };
  return (
    <div className="grid min-w-0 gap-2 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex-none">
          <Chip raw tone={look.tone} className="min-w-[132px]">
            {look.label}
          </Chip>
        </span>
        <span className="min-w-0 flex-1 basis-48 text-[14px] text-ink">
          {proposal.period.startsWith(proposal.obligationName) ? proposal.period : `${proposal.obligationName}, ${proposal.period}`}
        </span>
        {canDecide && proposal.status === 'proposed' ? (
          <span className="flex flex-none items-center gap-2">
            <Button variant="quiet" size="sm" disabled={decision.isPending} onClick={() => decide('rejected')}>
              Reject
            </Button>
            <Button size="sm" disabled={decision.isPending} onClick={() => decide('approved')}>
              Approve
            </Button>
          </span>
        ) : null}
      </div>
      <p className="text-[13px] tabular-nums text-ink-2">
        Due date from {day(proposal.oldDueDate)} to {day(proposal.newDueDate)}. {moveLine(proposal)}.
      </p>
      <p className="line-clamp-2 text-[12.5px] text-ink-muted">{proposal.updateTitle}</p>
      {proposal.clients.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {proposal.clients.map((client) => (
            <ClientTag key={client.engagementId} id={client.engagementId} name={client.companyName} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
