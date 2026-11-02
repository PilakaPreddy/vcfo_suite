import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { AGENDA_LIBRARY_SEED, AGENDA_TOPICS } from '@/data/board-agenda-library';
import {
  addDaysIso,
  breaksGap,
  isHhmm,
  isIsoDate,
  isShortNotice,
  longDate,
  momDueDate,
  nextMeetingLimit,
  noticeDate,
  noticeSendDate,
  noticeTime,
  prepareDate,
  shortDate,
} from './dates';
import {
  agendaPlaceholders,
  companyPrefix,
  fyLabel,
  meetingNumber,
  normaliseAgenda,
  quorumForecast,
  quorumNeeded,
  splitPlaceholders,
  withCarriedResolutions,
} from './rules';
import { googleCalendarLink, istToUtc, meetingIcs, outlookCalendarLink } from './calendar';
import { buildNotice, noticeText, type NoticeInput } from './notice';
import { noticeDocx } from './notice-docx';
import { FIXED_END, FIXED_TOP, SUGGESTED, type AgendaItem } from './model';

const LIB = new Map(AGENDA_LIBRARY_SEED.map((i) => [i.id, i]));

describe('agenda library data', () => {
  it('holds the 224 items and 16 topics of the SBC master sheet', () => {
    expect(AGENDA_LIBRARY_SEED).toHaveLength(224);
    expect(AGENDA_TOPICS).toHaveLength(16);
    expect(new Set(AGENDA_LIBRARY_SEED.map((i) => i.id)).size).toBe(224);
    expect(LIB.get('BM-001')?.wording).toBe('To elect / appoint the Chairperson of the Meeting.');
  });

  it('every fixed and suggested id exists in the library', () => {
    const ids = [...Object.values(FIXED_TOP).flat(), ...FIXED_END, ...Object.values(SUGGESTED).flat()];
    for (const id of ids) expect(LIB.has(id), id).toBe(true);
  });
});

describe('dates', () => {
  it('builds the 10-day window, the MoM due date and the 120-day limit', () => {
    expect(prepareDate('2026-09-10')).toBe('2026-08-31');
    expect(noticeSendDate('2026-09-10')).toBe('2026-09-03');
    expect(momDueDate('2026-09-10')).toBe('2026-10-10');
    expect(nextMeetingLimit('2026-06-18')).toBe('2026-10-16');
    expect(breaksGap('2026-06-18', '2026-10-16')).toBe(false);
    expect(breaksGap('2026-06-18', '2026-10-17')).toBe(true);
    expect(breaksGap(null, '2027-01-01')).toBe(false);
  });

  it('flags short notice under 7 days', () => {
    expect(isShortNotice('2026-09-03', '2026-09-10')).toBe(false);
    expect(isShortNotice('2026-09-04', '2026-09-10')).toBe(true);
  });

  it('formats like the NIPL notice', () => {
    expect(longDate('2026-09-03')).toBe('03 September 2026');
    expect(noticeDate('2026-09-10')).toBe('Thursday, 10th September 2026');
    expect(noticeTime('19:30')).toBe('07:30 P.M.');
    expect(noticeTime('08:00')).toBe('08:00 A.M.');
    expect(noticeTime('00:15')).toBe('12:15 A.M.');
    expect(shortDate('2026-09-10')).toBe('Thu 10 Sep 2026');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('validates dates and times', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isHhmm('19:30')).toBe(true);
    expect(isHhmm('24:00')).toBe(false);
  });
});

