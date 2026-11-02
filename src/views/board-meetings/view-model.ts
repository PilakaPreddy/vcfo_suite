import { shortDate } from '@/lib/board-meetings/dates';
import type { MeetingDto } from '@/lib/board-meetings/wire';

/* Pure helpers for the board meeting views (kept out of the component files for fast refresh). */

export interface TrackStep {
  label: string;
  sub: string;
  state: 'done' | 'now' | 'next';
}

/** Draft → approval → sent → held → MoM signed, from the meeting. */
export function meetingSteps(m: MeetingDto): TrackStep[] {
  const mom = m.documents.find((d) => d.kind === 'mom');
  const order = ['draft', 'pending_approval', 'sent', 'held', 'mom'] as const;
  const at = m.status === 'held' ? (mom?.status === 'locked' ? 5 : 4) : m.status === 'sent' || m.status === 'approved' ? 2 : m.status === 'pending_approval' ? 1 : 0;
  const subs = [
    m.submittedAt ? `By ${m.submittedBy ?? 'the lead'}` : `Due ${shortDate(m.dates.noticeSend).slice(4, -5)}`,
    m.approvedAt ? `${m.approvedBy ?? 'Manager'}` : (m.manager?.name ?? 'Manager'),
    m.sentAt ? shortDate(m.sentAt.slice(0, 10)).slice(4, -5) : `By ${shortDate(m.dates.noticeSend).slice(4, -5)}`,
    shortDate(m.meetingDate).slice(4, -5),
    mom?.lockedAt ? shortDate(mom.lockedAt.slice(0, 10)).slice(4, -5) : `By ${shortDate(m.dates.momDue).slice(4, -5)}`,
  ];
  const labels = ['Draft notice', 'Manager approval', 'Sent to directors', 'Meeting held', 'MoM signed'];
  return order.map((_, i) => ({ label: labels[i]!, sub: subs[i]!, state: i < at ? 'done' : i === at ? 'now' : 'next' }));
}

/** The calendar event of a meeting, the same one the `.ics` route and the notice email use. */
export function meetingEventOf(m: MeetingDto) {
  return {
    uid: `board-meeting-${m.id}@vcfo-suite`,
    sequence: m.icsSequence,
    date: m.meetingDate,
    time: m.meetingTime,
    summary: `${m.kindLabel} · ${m.company.name}`,
    description: m.meetingNo,
    location: m.mode === 'in_person' ? m.venue : m.teamsLink ? 'Microsoft Teams' : 'Video conference',
    url: m.teamsLink,
  };
}

/** "02 Nov 2026, 14:05" from an ISO instant, in India time. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
