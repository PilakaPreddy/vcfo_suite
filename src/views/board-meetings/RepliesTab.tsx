'use client';

import { useState } from 'react';
import { BellRing, CalendarPlus, CalendarX2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/ui/spectrum-chip';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { googleCalendarLink, outlookCalendarLink } from '@/lib/board-meetings/calendar';
import { shortDate } from '@/lib/board-meetings/dates';
import { useMeetingActions, type MeetingDto } from '@/hooks/use-board-meetings';
import { Banner, Card, Field } from './parts';
import { meetingEventOf, stamp } from './view-model';

/**
 * REPLIES TAB — who said they will attend, the quorum forecast, a reminder to the directors who
 * have not answered, "Add to calendar", and the Reschedule and Cancel panels. Reschedule sends
 * the notice back for approval with the new date; the same calendar event moves.
 */
export function RepliesTab({ meeting }: { meeting: MeetingDto }) {
  const actions = useMeetingActions(meeting.id);
  const [panel, setPanel] = useState<'none' | 'reschedule' | 'cancel'>('none');
  const [date, setDate] = useState(meeting.meetingDate);
  const [time, setTime] = useState(meeting.meetingTime);
  const [reason, setReason] = useState('');
  const sent = meeting.status === 'sent' || meeting.status === 'held' || meeting.status === 'approved';
  const q = meeting.quorum;
  const ev = meetingEventOf(meeting);
  const open = meeting.replies.filter((r) => r.reply === null).length;

  const remind = () =>
    actions.remind.mutate(undefined, {
      onSuccess: (r) => toastSaved(r.sent ? `Reminder sent to ${r.sent} director${r.sent === 1 ? '' : 's'}` : 'Everyone has replied'),
      onError: (e) => toastError('Could not send the reminder', errorMessage(e)),
    });
  const reschedule = () =>
    actions.reschedule.mutate(
      { meetingDate: date, meetingTime: time, reason: reason.trim() },
      {
        onSuccess: () => {
          setPanel('none');
          setReason('');
          toastSaved('Sent to the manager', { sub: 'The new date goes out once approved' });
        },
        onError: (e) => toastError('Could not reschedule', errorMessage(e)),
      },
    );
  const cancel = () =>
    actions.cancel.mutate(reason.trim(), {
      onSuccess: () => {
        setPanel('none');
        toastSaved('Meeting cancelled', { sub: meeting.sentAt ? 'The directors got a cancellation' : undefined });
      },
      onError: (e) => toastError('Could not cancel', errorMessage(e)),
    });

  return (
    <div className="grid grid-cols-1 gap-5">
      {meeting.status === 'cancelled' ? (
        <Banner tone="bad">
          Cancelled {stamp(meeting.cancelledAt)}. {meeting.cancelReason}
        </Banner>
      ) : !sent ? (
        <Banner tone="info">Replies open once the notice is sent. Each director gets a Yes / No link in the email.</Banner>
      ) : q.state === 'ok' ? (
        <Banner tone="ok">
          Quorum met: {q.attending} of {q.needed} needed have said yes.
        </Banner>
      ) : q.state === 'at_risk' ? (
        <Banner
          tone="warn"
          action={
            meeting.can.remind && open ? (
              <Button size="sm" variant="secondary" onClick={remind} disabled={actions.remind.isPending}>
                <BellRing className="h-4 w-4" aria-hidden /> Remind {open}
              </Button>
            ) : null
          }
        >
          Quorum at risk: {q.attending} yes, {q.needed} needed, {q.open} not replied.
        </Banner>
      ) : (
        <Banner tone="bad" action={meeting.can.reschedule ? <Button size="sm" onClick={() => setPanel('reschedule')}>Reschedule</Button> : null}>
          Quorum lost: only {q.attending} can attend and {q.needed} are needed. Reschedule the meeting.
        </Banner>
      )}

      <Card
        title="Replies"
        right={
          meeting.can.remind && open ? (
            <Button size="sm" variant="secondary" onClick={remind} disabled={actions.remind.isPending}>
              <BellRing className="h-4 w-4" aria-hidden /> Remind the {open} not replied
            </Button>
          ) : null
        }
      >
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-muted">
              <th className="px-5 py-2 font-medium">Director</th>
              <th className="px-3 py-2 font-medium">DIN</th>
              <th className="px-3 py-2 font-medium">Reply</th>
              <th className="px-3 py-2 font-medium">Note</th>
              <th className="px-5 py-2 text-right font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {meeting.replies.length === 0 ? (
              <tr>
                <td colSpan={5} className="border-t border-line-soft px-5 py-4 text-ink-muted">
                  No director is on the notice.
                </td>
              </tr>
            ) : (
              meeting.replies.map((r) => (
                <tr key={r.directorId} className="border-t border-line-soft">
                  <td className="px-5 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[13px] text-ink-2">{r.din ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {r.reply === 'yes' ? (
                      <Chip tone="ok" fixed raw>
                        Attending
                      </Chip>
                    ) : r.reply === 'no' ? (
                      <Chip tone="bad" fixed raw>
                        Not attending
                      </Chip>
                    ) : (
                      <Chip tone="idle" fixed raw>
                        No reply
                      </Chip>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{r.note ?? ''}</td>
                  <td className="px-5 py-2.5 text-right text-[13px] text-ink-muted">{stamp(r.repliedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Add to calendar">
          <div className="flex flex-col gap-3 px-5 py-4 text-[14px]">
            <p className="m-0 text-ink-2">
              {shortDate(meeting.meetingDate)}, {meeting.meetingTime} IST
              {meeting.teamsLink ? (
                <>
                  {' · '}
                  <a className="text-brand-text underline" href={meeting.teamsLink} target="_blank" rel="noreferrer">
                    Join Teams meeting
                  </a>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" asChild>
                <a href={`/api/board-meetings/${meeting.id}/ics`}>
                  <CalendarPlus className="h-4 w-4" aria-hidden /> Download .ics
                </a>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <a href={googleCalendarLink(ev)} target="_blank" rel="noreferrer">
                  Google Calendar
                </a>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <a href={outlookCalendarLink(ev)} target="_blank" rel="noreferrer">
                  Outlook
                </a>
              </Button>
            </div>
          </div>
        </Card>

        {meeting.can.reschedule || meeting.can.cancel ? (
          <Card title="Change the meeting">
            <div className="flex flex-col gap-3 px-5 py-4">
              {panel === 'none' ? (
                <div className="flex flex-wrap gap-2">
                  {meeting.can.reschedule ? (
                    <Button size="sm" variant="secondary" onClick={() => setPanel('reschedule')}>
                      <Clock className="h-4 w-4" aria-hidden /> Reschedule
                    </Button>
                  ) : null}
                  {meeting.can.cancel ? (
                    <Button size="sm" variant="secondary" onClick={() => setPanel('cancel')}>
                      <CalendarX2 className="h-4 w-4" aria-hidden /> Cancel meeting
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  {panel === 'reschedule' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="New date">
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                      </Field>
                      <Field label="New time (IST)">
                        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                      </Field>
                    </div>
                  ) : null}
                  <Field label="Reason (goes to the directors)">
                    <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </Field>
                  <p className="m-0 text-[12.5px] text-ink-muted">
                    {panel === 'reschedule'
                      ? 'The notice goes back to the manager. Replies reset. The same calendar event moves.'
                      : meeting.sentAt
                        ? 'The directors get a cancellation and the event leaves their calendars.'
                        : 'The notice was not sent, so nobody is emailed.'}
                  </p>
                  <div className="flex gap-2">
                    {panel === 'reschedule' ? (
                      <Button size="sm" onClick={reschedule} disabled={!reason.trim() || !date || !time || actions.reschedule.isPending}>
                        Send for approval
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" onClick={cancel} disabled={!reason.trim() || actions.cancel.isPending}>
                        Cancel meeting
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setPanel('none')}>
                      Back
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
