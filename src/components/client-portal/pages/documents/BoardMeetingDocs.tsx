'use client';

import { Download, Lock } from 'lucide-react';
import { shortDate } from '@/lib/board-meetings/dates';
import { useMeeting, useMeetings, type MeetingListRow } from '@/hooks/use-board-meetings';
import { GoLink, SCard } from '../compliances/spectrum';
import { meetingHref } from '../compliances/task-api';

/**
 * DOCUMENTS › BOARD MEETINGS — the signed minutes and the signed resolutions of each meeting,
 * newest first. Only locked (signed) documents reach a client. Hidden when there are none.
 */
export function BoardMeetingDocs({ engagementId }: { engagementId: string | null | undefined }) {
  const q = useMeetings(engagementId ?? null, Boolean(engagementId));
  const rows = (q.data ?? []).filter((m) => m.momState === 'locked' || m.resolutions.locked > 0);
  if (rows.length === 0) return null;
  return (
    <div className="cp-tw mt-5 min-w-0">
      <SCard title="Board meetings" meta={`${rows.length} meeting${rows.length === 1 ? '' : 's'}`} flush>
        {rows.map((m) => (
          <MeetingFiles key={m.id} row={m} />
        ))}
      </SCard>
    </div>
  );
}

function MeetingFiles({ row }: { row: MeetingListRow }) {
  const q = useMeeting(row.id);
  const docs = (q.data?.documents ?? []).filter((d) => d.status === 'locked' && d.hasSigned);
  return (
    <div className="border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5">
      <GoLink href={meetingHref(row.id)} className="text-[14px] font-medium text-ink hover:underline">
        {row.meetingNo} · {shortDate(row.meetingDate)}
      </GoLink>
      <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
        {docs.map((d) => (
          <li key={d.id}>
            <a href={`/api/board-meetings/documents/${d.id}/file?which=signed`} className="inline-flex items-center gap-2 text-[13.5px] text-brand-text hover:underline">
              <Lock className="h-3.5 w-3.5 text-positive" aria-hidden />
              {d.kind === 'mom' ? 'Minutes of meeting (signed)' : `Resolution: ${d.title}`}
              <Download className="h-3.5 w-3.5" aria-hidden />
            </a>
          </li>
        ))}
        {q.isPending ? <li className="text-[13px] text-ink-muted">Loading…</li> : null}
      </ul>
    </div>
  );
}
