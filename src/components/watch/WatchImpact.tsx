'use client';

import type { RegUpdateDetail, WatchImpact as Impact } from '@/lib/watch/types';
import { ClientTile } from '@/views/compliances/identity';
import { WatchCalendarCard } from './WatchCalendarCard';

function headline(impact: Impact): string {
  if (impact.basis === 'none') return 'Client data cannot say who this touches, so no list is shown.';
  if (impact.total === 0) return 'No client on the books is touched.';
  const mine = impact.clients.length;
  return mine === impact.total ? `Touches ${impact.total} client${impact.total === 1 ? '' : 's'}.` : `Touches ${impact.total} clients, ${mine} of them yours.`;
}

/** Who the update touches and what it would move, worked out by code from client data. */
export function WatchImpactPanel({ update, canDecide }: { update: RegUpdateDetail; canDecide: boolean }) {
  const { impact } = update;
  return (
    <section className="grid min-w-0 gap-2 rounded-md border border-line p-3" aria-label="Clients this touches">
      <h3 className="text-[13px] font-medium text-ink-2">Clients this touches</h3>
      <p className="text-[13px] text-ink-muted">{headline(impact)}</p>
      {impact.clients.length > 0 ? (
        <ul className="grid max-h-44 gap-1.5 overflow-auto">
          {impact.clients.map((client) => (
            <li key={client.engagementId} className="flex min-w-0 items-center gap-2 text-[13px]">
              <ClientTile id={client.engagementId} name={client.companyName} />
              <span className="min-w-0 flex-1 truncate text-ink">{client.companyName}</span>
              <span className="min-w-0 truncate text-[12.5px] text-ink-muted">{client.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {impact.proposals.length > 0 ? (
        <div className="-mx-3 -mb-3 mt-1 divide-y divide-line-soft border-t border-line-soft">
          {impact.proposals.map((proposal) => (
            <WatchCalendarCard key={`${proposal.obligationName}:${proposal.period}`} proposal={proposal} canDecide={canDecide} />
          ))}
        </div>
      ) : update.changeType === 'due_date' ? (
        <p className="text-[13px] text-ink-muted">Nothing on the calendar will change: no open filing matches. Name the form and period in the summary, or check the old due date, then save.</p>
      ) : null}
    </section>
  );
}
