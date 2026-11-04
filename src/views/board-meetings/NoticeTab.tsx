'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Lock, Pencil, Plus, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tag } from '@/components/ui/spectrum-chip';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { MODE_LABEL, TYPE_LABEL, type AgendaItem, type MeetingRecipient, type MeetingType } from '@/lib/board-meetings/model';
import { agendaPlaceholders, splitPlaceholders } from '@/lib/board-meetings/rules';
import { shortDate } from '@/lib/board-meetings/dates';
import { useDirectorActions, useMeetingActions, type MeetingDto } from '@/hooks/use-board-meetings';
import { AgendaPickerDialog } from './AgendaPickerDialog';
import { NoticePreview } from './NoticePreview';
import { Banner, Card, Field } from './parts';

interface Draft {
  meetingDate: string;
  meetingTime: string;
  zoneLabel: string;
  zoneTime: string;
  mode: string;
  meetingType: MeetingType;
  venue: string;
  teamsLink: string;
  agenda: AgendaItem[];
  recipients: MeetingRecipient[];
  signatoryDirectorId: string | null;
  body: string[] | null;
}

function draftOf(m: MeetingDto): Draft {
  return {
    meetingDate: m.meetingDate,
    meetingTime: m.meetingTime,
    zoneLabel: m.secondZone?.label ?? '',
    zoneTime: m.secondZone?.time ?? '',
    mode: m.mode,
    meetingType: m.meetingType,
    venue: m.venue,
    teamsLink: m.teamsLink ?? '',
    agenda: m.agenda,
    recipients: m.recipients,
    signatoryDirectorId: m.signatoryDirectorId,
    body: m.bodyOverride,
  };
}

/**
 * NOTICE TAB — the lead drafts (director picker, agenda picker, copy from last meeting, blank
 * fields block sending); the manager edits the text, recipients, date, time and agenda, then
 * approves (VCFO emails the notice) or sends it back with a note.
 */
