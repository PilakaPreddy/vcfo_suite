import 'server-only';
import { sendEmail } from '@/lib/email/send-email';
import { emailCallout, emailMetaTable, emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { siteUrl } from '@/lib/site-url';
import { getObjectBuffer, bucketKey } from '@/storage/s3';
import {
  finalAgenda,
  meetingHref,
  notifyMeeting,
  noticeFor,
  systemDocument,
  systemMarkFinalSent,
  systemMarkSent,
  systemMeetingBundle,
} from '@/db/repositories/board-meetings';
import { systemTeamsMeeting } from '@/db/repositories/outlook-connections';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { addDaysIso, isShortNotice, longDate, noticeTime, shortDate, todayIst } from './dates';
import { googleCalendarLink, meetingIcs, outlookCalendarLink, type MeetingEvent } from './calendar';
import { noticeDocx } from './notice-docx';
import { resolutionDocx } from './resolution';
import { signDirectorLink } from './reply-token';
import { KIND_LABEL, MODE_LABEL, type MeetingKind, type MeetingMode } from './model';

/**
 * BOARD MEETING EMAIL — the system of record for everything a director receives
 * (CLAUDE.md rule 6). Called by the routes after the repository has checked access and changed
 * state. A failed send never undoes the state change; it is logged by `sendEmail`.
 *
 *  - sendNotice:        notice + agenda (Word), invite (.ics), Teams link, reply buttons.
 *  - sendCancellation:  cancellation with METHOD:CANCEL on the same UID.
 *  - sendForSignature:  the MoM or a resolution to the signing directors (reply to the lead).
 *  - sendFinalCopy:     the signed, locked copy to all directors, CC admin and lead.
 *  - remindLead:        T-10 "prepare the notice" and the MoM due reminders.
 */

type Bundle = NonNullable<Awaited<ReturnType<typeof systemMeetingBundle>>>;

function people(bundle: Bundle): { to: string[]; cc: string[]; directors: Array<{ id: string; name: string; email: string | null }> } {
  const to = new Set<string>();
  const cc = new Set<string>();
  const directors: Array<{ id: string; name: string; email: string | null }> = [];
  for (const r of bundle.meeting.recipients) {
    if (r.directorId) {
      const d = bundle.directors.find((x) => x.id === r.directorId);
      const email = d?.email ?? r.email;
      if (r.kind === 'to') directors.push({ id: r.directorId, name: d?.name ?? r.name, email });
      if (email) (r.kind === 'to' ? to : cc).add(email.toLowerCase());
      continue;
    }
    if (r.email) (r.kind === 'to' ? to : cc).add(r.email.toLowerCase());
  }
  for (const t of to) cc.delete(t);
  return { to: [...to], cc: [...cc], directors };
}

function eventOf(bundle: Bundle, teamsLink: string | null): MeetingEvent {
  const m = bundle.meeting;
  const kind = KIND_LABEL[m.kind as MeetingKind] ?? 'Board meeting';
  return {
    uid: `board-meeting-${m.id}@vcfo-suite`,
    sequence: m.icsSequence,
    date: m.meetingDate,
    time: m.meetingTime,
    durationMinutes: 60,
    summary: `${kind} · ${bundle.company.name}`,
    description: `${m.meetingNo}. ${MODE_LABEL[m.mode as MeetingMode] ?? ''}. The notice and agenda are attached to the notice email.`,
    location: m.mode === 'in_person' ? m.venue : teamsLink ? 'Microsoft Teams' : 'Video conference',
    url: teamsLink,
  };
}

function slug(s: string): string {
  return s.replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function btn(href: string, label: string, primary = false): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 6px 6px 0;padding:9px 14px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;${primary ? 'background:#635BFF;color:#ffffff;' : 'background:#ffffff;color:#0A2540;border:1px solid #CBD3DE;'}">${escapeHtml(label)}</a>`;
}

/** Create or move the Teams meeting in the lead's Outlook (best effort). */
async function teamsFor(bundle: Bundle, leadId: string | null): Promise<{ link: string | null; eventId: string | null } | null> {
  const m = bundle.meeting;
  if (m.mode === 'in_person' || !leadId) return null;
  const startLocal = `${m.meetingDate}T${m.meetingTime}:00`;
  const endDate = new Date(Date.parse(`${m.meetingDate}T${m.meetingTime}:00Z`) + 3_600_000).toISOString().slice(0, 19);
  const input = {
    subject: `${KIND_LABEL[m.kind as MeetingKind] ?? 'Board meeting'} · ${bundle.company.name} · ${m.meetingNo}`,
    start: startLocal,
    end: endDate,
    location: 'Microsoft Teams',
    bodyHtml: `<p>${escapeHtml(m.meetingNo)}. Created by VCFO Suite for the board meeting notice.</p>`,
  };
  if (m.teamsEventId) {
    const r = await systemTeamsMeeting(leadId, { kind: 'update', eventId: m.teamsEventId, input });
    return r ? { link: r.joinUrl ?? m.teamsLink, eventId: r.eventId } : null;
  }
  if (m.teamsLink) return null; // the lead pasted a link: keep it
  const r = await systemTeamsMeeting(leadId, { kind: 'create', input });
  return r ? { link: r.joinUrl, eventId: r.eventId } : null;
}

export async function sendNotice(meetingId: string, opts: { leadId: string | null; notifyIds: string[]; update: boolean }): Promise<{ sent: boolean; to: number; cc: number; teams: boolean }> {
  let bundle = await systemMeetingBundle(meetingId);
  if (!bundle) return { sent: false, to: 0, cc: 0, teams: false };
  const today = todayIst();
  const teams = await teamsFor(bundle, opts.leadId);
  const { agenda } = await finalAgenda(bundle.meeting);
  const marked = await systemMarkSent(meetingId, {
    noticeOn: today,
    shortNotice: isShortNotice(today, bundle.meeting.meetingDate),
    agenda,
    bumpSequence: opts.update,
    ...(teams ? { teamsLink: teams.link, teamsEventId: teams.eventId } : {}),
  });
  if (!marked) return { sent: false, to: 0, cc: 0, teams: false };
  bundle = { ...bundle, meeting: marked };
  const m = marked;
  const notice = noticeFor(m, bundle.company, bundle.directors, agenda, today);
  const docx = noticeDocx(notice);
  const ev = eventOf(bundle, m.teamsLink);
  const ics = meetingIcs(ev, 'REQUEST');
  const { to, cc, directors } = people(bundle);
  const base = siteUrl();
  const kind = KIND_LABEL[m.kind as MeetingKind] ?? 'Board meeting';
  const when = `${shortDate(m.meetingDate)} · ${noticeTime(m.meetingTime)} IST${m.secondZoneLabel && m.secondZoneTime ? ` / ${noticeTime(m.secondZoneTime)} ${m.secondZoneLabel}` : ''}`;
  const replyRows = directors
    .map((d) => {
      const t = signDirectorLink(m.id, d.id);
      const href = (r: string) => `${base}/meeting-reply?t=${encodeURIComponent(t)}&r=${r}`;
      return `<tr><td style="padding:8px 0;font-size:14px;color:#0A2540;">${escapeHtml(d.name)}</td><td style="padding:8px 0;text-align:right;">${btn(href('yes'), 'I will attend', true)}${btn(href('no'), "I can't attend")}</td></tr>`;
    })
    .join('');
  const agendaHtml = `<ol style="margin:0 0 14px 18px;padding:0;">${notice.agenda.map((a) => `<li style="margin:0 0 4px;">${escapeHtml(a.text)}${a.subs.length ? `<ul style="margin:4px 0 0 0;padding-left:16px;">${a.subs.map((s) => `<li>${escapeHtml(s.text)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol>`;
  const html = renderEmailDocument({
    eyebrow: opts.update ? 'Updated notice' : 'Notice of meeting',
    title: `${kind} · ${bundle.company.name}`,
    bodyHtml: [
      emailParagraph(opts.update ? 'The meeting has changed. The updated notice and agenda are attached; your calendar updates the event you already have.' : `${escapeHtml(notice.salutation)} The notice and agenda of the meeting are attached.`),
      emailMetaTable([
        { label: 'Meeting no.', value: m.meetingNo },
        { label: 'Date and time', value: when },
        { label: 'Mode', value: MODE_LABEL[m.mode as MeetingMode] ?? m.mode },
        { label: 'Venue', value: m.venue || '—' },
      ]),
      m.teamsLink ? emailParagraph(btn(m.teamsLink, 'Join on Microsoft Teams', true)) : '',
      emailParagraph(`<b>Add to calendar:</b> ${btn(outlookCalendarLink(ev), 'Outlook')}${btn(googleCalendarLink(ev), 'Google Calendar')} — or open the attached .ics file.`),
      replyRows ? `<p style="margin:18px 0 6px;font-weight:600;color:#0A2540;">Will you attend?</p><table role="presentation" style="width:100%;border-collapse:collapse;">${replyRows}</table><p style="margin:4px 0 14px;font-size:12px;color:#64748B;">Each director uses the buttons on their own row. No sign-in is needed.</p>` : '',
      `<p style="margin:18px 0 6px;font-weight:600;color:#0A2540;">Agenda</p>${agendaHtml}`,
      m.shortNotice ? emailCallout('This notice is sent less than 7 days before the meeting (Sec 173(3)). Please confirm your consent to shorter notice by reply.') : '',
    ].join(''),
    footerNote: `${bundle.company.name}${bundle.company.cin ? ` · CIN ${bundle.company.cin}` : ''}. Sent by SBC through VCFO Suite.`,
  });
  const text = `${kind} · ${bundle.company.name}\n${m.meetingNo}\n${when}\n${m.venue}\n${m.teamsLink ? `Join: ${m.teamsLink}\n` : ''}\nThe notice and agenda are attached.`;
  const file = slug(m.meetingNo);
  let sent = false;
  if (to.length) {
    const res = await sendEmail({
      to,
      cc,
      subject: `${opts.update ? 'Updated notice' : 'Notice'} of ${kind} · ${m.meetingNo} · ${shortDate(m.meetingDate)}`,
      html,
      text,
      purpose: 'board_meeting.notice',
      attachments: [
        { filename: `Notice_and_Agenda_${file}.docx`, content: docx, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { filename: `${file}.ics`, content: new TextEncoder().encode(ics), contentType: 'text/calendar; method=REQUEST; charset=utf-8' },
      ],
    });
    sent = res.ok;
  }
  await bell(bundle, opts.notifyIds, `${opts.update ? 'Updated notice' : 'Notice'} sent: ${m.meetingNo}`, `Emailed to ${to.length} and CC ${cc.length}. ${m.teamsLink ? 'Teams link included.' : 'No Teams link.'}`);
  return { sent, to: to.length, cc: cc.length, teams: Boolean(m.teamsLink) };
}

export async function sendCancellation(meetingId: string, opts: { leadId: string | null; notifyIds: string[]; wasSent: boolean }): Promise<void> {
  const bundle = await systemMeetingBundle(meetingId);
  if (!bundle) return;
  const m = bundle.meeting;
  if (m.teamsEventId && opts.leadId) await systemTeamsMeeting(opts.leadId, { kind: 'cancel', eventId: m.teamsEventId, comment: m.cancelReason ?? 'Cancelled' });
  if (!opts.wasSent) return;
  const { to, cc } = people(bundle);
  if (!to.length) return;
  const ev = eventOf(bundle, m.teamsLink);
  const kind = KIND_LABEL[m.kind as MeetingKind] ?? 'Board meeting';
  await sendEmail({
    to,
    cc,
    subject: `Cancelled: ${kind} · ${m.meetingNo} · ${shortDate(m.meetingDate)}`,
    html: renderEmailDocument({
      eyebrow: 'Meeting cancelled',
      title: `${kind} · ${bundle.company.name}`,
      bodyHtml: [
        emailParagraph(`The meeting ${escapeHtml(m.meetingNo)} on ${escapeHtml(longDate(m.meetingDate))} is cancelled.`),
        m.cancelReason ? emailCallout(`Reason: ${escapeHtml(m.cancelReason)}`) : '',
        emailParagraph('Your calendar removes the event when you open the attached file.'),
      ].join(''),
    }),
    text: `Cancelled: ${m.meetingNo} on ${longDate(m.meetingDate)}. ${m.cancelReason ?? ''}`,
    purpose: 'board_meeting.cancel',
    attachments: [{ filename: `${slug(m.meetingNo)}-cancel.ics`, content: new TextEncoder().encode(meetingIcs(ev, 'CANCEL')), contentType: 'text/calendar; method=CANCEL; charset=utf-8' }],
  });
  await bell(bundle, opts.notifyIds, `Meeting cancelled: ${m.meetingNo}`, m.cancelReason ?? '');
}

async function documentFile(doc: NonNullable<Awaited<ReturnType<typeof systemDocument>>>, bundle: Bundle, which: 'file' | 'signed'): Promise<{ filename: string; content: Uint8Array; contentType: string } | null> {
  const key = which === 'signed' ? doc.signedKey : doc.fileKey;
  if (key) {
    const buf = await getObjectBuffer(bucketKey('engagement-documents', key));
    if (!buf) return null;
    return { filename: (which === 'signed' ? doc.signedName : doc.fileName) ?? `${slug(doc.title)}.pdf`, content: buf, contentType: 'application/pdf' };
  }
  if (doc.kind !== 'resolution' || which === 'signed') return null;
  const signers = doc.signerIds.map((id) => bundle.directors.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const buf = resolutionDocx({
    companyName: bundle.company.name,
    cin: bundle.company.cin,
    address: bundle.company.address,
    title: doc.title,
    description: doc.description,
    resolutionDate: doc.resolutionDate ?? todayIst(),
    meetingNo: bundle.meeting.meetingNo,
    meetingDate: bundle.meeting.meetingDate,
    changesItem: doc.changesItem,
    signers: signers.map((s) => ({ name: s.name, din: s.din })),
  });
  return { filename: `Resolution_${slug(doc.title).slice(0, 60)}.docx`, content: buf, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}

export async function sendForSignature(docId: string, opts: { lead: { name: string; email: string } | null; reminder: boolean }): Promise<number> {
  const doc = await systemDocument(docId);
  if (!doc) return 0;
  const bundle = await systemMeetingBundle(doc.meetingId);
  if (!bundle) return 0;
  const signers = doc.signerIds.map((id) => bundle.directors.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => Boolean(d?.email));
  if (!signers.length) return 0;
  const att = await documentFile(doc, bundle, 'file');
  const what = doc.kind === 'mom' ? 'the minutes of meeting' : 'a resolution passed after the meeting';
  await sendEmail({
    to: signers.map((s) => s.email!),
    cc: opts.lead ? [opts.lead.email] : [],
    replyTo: opts.lead ? `${opts.lead.name} <${opts.lead.email}>` : undefined,
    subject: `${opts.reminder ? 'Reminder: ' : ''}Please sign ${doc.kind === 'mom' ? 'the MoM' : 'the resolution'} · ${bundle.meeting.meetingNo}`,
    html: renderEmailDocument({
      eyebrow: opts.reminder ? 'Reminder · signature needed' : 'Signature needed',
      title: doc.title,
      bodyHtml: [
        emailParagraph(`Please sign ${what} of ${escapeHtml(bundle.company.name)} (${escapeHtml(bundle.meeting.meetingNo)}, ${escapeHtml(longDate(bundle.meeting.meetingDate))}) and return the signed copy by replying to this email.`),
        doc.kind === 'resolution' ? emailCallout(escapeHtml(doc.description)) : '',
        emailMetaTable(signers.map((s) => ({ label: s.name, value: s.din ? `DIN ${s.din}` : 'Director' }))),
      ].join(''),
    }),
    text: `Please sign ${what} of ${bundle.company.name} and reply with the signed copy.`,
    purpose: 'board_meeting.signature',
    attachments: att ? [att] : [],
  });
  return signers.length;
}

export async function sendFinalCopy(docId: string, opts: { ccEmails: string[]; notifyIds: string[] }): Promise<number> {
  const doc = await systemDocument(docId);
  if (!doc || doc.status !== 'locked') return 0;
  const bundle = await systemMeetingBundle(doc.meetingId);
  if (!bundle) return 0;
  const today = todayIst();
  const current = bundle.directors.filter((d) => (!d.ceasedOn || d.ceasedOn > today) && d.email);
  const att = await documentFile(doc, bundle, 'signed');
  if (!current.length) return 0;
  await sendEmail({
    to: current.map((d) => d.email!),
    cc: [...new Set(opts.ccEmails.filter(Boolean))],
    subject: `Signed copy · ${doc.title} · ${bundle.meeting.meetingNo}`,
    html: renderEmailDocument({
      eyebrow: 'Signed and locked',
      title: doc.title,
      bodyHtml: emailParagraph(`The signed copy of ${doc.kind === 'mom' ? 'the minutes of meeting' : 'the resolution'} of ${escapeHtml(bundle.company.name)} (${escapeHtml(bundle.meeting.meetingNo)}) is attached for your records. It is now locked in VCFO Suite.`),
    }),
    text: `Signed copy of ${doc.title} (${bundle.meeting.meetingNo}) attached.`,
    purpose: 'board_meeting.final_copy',
    attachments: att ? [att] : [],
  });
  await systemMarkFinalSent(doc.id, current.map((d) => d.id));
  await bell(bundle, opts.notifyIds, `Signed and locked: ${doc.title}`, `Final copy emailed to ${current.length} directors.`);
  return current.length;
}

async function bell(bundle: Bundle, userIds: string[], title: string, body: string): Promise<void> {
  await notifyMeeting(null, { meeting: bundle.meeting, companyName: bundle.company.name, title, body, recipientIds: userIds });
}

/** T-10 and MoM reminders to the lead (bell + email). */
export async function remindLead(input: { meetingId: string; lead: { id: string; name: string; email: string }; kind: 'prepare' | 'mom'; daysAfter?: number }): Promise<void> {
  const bundle = await systemMeetingBundle(input.meetingId);
  if (!bundle) return;
  const m = bundle.meeting;
  const href = `${siteUrl()}${meetingHref('intern', m.id)}`;
  const title =
    input.kind === 'prepare'
      ? `Prepare the notice: ${m.meetingNo}`
      : (input.daysAfter ?? 0) > 30
        ? `MoM overdue: ${m.meetingNo}`
        : `Upload the signed MoM: ${m.meetingNo}`;
  const body =
    input.kind === 'prepare'
      ? `Board meeting on ${shortDate(m.meetingDate)}. Send the notice for approval so it goes out by ${shortDate(addDaysIso(m.meetingDate, -7))}.`
      : `Meeting held on ${shortDate(m.meetingDate)}. The signed MoM is due by ${shortDate(addDaysIso(m.meetingDate, 30))} (SS-1).`;
  await sendEmail({
    to: input.lead.email,
    subject: `${title} · ${bundle.company.name}`,
    html: renderEmailDocument({ eyebrow: 'Board meeting', title, bodyHtml: emailParagraph(escapeHtml(body)), cta: { label: 'Open the meeting', href } }),
    text: `${title}\n${body}\n${href}`,
    purpose: `board_meeting.reminder.${input.kind}`,
  });
  await createNotificationsForUsers([
    {
      userId: input.lead.id,
      kind: 'board.meeting' as const,
      title,
      body,
      engagementId: appEngagementId(m.engagementId),
      companyName: bundle.company.name,
      itemId: m.id,
      href: meetingHref('intern', m.id),
    },
  ]).catch(() => []);
}

/** Remind directors who have not replied (one email, To those directors only). */
export async function remindNonResponders(meetingId: string, replied: string[]): Promise<number> {
  const bundle = await systemMeetingBundle(meetingId);
  if (!bundle) return 0;
  const m = bundle.meeting;
  const { directors } = people(bundle);
  const open = directors.filter((d) => d.email && !replied.includes(d.id));
  if (!open.length) return 0;
  const base = siteUrl();
  const rows = open
    .map((d) => {
      const t = signDirectorLink(m.id, d.id);
      const href = (r: string) => `${base}/meeting-reply?t=${encodeURIComponent(t)}&r=${r}`;
      return `<tr><td style="padding:8px 0;font-size:14px;color:#0A2540;">${escapeHtml(d.name)}</td><td style="padding:8px 0;text-align:right;">${btn(href('yes'), 'I will attend', true)}${btn(href('no'), "I can't attend")}</td></tr>`;
    })
    .join('');
  const kind = KIND_LABEL[m.kind as MeetingKind] ?? 'Board meeting';
  await sendEmail({
    to: open.map((d) => d.email!),
    subject: `Reminder: will you attend? ${kind} · ${m.meetingNo} · ${shortDate(m.meetingDate)}`,
    html: renderEmailDocument({
      eyebrow: 'Reminder',
      title: `${kind} · ${bundle.company.name}`,
      bodyHtml: emailParagraph(`The meeting is on ${escapeHtml(shortDate(m.meetingDate))} at ${escapeHtml(noticeTime(m.meetingTime))} IST. Please tell us if you will attend.`) + `<table role="presentation" style="width:100%;border-collapse:collapse;">${rows}</table>`,
    }),
    text: `Reminder: ${kind} ${m.meetingNo} on ${shortDate(m.meetingDate)}. Please reply from the notice email.`,
    purpose: 'board_meeting.reply_reminder',
  });
  return open.length;
}