describe('rules', () => {
  it('makes the meeting number from the company name and the financial year', () => {
    expect(companyPrefix('NetDocuments India Private Limited')).toBe('NIPL');
    expect(companyPrefix('Tata & Sons of India Pvt. Ltd.')).toBe('TSIPL');
    expect(fyLabel('2026-09-10')).toBe('2026-27');
    expect(fyLabel('2027-03-31')).toBe('2026-27');
    expect(fyLabel('2027-04-01')).toBe('2027-28');
    expect(meetingNumber('NIPL', 2, '2026-27')).toBe('NIPL/BM/02/2026-27');
    expect(meetingNumber('NIPL', 1, '2026-27', 'agm')).toBe('NIPL/AGM/01/2026-27');
  });

  it('computes the quorum under Sec 174', () => {
    expect(quorumNeeded(3)).toBe(2);
    expect(quorumNeeded(9)).toBe(3);
    expect(quorumNeeded(10)).toBe(4);
    expect(quorumNeeded(1)).toBe(1);
    expect(quorumForecast(['yes', 'no', null])).toEqual({ state: 'at_risk', attending: 1, needed: 2, open: 1 });
    expect(quorumForecast(['yes', 'yes', null]).state).toBe('ok');
    expect(quorumForecast(['no', 'no', 'yes']).state).toBe('lost');
  });

  it('finds unfilled fields in the agenda', () => {
    const agenda: AgendaItem[] = [
      { key: 'a', libraryId: 'BM-112', text: 'Review for the period ended [date]', subs: ['Note [Name]'] },
      { key: 'b', libraryId: null, text: 'Filled', subs: [] },
    ];
    expect(agendaPlaceholders(agenda)).toEqual(['[date]', '[Name]']);
    expect(splitPlaceholders('ended [date].')).toEqual([
      { text: 'ended ', blank: false },
      { text: '[date]', blank: true },
      { text: '.', blank: false },
    ]);
  });

  it('keeps fixed items at the top and the end and adds missing ones', () => {
    const agenda: AgendaItem[] = [
      { key: 'x', libraryId: 'BM-112', text: 'Compliance review', subs: [] },
      { key: 'y', libraryId: 'BM-011', text: 'Any other business', subs: [] },
      { key: 'z', libraryId: 'BM-001', text: 'Elect chair', subs: [] },
    ];
    const out = normaliseAgenda(agenda, 'quarterly', LIB);
    expect(out.map((a) => a.libraryId)).toEqual(['BM-001', 'BM-003', 'BM-002', 'BM-005', 'BM-007', 'BM-112', 'BM-011']);
    expect(out[0]!.text).toBe('Elect chair');
    expect(out[0]!.fixed).toBe('top');
    expect(out.at(-1)!.fixed).toBe('end');
    expect(out[5]!.fixed).toBeUndefined();
  });

  it('puts carried resolutions under the circulation item once', () => {
    const agenda = normaliseAgenda([], 'quarterly', LIB);
    const once = withCarriedResolutions(agenda, ['Resolution of 25 Sep 2026: bank account']);
    const twice = withCarriedResolutions(once, ['Resolution of 25 Sep 2026: bank account']);
    expect(twice.find((a) => a.libraryId === 'BM-007')!.subs).toEqual(['Resolution of 25 Sep 2026: bank account']);
  });
});

describe('calendar', () => {
  const ev = {
    uid: 'meeting-1@vcfo-suite',
    sequence: 0,
    date: '2026-09-10',
    time: '19:30',
    summary: 'Board meeting · NetDocuments India',
    description: 'Meeting NIPL/BM/02/2026-27; agenda attached',
    location: 'Video conference',
    url: 'https://teams.example/join',
  };

  it('converts IST to UTC', () => {
    expect(istToUtc('2026-09-10', '19:30').toISOString()).toBe('2026-09-10T14:00:00.000Z');
  });

  it('writes a REQUEST and a CANCEL with the same UID', () => {
    const now = new Date('2026-09-03T05:00:00Z');
    const req = meetingIcs(ev, 'REQUEST', now);
    expect(req).toContain('METHOD:REQUEST');
    expect(req).toContain('DTSTART:20260910T140000Z');
    expect(req).toContain('DTEND:20260910T150000Z');
    expect(req).toContain('UID:meeting-1@vcfo-suite');
    expect(req).toContain('DESCRIPTION:Meeting NIPL/BM/02/2026-27\\; agenda attached');
    const cancel = meetingIcs({ ...ev, sequence: 2 }, 'CANCEL', now);
    expect(cancel).toContain('STATUS:CANCELLED');
    expect(cancel).toContain('SEQUENCE:2');
    expect(cancel).not.toContain('VALARM');
  });

  it('builds Google and Outlook links', () => {
    expect(googleCalendarLink(ev)).toContain('dates=20260910T140000Z%2F20260910T150000Z');
    expect(outlookCalendarLink(ev)).toContain('startdt=2026-09-10T14%3A00%3A00.000Z');
  });
});