export function NoticeTab({ meeting }: { meeting: MeetingDto }) {
  const actions = useMeetingActions(meeting.id);
  const directorActions = useDirectorActions();
  const [d, setD] = useState<Draft>(() => draftOf(meeting));
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [editText, setEditText] = useState(false);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState(false);
  const [cc, setCc] = useState({ name: '', email: '' });
  const [newDir, setNewDir] = useState<{ name: string; din: string; email: string } | null>(null);

  useEffect(() => {
    if (!dirty) setD(draftOf(meeting));
  }, [meeting, dirty]);

  const editable = meeting.can.editNotice;
  const managerView = meeting.status === 'pending_approval';
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };

  const patchBody = () => ({
    meetingDate: d.meetingDate,
    meetingTime: d.meetingTime,
    secondZone: d.zoneLabel.trim() && d.zoneTime ? { label: d.zoneLabel.trim(), time: d.zoneTime } : null,
    mode: d.mode,
    meetingType: d.meetingType,
    venue: d.venue,
    teamsLink: d.teamsLink.trim() || null,
    agenda: d.agenda,
    recipients: d.recipients,
    signatoryDirectorId: d.signatoryDirectorId,
    bodyOverride: d.body,
  });

  const save = async (quiet = false): Promise<boolean> => {
    if (!dirty) return true;
    try {
      await actions.patch.mutateAsync(patchBody());
      setDirty(false);
      if (!quiet) toastSaved(managerView ? 'Edit saved · new version' : 'Draft saved', { kind: 'saved' });
      return true;
    } catch (e) {
      toastError(errorMessage(e, 'Could not save the notice'));
      return false;
    }
  };

  const blanks = useMemo(() => agendaPlaceholders(d.agenda), [d.agenda]);
  const directors = meeting.directors.filter((x) => x.current);
  const invited = new Set(d.recipients.filter((r) => r.kind === 'to' && r.directorId).map((r) => r.directorId));
  const toggleDirector = (id: string) => {
    const dir = directors.find((x) => x.id === id);
    if (!dir) return;
    if (invited.has(id)) set({ recipients: d.recipients.filter((r) => r.directorId !== id) });
    else set({ recipients: [{ kind: 'to', directorId: id, name: dir.name, email: dir.email, role: dir.designation }, ...d.recipients] });
  };
  const nonDirectorTo = d.recipients.filter((r) => r.kind === 'to' && !r.directorId);
  const ccList = d.recipients.filter((r) => r.kind === 'cc');
  const missingEmail = directors.filter((x) => invited.has(x.id) && !x.email);

  const checks = [
    { ok: !meeting.dates.shortNoticeIfSentToday, t: 'Notice goes out 7 days before the meeting', s: meeting.dates.shortNoticeIfSentToday ? `Today is less than 7 days before ${shortDate(meeting.meetingDate)} · short notice (Sec 173(3))` : `Send by ${shortDate(meeting.dates.noticeSend)} · Sec 173(3)` },
    { ok: !meeting.dates.breaksGap, t: 'Within 120 days of the last board meeting', s: meeting.dates.lastMeetingDate ? `Last meeting ${shortDate(meeting.dates.lastMeetingDate)} · limit ${shortDate(meeting.dates.gapLimit!)}` : 'First board meeting of the company' },
    { ok: invited.size > 0 && missingEmail.length === 0, t: 'Every invited director has an email', s: missingEmail.length ? `No email: ${missingEmail.map((x) => x.name).join(', ')}` : `${invited.size} of ${directors.length} directors` },
    { ok: Boolean(d.signatoryDirectorId), t: 'A signatory director is chosen', s: directors.find((x) => x.id === d.signatoryDirectorId)?.name ?? 'None' },
    { ok: blanks.length === 0, t: 'No blank fields in the agenda', s: blanks.length ? blanks.join(', ') : 'All filled' },
  ];

  const busy = actions.patch.isPending || actions.submit.isPending || actions.approve.isPending || actions.sendBack.isPending;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <div className="flex min-w-0 flex-col gap-5">
        {meeting.reviewNote && meeting.status === 'draft' ? (
          <Banner tone="teal">
            <b className="font-medium">Sent back by the manager:</b> {meeting.reviewNote}
          </Banner>
        ) : null}
        {meeting.status === 'draft' && meeting.version === 1 && meeting.dates.lastMeetingNo && meeting.events.some((e) => /copied from/.test(e.label)) ? (
          <Banner tone="info">
            <b className="font-medium">Copied from the last meeting · {meeting.dates.lastMeetingNo}</b> — directors, time, mode, venue, CC list and agenda items. Change only what is new.
          </Banner>
        ) : null}
        {!editable && (meeting.status === 'draft' || meeting.status === 'pending_approval') ? (
          <Banner tone="info">
            <Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden /> The notice waits for the manager. Only the manager edits it now.
          </Banner>
        ) : null}

        <Card title="Meeting details" id="h-bm-details">
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Meeting">
              <select
                disabled={!editable}
                value={d.meetingType}
                onChange={(e) => set({ meetingType: e.target.value as MeetingType })}
                className="h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 text-[14px] text-ink"
              >
                {(Object.keys(TYPE_LABEL) as MeetingType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Meeting no. · automatic">
              <Input value={meeting.meetingNo} readOnly className="bg-surface-sunken font-mono text-[13px]" />
            </Field>
            <Field label="Date">
              <Input type="date" disabled={!editable} value={d.meetingDate} onChange={(e) => set({ meetingDate: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-2.5">
              <Field label="Time (IST)">
                <Input type="time" disabled={!editable} value={d.meetingTime} onChange={(e) => set({ meetingTime: e.target.value })} />
              </Field>
              <Field label="Also show in">
                <Input disabled={!editable} value={d.zoneLabel} onChange={(e) => set({ zoneLabel: e.target.value.toUpperCase() })} placeholder="MDT" maxLength={12} />
              </Field>
              <Field label="Time there">
                <Input type="time" disabled={!editable} value={d.zoneTime} onChange={(e) => set({ zoneTime: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-ink-muted">Mode</span>
              <div role="group" aria-label="Mode" className="inline-flex flex-wrap gap-0.5 self-start rounded-md bg-surface-sunken p-[3px]">
                {(['in_person', 'vc', 'hybrid'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!editable}
                    aria-pressed={d.mode === m}
                    onClick={() => set({ mode: m })}
                    className={cn('h-7 rounded-[4px] px-3 text-[13px] font-medium', d.mode === m ? 'bg-brand text-white' : 'text-ink-muted')}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
            <Field label={d.mode === 'vc' ? 'Deemed venue · registered office' : 'Venue'} className="sm:col-span-2">
              <Textarea disabled={!editable} rows={2} value={d.venue} onChange={(e) => set({ venue: e.target.value })} />
            </Field>
            <Field label="Teams link · made from the lead's Outlook on approval, or paste one" className="sm:col-span-2">
              <Input disabled={!editable || d.mode === 'in_person'} value={d.teamsLink} onChange={(e) => set({ teamsLink: e.target.value })} placeholder="https://teams.microsoft.com/…" />
            </Field>
            <div className={cn('rounded-md px-3 py-2.5 text-[13px] sm:col-span-2', meeting.dates.breaksGap ? 'bg-danger-soft text-danger' : 'bg-positive-soft text-positive')}>
              {meeting.dates.lastMeetingDate
                ? `Last board meeting ${shortDate(meeting.dates.lastMeetingDate)}. The next one must be held by ${shortDate(meeting.dates.gapLimit!)} (Sec 173(1)).`
                : 'This is the first board meeting of the company.'}{' '}
              Notice goes out {shortDate(meeting.dates.noticeSend)}, 7 days before.
            </div>
          </div>
        </Card>

        <Card
          title={`Directors · ${invited.size} of ${directors.length} invited`}
          id="h-bm-dirs"
          right={
            editable ? (
              <Button size="sm" variant="secondary" onClick={() => setNewDir({ name: '', din: '', email: '' })}>
                <Plus aria-hidden /> Add director
              </Button>
            ) : null
          }
        >
          {newDir ? (
            <div className="mx-5 mt-4 grid grid-cols-1 items-end gap-2.5 rounded-md border-1.5 border-line-strong bg-surface-sunken p-3.5 sm:grid-cols-4">
              <Field label="Name">
                <Input value={newDir.name} onChange={(e) => setNewDir({ ...newDir, name: e.target.value })} />
              </Field>
              <Field label="DIN">
                <Input value={newDir.din} onChange={(e) => setNewDir({ ...newDir, din: e.target.value })} inputMode="numeric" maxLength={8} />
              </Field>
              <Field label="Email">
                <Input value={newDir.email} onChange={(e) => setNewDir({ ...newDir, email: e.target.value })} type="email" />
              </Field>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setNewDir(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={directorActions.add.isPending}
                  onClick={async () => {
                    try {
                      const dir = await directorActions.add.mutateAsync({ engagementId: meeting.engagementId, name: newDir.name, din: newDir.din || null, email: newDir.email || null });
                      set({ recipients: [{ kind: 'to', directorId: dir.id, name: dir.name, email: dir.email, role: dir.designation }, ...d.recipients] });
                      setNewDir(null);
                      toastSaved('Director added', { kind: 'saved', sub: 'A DIR-12 filing task was created' });
                    } catch (e) {
                      toastError(errorMessage(e, 'Could not add the director'));
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[14px]">
              <thead>
                <tr className="h-9 bg-surface-sunken text-left text-[11.5px] font-medium uppercase tracking-[0.07em] text-ink-muted">
                  <th className="w-11 pl-5">
                    <span className="sr-only">Invite</span>
                  </th>
                  <th className="px-3">Director</th>
                  <th className="px-3">DIN</th>
                  <th className="px-3">Email</th>
                  <th className="pl-3 pr-5">Signs notice</th>
                </tr>
              </thead>
              <tbody>
                {directors.map((x) => (
                  <tr key={x.id} className={cn('h-14 border-t border-line-soft', !invited.has(x.id) && 'opacity-55')}>
                    <td className="pl-5">
                      <input type="checkbox" aria-label={`Invite ${x.name}`} disabled={!editable} checked={invited.has(x.id)} onChange={() => toggleDirector(x.id)} className="h-4 w-4 accent-[oklch(var(--brand))]" />
                    </td>
                    <td className="px-3">
                      <span className="flex flex-col leading-tight">
                        <span className="font-medium">{x.name}</span>
                        <span className="text-[12px] text-ink-muted">{x.designation}</span>
                      </span>
                    </td>
                    <td className="px-3 font-mono text-[12.5px] text-ink-2">{x.din ?? '—'}</td>
                    <td className={cn('px-3 text-[13px]', x.email ? 'text-ink-2' : 'text-danger')}>{x.email ?? 'No email on file'}</td>
                    <td className="pl-3 pr-5">
                      <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
                        <input type="radio" name="signatory" disabled={!editable} checked={d.signatoryDirectorId === x.id} onChange={() => set({ signatoryDirectorId: x.id })} className="h-4 w-4 accent-[oklch(var(--brand))]" />
                        Signatory
                      </label>
                    </td>
                  </tr>
                ))}
                {directors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-[13px] text-ink-muted">
                      No directors on file. Add one, or fill the directors in the incorporation checklist.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="m-0 border-t border-line-soft px-5 py-3 text-[13px] text-ink-muted">Current directors from the company record. A director who left before the meeting date does not show.</p>
        </Card>

        <Card
          title={`Agenda · ${d.agenda.length} items`}
          id="h-bm-agenda"
          right={
            editable ? (
              <Button size="sm" variant="secondary" onClick={() => setPicker(true)}>
                Pick from library
              </Button>
            ) : null
          }
        >
          <ol className="m-0 flex list-none flex-col gap-0.5 p-3">
            {d.agenda.map((a, i) => (
              <li key={a.key} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-2">
                <span className="pt-2 text-right font-mono text-[12px] text-ink-faint">{i + 1}</span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  {editable && splitPlaceholders(a.text).some((p) => p.blank) ? (
                    <Input
                      aria-label={`Agenda item ${i + 1}`}
                      value={a.text}
                      onChange={(e) => set({ agenda: d.agenda.map((x) => (x.key === a.key ? { ...x, text: e.target.value } : x)) })}
                      className="border-warning bg-warning-soft/40"
                    />
                  ) : (
                    <span className="pt-1.5 text-[14px]">
                      {splitPlaceholders(a.text).map((p, j) =>
                        p.blank ? (
                          <mark key={j} className="rounded-[3px] bg-warning-soft px-0.5 text-warning">
                            {p.text}
                          </mark>
                        ) : (
                          <span key={j}>{p.text}</span>
                        ),
                      )}
                    </span>
                  )}
                  {a.subs.map((s, j) => (
                    <span key={j} className="border-l-2 border-line-strong pl-2.5 text-[13px] text-ink-2">
                      {i + 1}.{j + 1} {s}
                    </span>
                  ))}
                </div>
                <span className="flex items-center gap-1 pt-1.5">
                  {a.fixed ? <Lock className="h-3.5 w-3.5 text-ink-faint" aria-label="Fixed item" /> : null}
                  {a.libraryId ? <span className="font-mono text-[11px] text-ink-faint">{a.libraryId}</span> : <Tag>Own</Tag>}
                </span>
              </li>
            ))}
          </ol>
          {blanks.length ? (
            <p className="m-0 border-t border-line-soft px-5 py-3 text-[13px] font-medium text-warning">
              {blanks.length === 1 ? '1 field' : `${blanks.length} fields`} to fill before you can send. Type over the orange text.
            </p>
          ) : null}
        </Card>

        <Card title="Who gets the notice" id="h-bm-who">
          <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 px-5 py-4">
            <span className="pt-1 text-[12px] font-medium text-ink-muted">To</span>
            <div className="flex flex-wrap gap-1.5">
              {d.recipients
                .filter((r) => r.kind === 'to')
                .map((r, i) => (
                  <span key={`${r.directorId ?? r.email}-${i}`} className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-surface-sunken px-2 text-[12.5px]">
                    {r.role && !r.directorId ? `${r.role} · ` : ''}
                    {r.name}
                    {editable && !r.directorId ? (
                      <button type="button" aria-label={`Remove ${r.name}`} onClick={() => set({ recipients: d.recipients.filter((x) => x !== r) })} className="text-ink-muted">
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    ) : null}
                  </span>
                ))}
              {nonDirectorTo.length === 0 ? <span className="text-[12.5px] text-ink-muted">Add the company secretary below.</span> : null}
            </div>
            <span className="pt-1 text-[12px] font-medium text-ink-muted">CC</span>
            <div className="flex flex-wrap gap-1.5">
              {ccList.map((r, i) => (
                <span key={`${r.email}-${i}`} className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-surface-sunken px-2 text-[12.5px]">
                  {r.role ? `${r.role} · ` : ''}
                  {r.name}
                  {editable ? (
                    <button type="button" aria-label={`Remove ${r.name}`} onClick={() => set({ recipients: d.recipients.filter((x) => x !== r) })} className="text-ink-muted">
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
            {editable ? (
              <>
                <span className="pt-2 text-[12px] font-medium text-ink-muted">Add</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <Input value={cc.name} onChange={(e) => setCc({ ...cc, name: e.target.value })} placeholder="Name" aria-label="Recipient name" className="h-9" />
                  <Input value={cc.email} onChange={(e) => setCc({ ...cc, email: e.target.value })} placeholder="Email" type="email" aria-label="Recipient email" className="h-9" />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!cc.email.trim()) return;
                      set({ recipients: [...d.recipients, { kind: 'to', directorId: null, name: cc.name.trim() || cc.email.trim(), email: cc.email.trim(), role: 'Company secretary' }] });
                      setCc({ name: '', email: '' });
                    }}
                  >
                    To · CS
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!cc.email.trim()) return;
                      set({ recipients: [...d.recipients, { kind: 'cc', directorId: null, name: cc.name.trim() || cc.email.trim(), email: cc.email.trim(), role: null }] });
                      setCc({ name: '', email: '' });
                    }}
                  >
                    + CC
                  </Button>
                </div>
              </>
            ) : null}
          </div>
          <p className="m-0 border-t border-line-soft px-5 py-3 text-[12.5px] text-ink-muted">The email attaches the notice (Word) and a calendar invite (.ics) with Outlook and Google buttons.</p>
        </Card>

        {managerView ? (
          <Card title="Checks" id="h-bm-checks" right={<Tag tone={checks.every((c) => c.ok) ? 'ok' : 'warn'}>{`${checks.filter((c) => c.ok).length} of ${checks.length} passed`}</Tag>}>
            <ul className="m-0 flex list-none flex-col px-5 py-2">
              {checks.map((c) => (
                <li key={c.t} className="flex items-start gap-2.5 border-b border-line-soft py-2 last:border-0">
                  <span className={cn('mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-[4px]', c.ok ? 'bg-positive-soft text-positive' : 'bg-warning-soft text-warning')}>
                    {c.ok ? <Check className="h-3 w-3" aria-hidden /> : '!'}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[14px]">{c.t}</span>
                    <span className="text-[12px] text-ink-muted">{c.s}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-4">
        <Card
          title={meeting.status === 'pending_approval' ? 'Notice to approve' : 'Preview'}
          id="h-bm-preview"
          right={
            <span className="flex flex-wrap gap-2">
              {editable ? (
                <Button
                  size="sm"
                  variant={editText ? 'soft' : 'secondary'}
                  onClick={() => {
                    if (!editText && !d.body) set({ body: meeting.notice.body });
                    setEditText((v) => !v);
                  }}
                >
                  <Pencil aria-hidden /> {editText ? 'Done editing' : 'Edit text'}
                </Button>
              ) : null}
              {editable && d.body ? (
                <Button size="sm" variant="quiet" onClick={() => set({ body: null })}>
                  Standard wording
                </Button>
              ) : null}
            </span>
          }
        >
          <NoticePreview meeting={meeting} editBody={editable && editText} body={d.body ?? undefined} onBody={(b) => set({ body: b })} />
          <div className="flex flex-wrap gap-2 border-t border-line-soft px-5 py-3">
            <Button size="sm" variant="secondary" asChild>
              <a href={`/api/board-meetings/${meeting.id}/notice`}>
                <Download aria-hidden /> Download Word
              </a>
            </Button>
            {dirty ? <span className="self-center text-[12px] text-warning">Unsaved changes · the preview updates after saving</span> : null}
          </div>
        </Card>

        {meeting.can.approve ? (
          <Card title="Your decision" id="h-bm-decision">
            <div className="flex flex-col gap-3 p-5">
              <Field label="Note to the lead · needed to send back">
                <Textarea
                  rows={3}
                  value={note}
                  aria-invalid={noteErr}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setNoteErr(false);
                  }}
                  placeholder="For example: add the agenda item on the ISIN application"
                />
              </Field>
              {noteErr ? <span className="text-[13px] text-danger">Write a note so the lead knows what to change.</span> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    if (!note.trim()) return setNoteErr(true);
                    try {
                      await actions.sendBack.mutateAsync(note.trim());
                      setNote('');
                      toastSaved('Sent back to the lead', { kind: 'saved' });
                    } catch (e) {
                      toastError(errorMessage(e, 'Could not send it back'));
                    }
                  }}
                >
                  Send back
                </Button>
                <Button
                  variant="strong"
                  disabled={busy || blanks.length > 0}
                  onClick={async () => {
                    if (!(await save(true))) return;
                    try {
                      await actions.approve.mutateAsync();
                      toastSaved('Approved · sending the notice', { kind: 'saved', sub: `Goes to ${invited.size} directors with the calendar invite; the bell confirms when it is out` });
                    } catch (e) {
                      toastError(errorMessage(e, 'Could not approve'));
                    }
                  }}
                >
                  <Send aria-hidden /> {meeting.version > 1 || dirty ? 'Approve my version and send' : 'Approve and send'}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {editable || meeting.can.submit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-line bg-surface px-5 py-3.5">
            <span className={cn('text-[13px]', blanks.length ? 'font-medium text-warning' : 'text-ink-2')}>
              {blanks.length ? `${blanks.length === 1 ? '1 field' : `${blanks.length} fields`} to fill before sending.` : meeting.can.submit ? 'The manager approves. Then VCFO emails the notice.' : 'Save your edits, then decide.'}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!dirty || busy} onClick={() => void save()}>
                {managerView ? 'Save edit' : 'Save draft'}
              </Button>
              {meeting.can.submit ? (
                <Button
                  disabled={busy || blanks.length > 0}
                  title={blanks.length ? 'Fill the highlighted fields first' : undefined}
                  onClick={async () => {
                    if (!(await save(true))) return;
                    try {
                      await actions.submit.mutateAsync();
                      toastSaved('Sent for approval', { kind: 'saved', sub: meeting.manager?.name ?? 'Manager' });
                    } catch (e) {
                      toastError(errorMessage(e, 'Could not send for approval'));
                    }
                  }}
                >
                  Send for approval
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <AgendaPickerDialog open={picker} onOpenChange={setPicker} meetingType={d.meetingType} agenda={d.agenda} engagementId={meeting.engagementId} onApply={(agenda) => set({ agenda })} />
    </div>
  );
}
