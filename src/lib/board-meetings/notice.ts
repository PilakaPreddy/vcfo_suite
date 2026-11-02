import { longDate, noticeDate, noticeTime } from './dates';
import type { AgendaItem, MeetingKind, MeetingMode } from './model';

/**
 * BOARD MEETING NOTICE — the notice and agenda text, in the layout of the NIPL BM-02 sample the
 * owner shared (Board_Meeting_Notice_and_Agenda_Signed.pdf). One builder feeds the on-screen
 * preview, the Word file and the email, so all three read the same.
 */

export interface NoticeInput {
  companyName: string;
  cin: string | null;
  address: string | null;
  kind: MeetingKind;
  meetingNo: string;
  meetingDate: string;
  meetingTime: string;
  secondZone: { label: string; time: string } | null;
  mode: MeetingMode;
  venue: string;
  /** The date printed on the notice (the day it is sent). */
  noticeOn: string;
  to: Array<{ name: string }>;
  signatory: { name: string; din: string | null; designation: string } | null;
  agenda: AgendaItem[];
  teamsLink: string | null;
  /** The manager's or lead's edited body paragraphs; null uses the standard wording. */
  bodyOverride: string[] | null;
}

export interface NoticeDoc {
  title: string;
  ref: string;
  dated: string;
  salutation: string;
  subject: string;
  body: string[];
  closing: string[];
  signatory: string[];
  toHeading: string;
  to: string[];
  agendaTitle: string;
  agendaMeta: Array<[string, string]>;
  agendaIntro: string;
  agenda: Array<{ n: string; text: string; subs: Array<{ n: string; text: string }> }>;
  footer: string[];
}

const BODY_OF: Record<MeetingKind, string> = {
  board: 'the Board of Directors',
  agm: 'the Members (Annual General Meeting)',
  egm: 'the Members (Extraordinary General Meeting)',
};

function timeLine(input: Pick<NoticeInput, 'meetingTime' | 'secondZone'>): string {
  const ist = `${noticeTime(input.meetingTime)} IST`;
  return input.secondZone ? `${ist} / ${noticeTime(input.secondZone.time)} ${input.secondZone.label}` : ist;
}

function placeLine(raw: Pick<NoticeInput, 'mode' | 'venue'>): string {
  // A blank venue shows as a [field] so the lead and the manager see what is missing.
  const input = { ...raw, venue: raw.venue?.trim() || '[registered office address]' };
  if (input.mode === 'in_person') return `at ${input.venue}`;
  if (input.mode === 'hybrid') return `at ${input.venue} and through Video Conferencing ("VC")`;
  return `through Video Conferencing ("VC") and shall be deemed to be held at the Registered Office of the Company situated at ${input.venue}`;
}

/** The standard body paragraphs, before any edit. */
export function standardBody(input: NoticeInput): string[] {
  const body = [
    `Notice is hereby given that the Meeting of ${BODY_OF[input.kind]} of ${input.companyName} bearing Meeting No. ${input.meetingNo} will be held on ${noticeDate(input.meetingDate)} at ${timeLine(input)} ${placeLine(input)}, to transact the business set out in the Agenda enclosed herewith.`,
    'You are requested to make it convenient to attend the Meeting.',
  ];
  if (input.mode !== 'in_person') {
    body.push(
      'Directors participating through Video Conferencing or Other Audio-Visual Means shall be deemed to be present at the Meeting for the purpose of quorum and voting in accordance with the provisions of the Companies Act, 2013 and the Rules made thereunder.',
    );
  }
  if (input.teamsLink) body.push(`Join the Meeting: ${input.teamsLink}`);
  return body;
}

export function buildNotice(input: NoticeInput): NoticeDoc {
  const title = input.kind === 'board' ? 'BOARD MEETING' : input.kind === 'agm' ? 'ANNUAL GENERAL MEETING' : 'EXTRAORDINARY GENERAL MEETING';
  const agenda = input.agenda.map((a, i) => ({
    n: String(i + 1),
    text: /[.?!]$/.test(a.text.trim()) ? a.text.trim() : `${a.text.trim()}.`,
    subs: a.subs.map((s, j) => ({ n: `${i + 1}.${j + 1}`, text: s.trim() })),
  }));
  const venueMode =
    input.mode === 'in_person'
      ? input.venue
      : input.mode === 'hybrid'
        ? `${input.venue} and through Video Conferencing ("VC")`
        : 'Through Video Conferencing ("VC") / Other Audio-Visual Means ("OAVM"), deemed to be held at the Registered Office of the Company.';
  return {
    title: `NOTICE OF ${title} TO BE HELD ON ${longDate(input.meetingDate).toUpperCase()}`,
    ref: input.meetingNo,
    dated: longDate(input.noticeOn),
    salutation: input.kind === 'board' ? 'Dear Directors,' : 'Dear Members,',
    subject: `Sub: Notice of Meeting of ${BODY_OF[input.kind].replace(/^the /, 'the ')}`,
    body: input.bodyOverride && input.bodyOverride.length ? input.bodyOverride : standardBody(input),
    closing: ['Thanking You.', 'Yours faithfully,', `For ${input.companyName}`],
    signatory: input.signatory
      ? [input.signatory.name, input.signatory.designation, ...(input.signatory.din ? [`DIN: ${input.signatory.din}`] : [])]
      : [],
    toHeading: 'To',
    to: input.to.map((t) => t.name),
    agendaTitle: `Agenda for the ${title === 'BOARD MEETING' ? 'Board Meeting' : title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} scheduled to be held on ${longDate(input.meetingDate)}`,
    agendaMeta: [
      ['MEETING NO:', input.meetingNo],
      ['DATE & TIME:', `${longDate(input.meetingDate)} at ${timeLine(input)}`],
      ['VENUE/MODE:', venueMode],
    ],
    agendaIntro: 'Following are the Agenda Items:',
    agenda,
    footer: [input.companyName.toUpperCase(), ...(input.cin ? [`CIN: ${input.cin}`] : []), ...(input.address ? [`Address: ${input.address}`] : [])],
  };
}

/** Plain text of the whole notice, for the email body fallback and tests. */
export function noticeText(doc: NoticeDoc): string {
  const lines = [
    doc.title,
    '',
    doc.ref,
    doc.dated,
    '',
    doc.salutation,
    doc.subject,
    '',
    ...doc.body.flatMap((p) => [p, '']),
    ...doc.closing,
    ...doc.signatory,
    '',
    doc.toHeading,
    ...doc.to.map((t, i) => `${i + 1}. ${t}`),
    '',
    doc.agendaTitle,
    ...doc.agendaMeta.map(([k, v]) => `${k} ${v}`),
    '',
    doc.agendaIntro,
    ...doc.agenda.flatMap((a) => [`${a.n}. ${a.text}`, ...a.subs.map((s) => `   ${s.n} ${s.text}`)]),
  ];
  return lines.join('\n');
}
