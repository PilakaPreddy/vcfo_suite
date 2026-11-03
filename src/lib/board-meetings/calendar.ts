/**
 * BOARD MEETING CALENDAR — the `.ics` invite (attached to the notice email and offered as a
 * download) and the "Add to Google Calendar" and "Add to Outlook" links. One UID per meeting;
 * a reschedule raises SEQUENCE and a cancellation sends METHOD:CANCEL with the same UID, so
 * calendars update the event they already have instead of adding a second one.
 */

export interface MeetingEvent {
  uid: string;
  /** 0 for the first notice, +1 for each update. */
  sequence: number;
  date: string; // YYYY-MM-DD (India time)
  time: string; // HH:MM 24-hour IST
  durationMinutes?: number;
  summary: string;
  description: string;
  location: string;
  url?: string | null;
  organizer?: { name: string; email: string } | null;
  attendees?: Array<{ name: string; email: string }>;
}

/** IST wall time → UTC instant. */
export function istToUtc(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** RFC 5545 line folding at 75 octets (approximated by characters). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    out.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return out.join('\r\n');
}

export function meetingIcs(ev: MeetingEvent, method: 'REQUEST' | 'PUBLISH' | 'CANCEL' = 'REQUEST', now: Date = new Date()): string {
  const start = istToUtc(ev.date, ev.time);
  const end = new Date(start.getTime() + (ev.durationMinutes ?? 60) * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VCFO Suite//Board meetings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `SEQUENCE:${ev.sequence}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsText(ev.summary)}`,
    `DESCRIPTION:${icsText(ev.description)}`,
    `LOCATION:${icsText(ev.location)}`,
    ...(ev.url ? [`URL:${ev.url}`] : []),
    ...(ev.organizer ? [`ORGANIZER;CN=${icsText(ev.organizer.name)}:mailto:${ev.organizer.email}`] : []),
    ...(ev.attendees ?? []).map((a) => `ATTENDEE;CN=${icsText(a.name)};ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${a.email}`),
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(method === 'CANCEL'
      ? []
      : ['BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`${ev.summary} tomorrow`)}`, 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleCalendarLink(ev: MeetingEvent): string {
  const start = istToUtc(ev.date, ev.time);
  const end = new Date(start.getTime() + (ev.durationMinutes ?? 60) * 60_000);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.summary,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: ev.url ? `${ev.description}\n\n${ev.url}` : ev.description,
    location: ev.location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function outlookCalendarLink(ev: MeetingEvent): string {
  const start = istToUtc(ev.date, ev.time);
  const end = new Date(start.getTime() + (ev.durationMinutes ?? 60) * 60_000);
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.summary,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: ev.url ? `${ev.description}\n\n${ev.url}` : ev.description,
    location: ev.location,
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`;
}
