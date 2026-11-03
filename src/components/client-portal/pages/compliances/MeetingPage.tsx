'use client';

/**
 * Compliances · one board meeting, client view (docs/specs/board-meetings/PLAN.md). Read only:
 * the date, time, mode and Teams link, Add to calendar, the agenda as sent, who said they will
 * attend, and the signed MoM and resolutions once locked. Data: GET /api/board-meetings/:id,
 * which answers 404 to a client until the notice is sent and hides staff-only fields.
 */
import { CalendarPlus, Download, Lock, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/empty-state';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { MODE_LABEL } from '@/lib/board-meetings/model';
import { noticeTime, shortDate } from '@/lib/board-meetings/dates';
import { googleCalendarLink, outlookCalendarLink } from '@/lib/board-meetings/calendar';
import { MeetingApiError, useMeeting, type MeetingDto } from '@/hooks/use-board-meetings';
import { meetingEventOf } from '@/views/board-meetings/view-model';
import { usePortalCrumbs } from '../../PortalProvider';
import { Empty, GoLink, Island, SCard } from './spectrum';
import { OBLIGATIONS_BASE } from './ObligationsPage';
import '../../css/compliances-board.css';

export function CompliancesMeeting({ id }: { id: string }) {
  const q = useMeeting(id);
  usePortalCrumbs(['Compliances', 'Obligations', q.data ? `${q.data.kindLabel} · ${shortDate(q.data.meetingDate)}` : 'Meeting']);
  const back = (
    <GoLink href={OBLIGATIONS_BASE} className="text-[13px] font-medium text-brand-text hover:underline">
      All obligations
    </GoLink>
  );
  const missing = q.error instanceof MeetingApiError && (q.error.status === 404 || q.error.status === 403);

  let body: React.ReactNode;
  if (q.isLoading)
    body = (
      <div aria-busy="true" aria-label="Loading the meeting">
        <SkeletonRows rows={6} />
      </div>
    );
  else if (missing)
    body = (
      <SCard title="Board meeting">
        <Empty action={back}>This meeting is not shared with you yet</Empty>
      </SCard>
    );
  else if (q.isError || !q.data)
    body = (
      <SCard title="Board meeting">
        <Empty
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        >
          Could not load the meeting
        </Empty>
      </SCard>
    );
  else body = <MeetingRecord m={q.data} back={back} />;

  return (
    <div className="cp-compliances">
      <div className="cp-comp-root page">
        <Island className="grid gap-5">{body}</Island>
      </div>
    </div>
  );
}

function MeetingRecord({ m, back }: { m: MeetingDto; back: React.ReactNode }) {
  const ev = meetingEventOf(m);
  const rescheduling = m.status === 'pending_approval' || m.status === 'approved' || m.status === 'draft';
  const yes = m.replies.filter((r) => r.reply === 'yes').length;
  const signed = m.documents.filter((d) => d.status === 'locked' && d.hasSigned);
  return (
    <>
      <section aria-label="Meeting" className="flex flex-col gap-3 rounded-md border-1.5 border-line bg-surface-raised px-4 py-4 md:px-5">
        <div>{back}</div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-medium leading-8 text-ink">
              {m.kind === 'board' ? m.typeLabel : m.kindLabel}
            </h1>
            <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
              <span>
                {shortDate(m.meetingDate)}, {noticeTime(m.meetingTime)} IST
              </span>
              <span className="text-ink-muted">·</span>
              <span>{MODE_LABEL[m.mode]}</span>
              {m.mode !== 'vc' && m.venue ? <span className="text-ink-muted">· {m.venue}</span> : null}
              <span className="font-mono text-[12.5px] text-ink-muted">{m.meetingNo}</span>
            </p>
          </div>
          {m.status === 'cancelled' ? (
            <Chip tone="idle" fixed raw>
              Cancelled
            </Chip>
          ) : m.status === 'held' ? (
            <Chip tone={signed.some((d) => d.kind === 'mom') ? 'ok' : 'prog'} fixed raw>
              {signed.some((d) => d.kind === 'mom') ? 'Done' : 'Held'}
            </Chip>
          ) : rescheduling ? (
            <Chip tone="warn" fixed raw>
              Being rescheduled
            </Chip>
          ) : (
            <Chip tone="teal" fixed raw>
              Upcoming
            </Chip>
          )}
        </div>
        {m.status === 'cancelled' ? (
          <p className="m-0 text-[13.5px] text-danger">The meeting was cancelled{m.cancelReason ? `: ${m.cancelReason}` : '.'}</p>
        ) : rescheduling ? (
          <p className="m-0 text-[13.5px] text-warning">A new date is being agreed. The directors get a fresh notice by email.</p>
        ) : m.status === 'sent' ? (
          <div className="flex flex-wrap gap-2">
            {m.teamsLink ? (
              <Button size="sm" asChild>
                <a href={m.teamsLink} target="_blank" rel="noreferrer">
                  <Video className="h-4 w-4" aria-hidden /> Join Teams meeting
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" asChild>
              <a href={`/api/board-meetings/${m.id}/ics`}>
                <CalendarPlus className="h-4 w-4" aria-hidden /> Add to calendar
              </a>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={googleCalendarLink(ev)} target="_blank" rel="noreferrer">
                Google
              </a>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={outlookCalendarLink(ev)} target="_blank" rel="noreferrer">
                Outlook
              </a>
            </Button>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SCard
          title="Agenda"
          meta={`${m.notice.agenda.length} items`}
          right={
            <Button size="sm" variant="secondary" asChild>
              <a href={`/api/board-meetings/${m.id}/notice`}>
                <Download className="h-4 w-4" aria-hidden /> Notice (Word)
              </a>
            </Button>
          }
        >
          <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
            {m.notice.agenda.map((a) => (
              <li key={a.n} className="flex flex-col gap-1">
                <span>
                  <span className="mr-2 tabular-nums text-ink-muted">{a.n}.</span>
                  {a.text}
                </span>
                {a.subs.map((s) => (
                  <span key={s.n} className="pl-7 text-ink-2">
                    {s.n} {s.text}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </SCard>

        <div className="grid gap-5">
          <SCard title="Directors" meta={m.replies.length ? `${yes} of ${m.replies.length} attending` : undefined} flush>
            <ul className="m-0 list-none p-0">
              {m.replies.map((r) => (
                <li key={r.directorId} className="flex items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5 text-[14px] first:border-t-0 md:px-5">
                  <span className="min-w-0 truncate">{r.name}</span>
                  {r.reply === 'yes' ? <Tag tone="ok">Attending</Tag> : r.reply === 'no' ? <Tag tone="bad">Not attending</Tag> : <Tag>No reply</Tag>}
                </li>
              ))}
            </ul>
          </SCard>
          <SCard title="Signed documents" meta={signed.length || undefined} flush>
            {signed.length ? (
              <ul className="m-0 list-none p-0">
                {signed.map((d) => (
                  <li key={d.id} className="border-t border-line-soft first:border-t-0">
                    <a href={`/api/board-meetings/documents/${d.id}/file?which=signed`} className="flex items-center gap-2 px-4 py-2.5 text-[14px] hover:bg-hover md:px-5">
                      <Lock className="h-4 w-4 flex-none text-positive" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{d.kind === 'mom' ? 'Minutes of meeting (signed)' : d.title}</span>
                      <Download className="h-4 w-4 text-ink-muted" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 px-4 py-3 text-[13px] text-ink-muted md:px-5">The signed minutes appear here after the meeting.</p>
            )}
          </SCard>
        </div>
      </div>
    </>
  );
}