describe('notice', () => {
  const input: NoticeInput = {
    companyName: 'NetDocuments India Private Limited',
    cin: 'U62099TS2025FTC205994',
    address: 'Level 6, Unit 2, Orwell Block, Salarpuria Knowledge City, Raidurg, Hyderabad, Telangana, India, 500081',
    kind: 'board',
    meetingNo: 'NIPL/BM/02/2026-27',
    meetingDate: '2026-09-10',
    meetingTime: '19:30',
    secondZone: { label: 'MDT', time: '08:00' },
    mode: 'vc',
    venue: 'Level 6, Unit 2, Orwell Block, Salarpuria Knowledge City, Raidurg, Hyderabad – 500081, India',
    noticeOn: '2026-09-03',
    to: [{ name: 'Dayton Scott Kellenberger' }, { name: 'John Syphus Jensen' }, { name: 'Rahul Hari Bhide' }],
    signatory: { name: 'Rahul Bhide', din: '10211790', designation: 'Director' },
    agenda: normaliseAgenda([], 'quarterly', LIB),
    teamsLink: null,
    bodyOverride: null,
  };

  it('matches the NIPL sample wording', () => {
    const doc = buildNotice(input);
    expect(doc.title).toBe('NOTICE OF BOARD MEETING TO BE HELD ON 10 SEPTEMBER 2026');
    expect(doc.dated).toBe('03 September 2026');
    expect(doc.body[0]).toBe(
      'Notice is hereby given that the Meeting of the Board of Directors of NetDocuments India Private Limited bearing Meeting No. NIPL/BM/02/2026-27 will be held on Thursday, 10th September 2026 at 07:30 P.M. IST / 08:00 A.M. MDT through Video Conferencing ("VC") and shall be deemed to be held at the Registered Office of the Company situated at Level 6, Unit 2, Orwell Block, Salarpuria Knowledge City, Raidurg, Hyderabad – 500081, India, to transact the business set out in the Agenda enclosed herewith.',
    );
    expect(doc.body).toHaveLength(3);
    expect(doc.signatory).toEqual(['Rahul Bhide', 'Director', 'DIN: 10211790']);
    expect(doc.agendaMeta[1]).toEqual(['DATE & TIME:', '10 September 2026 at 07:30 P.M. IST / 08:00 A.M. MDT']);
    expect(doc.agenda[0]!.text).toBe('To elect / appoint the Chairperson of the Meeting.');
    expect(noticeText(doc)).toContain('1. Dayton Scott Kellenberger');
  });

  it('uses the edited body when there is one and adds the Teams line', () => {
    expect(buildNotice({ ...input, bodyOverride: ['Edited.'] }).body).toEqual(['Edited.']);
    expect(buildNotice({ ...input, teamsLink: 'https://teams/x' }).body.at(-1)).toBe('Join the Meeting: https://teams/x');
    expect(buildNotice({ ...input, mode: 'in_person' }).body).toHaveLength(2);
  });

  it('writes a Word file with both pages', () => {
    const buf = noticeDocx(buildNotice(input));
    const xml = new PizZip(buf).file('word/document.xml')!.asText();
    expect(xml).toContain('NOTICE OF BOARD MEETING TO BE HELD ON 10 SEPTEMBER 2026');
    expect(xml).toContain('<w:pageBreakBefore/>');
    expect(xml).toContain('CIN: U62099TS2025FTC205994');
  });
});
