'use client';

import Link from 'next/link';
import { DashSection } from '@/components/dash/DashSection';
import { Chip } from '@/components/ui/spectrum-chip';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { shortDate } from '@/lib/board-meetings/dates';
import { useMeetingStats } from '@/hooks/use-board-meetings';
import { meetingsBase } from './view-model';

/**
 * HOME › "Board meetings" for admin and manager: five counts (next 30 days, notices waiting for
 * approval, quorum at risk, MoM overdue, 120-day limit soon) and the meetings that need a look.
 * "View all" opens Obligations › Non-statutory › Meetings.
 */
export function BoardMeetingsCard() {
  const { user } = useApp();
  const q = useMeetingStats();
  const base = meetingsBase(user?.role);
  const s = q.data;
  const tiles: Array<{ label: string; n: number; bad?: boolean }> = s
    ? [
        { label: 'Next 30 days', n: s.in30 },
        { label: 'Waiting approval', n: s.waiting },
        { label: 'Quorum at risk', n: s.quorumAtRisk, bad: true },
        { label: 'MoM overdue', n: s.momOverdue, bad: true },
        { label: '120-day limit soon', n: s.limitSoon, bad: true },
      ]
    : [];
  return (
    <DashSection title="Board meetings" href={`${base}/obligations?cat=ns&type=meeting`} hrefLabel="View all" loading={q.isPending}>
      {s ? (
        <div className="flex flex-col gap-3">
          <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-2">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-md bg-surface-sunken px-3 py-2">
                <dt className="text-[12px] text-ink-muted">{t.label}</dt>
                <dd className={cn('m-0 text-[20px] font-medium tabular-nums', t.bad && t.n > 0 ? 'text-danger' : 'text-ink')}>{t.n}</dd>
              </div>
            ))}
          </dl>
          {s.attention.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {s.attention.map((m) => (
                <li key={m.id} className="border-t border-line-soft first:border-t-0">
                  <Link href={`${base}/obligations/meetings/${m.id}`} className="flex items-center justify-between gap-2 py-2 text-[13.5px] hover:underline">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{m.companyName}</span>
                      <span className="text-ink-muted"> · {shortDate(m.meetingDate)}</span>
                    </span>
                    {m.status === 'pending_approval' ? (
                      <Chip tone="teal" fixed>
                        Approve
                      </Chip>
                    ) : m.quorum && m.quorum.state !== 'ok' ? (
                      <Chip tone="warn" fixed>
                        Quorum
                      </Chip>
                    ) : (
                      <Chip tone="bad" fixed>
                        Overdue
                      </Chip>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-ink-muted">Nothing needs a look.</p>
          )}
        </div>
      ) : null}
    </DashSection>
  );
}
