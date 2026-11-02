'use client';

import { shortDate, noticeTime } from '@/lib/board-meetings/dates';
import { useMeetings } from '@/hooks/use-board-meetings';
import { DateTile, ListRow, SCard } from '../incorporation/spectrum';
import { GoLink } from '../compliances/spectrum';
import { meetingHref } from '../compliances/task-api';

/**
 * CLIENT HOME › BOARD MEETINGS — the next meeting (date tile, time, a link to it) and the last
 * one's minutes state. Only meetings whose notice was sent reach a client. Hidden when there
 * are none.
 */
export function MeetingsCard({ engagementId, today, className }: { engagementId: string | null | undefined; today: string; className?: string }) {
  const q = useMeetings(engagementId ?? null, Boolean(engagementId));
  const rows = (q.data ?? []).filter((m) => m.status !== 'cancelled');
  if (rows.length === 0) return null;
  const upcoming = rows.filter((m) => m.meetingDate >= today).sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  const past = rows.filter((m) => m.meetingDate < today).sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));
  const shown = [...upcoming.slice(0, 2), ...past.slice(0, 1)];
  return (
    <SCard title="Board meetings" meta={upcoming.length ? `${upcoming.length} upcoming` : undefined} flush className={className}>
      {shown.map((m) => (
        <ListRow key={m.id}>
          <DateTile iso={m.meetingDate} tint={m.meetingDate >= today ? 'prog' : 'idle'} />
          <GoLink href={meetingHref(m.id)} className="min-w-0 flex-1 hover:underline">
            <span className="block truncate font-medium">{m.meetingType === 'first' ? 'First board meeting' : m.meetingType === 'annual' ? 'Annual board meeting' : 'Board meeting'}</span>
            <span className="block truncate text-[12.5px] text-ink-muted">
              {m.meetingDate >= today
                ? `${shortDate(m.meetingDate)}, ${noticeTime(m.meetingTime)} IST`
                : m.momState === 'locked'
                  ? 'Signed minutes ready'
                  : 'Minutes being signed'}
            </span>
          </GoLink>
        </ListRow>
      ))}
    </SCard>
  );
}
