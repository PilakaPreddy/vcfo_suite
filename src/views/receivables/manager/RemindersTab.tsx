'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { sheetDate } from '@/lib/receivables/dates';
import type { ReminderRules } from '@/lib/receivables/model';
import type { ManagerSheetDto, ReminderRowDto } from '@/lib/receivables/wire';
import { useOutlookStatus, useReminderActions, useReminderDesk, type useReceivablesActions } from '@/hooks/use-receivables';
import { inr } from '../format';

/**
 * The Reminders tab (Phase 5): today's queue with Edit and Skip, the rules, the paused invoices
 * and 14 days of history. Reminders go to each invoice's client partner, from the manager's
 * Outlook, at the send hour (India time).
 */

const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2.5 py-2 align-middle';
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6);

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

function hourLabel(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

function StateChip({ r }: { r: ReminderRowDto }) {
  if (r.status === 'sent') return <Chip raw tone="ok">{r.channel === 'email' ? 'Sent (SBC email)' : 'Sent'}</Chip>;
  if (r.status === 'failed') return <Chip raw tone="bad" title={r.error ?? undefined}>{'Failed'}</Chip>;
  if (r.status === 'skipped') return <Chip raw tone="idle">Skipped</Chip>;
  if (!r.invoiceOpen) return <Chip raw tone="idle">Received, won’t send</Chip>;
  return <Chip raw tone="prog">Queued</Chip>;
}

function kindTone(kind: ReminderRowDto['kind']): 'bad' | 'warn' | 'prog' {
  return kind === 'overdue' ? 'bad' : kind === 'due' ? 'warn' : 'prog';
}

function EditReminder({ r, onClose, onSave, onReset, busy }: { r: ReminderRowDto; onClose: () => void; onSave: (v: { subject: string; body: string }) => void; onReset: () => void; busy: boolean }) {
  const [subject, setSubject] = useState(r.subject);
  const [body, setBody] = useState(r.body);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit today’s reminder"
      sub={`To ${r.partnerName ?? '—'} <${r.partnerEmail ?? 'no email'}> · ${r.clientName}${r.invoiceNo ? ` ${r.invoiceNo}` : ''}`}
      size="md"
      footer={
        <>
          {r.edited ? (
            <Button variant="quiet" className="mr-auto" disabled={busy} onClick={onReset}>
              Use the standard text
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !subject.trim() || !body.trim()} onClick={() => onSave({ subject, body })}>
            Save for today
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Subject" htmlFor="rcv-rem-subject">
          <Input id="rcv-rem-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" htmlFor="rcv-rem-body" hint="Only today's reminder changes. Tomorrow's uses the standard text again.">
          <Textarea id="rcv-rem-body" rows={10} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RulesCard({ rules, onSave, busy }: { rules: ReminderRules; onSave: (r: ReminderRules) => void; busy: boolean }) {
  const [enabled, setEnabled] = useState(Boolean(rules.enabled));
  const [days, setDays] = useState(rules.daysBefore.join(', '));
  const [onDue, setOnDue] = useState(rules.onDueDate);
  const [daily, setDaily] = useState(rules.dailyAfterDue);
  const [weekends, setWeekends] = useState(rules.skipWeekends);
  const [hour, setHour] = useState(rules.sendHourIst);
  useEffect(() => {
    setEnabled(Boolean(rules.enabled));
    setDays(rules.daysBefore.join(', '));
    setOnDue(rules.onDueDate);
    setDaily(rules.dailyAfterDue);
    setWeekends(rules.skipWeekends);
    setHour(rules.sendHourIst);
  }, [rules]);
  const parsed = days
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const badDays = parsed.some((d) => !Number.isInteger(d) || d < 1 || d > 60);
  return (
    <section className="mb-4 rounded-md border border-line bg-surface-raised p-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">Rules</h2>
      <p className="mt-1 text-[13px] text-ink-muted">Each open invoice with a client partner gets a reminder on these days. It stops as soon as the invoice is marked received.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Days before the due date" htmlFor="rcv-rule-days" error={badDays ? 'Whole days between 1 and 60, separated by commas.' : undefined} hint="For example: 5, 3">
          <Input id="rcv-rule-days" value={days} aria-invalid={badDays} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label="Send at (India time)" htmlFor="rcv-rule-hour" hint="The queue is ready an hour before.">
          <select id="rcv-rule-hour" className="h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px]" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-1 grid gap-2 text-[13px]">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Send reminders to client partners
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onDue} onChange={(e) => setOnDue(e.target.checked)} /> On the due date
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} /> Every day after the due date
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={weekends} onChange={(e) => setWeekends(e.target.checked)} /> Skip Saturdays and Sundays
        </label>
      </div>
      <div className="mt-3">
        <Button variant="secondary" disabled={busy || badDays} onClick={() => onSave({ enabled, daysBefore: [...new Set(parsed)].sort((a, b) => b - a), onDueDate: onDue, dailyAfterDue: daily, skipWeekends: weekends, sendHourIst: hour })}>
          Save rules
        </Button>
      </div>
    </section>
  );
}

export function RemindersTab({ data, actions }: { data: ManagerSheetDto; actions: ReturnType<typeof useReceivablesActions> }) {
  const desk = useReminderDesk(data.sheet.id);
  const rem = useReminderActions(data.sheet.id);
  const outlook = useOutlookStatus();
  const [editing, setEditing] = useState<ReminderRowDto | null>(null);
  const rules = desk.data?.rules ?? data.sheet.reminderRules;
  const today = desk.data?.today;
  const queue = desk.data?.queue ?? [];
  const pending = queue.filter((r) => r.status === 'queued' && r.invoiceOpen).length;
  const paused = data.invoices.filter((i) => i.status === 'open' && i.remindersPausedUntil && today && i.remindersPausedUntil >= today);
  const noPartner = data.invoices.filter((i) => i.status === 'open' && !i.partnerId).length;

  const off = !rules.enabled;

  const sendNow = () => {
    if (!window.confirm(`Send ${pending} reminder${pending === 1 ? '' : 's'} now instead of at ${hourLabel(rules.sendHourIst)}?`)) return;
    rem.sendNow.mutate(undefined, {
      onSuccess: (r) => (r.failed ? toastError(`${r.sent} sent, ${r.failed} failed`, 'See the reason on each row.') : toastSuccess(`${r.sent} reminder${r.sent === 1 ? '' : 's'} sent`)),
      onError: (e) => toastError('Not sent', errorText(e)),
    });
  };

  return (
    <>
      <section className="mb-4 rounded-md border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">Today’s queue</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {off ? 'When on, it sends' : 'Sends'} on its own at {hourLabel(rules.sendHourIst)} India time from {outlook.data?.connected ? outlook.data.msEmail : 'SBC email (connect Outlook to send from your mailbox)'}. Edit or skip any reminder before then.
            </p>
          </div>
          <Button onClick={sendNow} disabled={off || !pending || rem.sendNow.isPending}>
            {rem.sendNow.isPending ? 'Sending…' : 'Send now'}
          </Button>
        </div>
        {off ? (
          <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
            Reminders are off for this sheet, so nothing is queued or sent. Check that every invoice has the right client partner, then turn them on under Rules.
          </p>
        ) : null}
        {noPartner ? <p className="mt-2 text-[12.5px] text-warning">{noPartner} open invoice{noPartner === 1 ? ' has' : 's have'} no client partner, so no reminder goes for {noPartner === 1 ? 'it' : 'them'}. Pick a partner on the Sheet tab.</p> : null}
      </section>

      <div className="relative mb-4 overflow-x-auto rounded-md border border-line bg-surface-raised">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>To (client partner)</th>
              <th className={TH}>Client · invoice</th>
              <th className={TH}>Reminder</th>
              <th className={TH}>Due date</th>
              <th className={`${TH} text-right`}>Amount INR</th>
              <th className={TH}>State</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {desk.isLoading ? (
              <tr>
                <td colSpan={7} className={`${TD} text-ink-muted`}>
                  Loading…
                </td>
              </tr>
            ) : queue.length === 0 ? (
              <tr>
                <td colSpan={7} className={`${TD} text-ink-muted`}>
                  No reminders due today.
                </td>
              </tr>
            ) : (
              queue.map((r) => (
                <tr key={r.id} className={r.status === 'skipped' ? 'opacity-60' : ''}>
                  <td className={TD}>
                    {r.partnerName ?? '—'}
                    <div className="text-[11px] text-ink-faint">{r.partnerEmail}</div>
                  </td>
                  <td className={TD}>
                    {r.clientName} <span className="font-mono text-[12px] text-ink-faint">{r.invoiceNo}</span>
                    {r.edited ? <span className="ml-1 text-[11px] text-ink-muted">· edited</span> : null}
                  </td>
                  <td className={TD}>
                    <Chip raw tone={kindTone(r.kind)}>
                      {r.label}
                    </Chip>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.dueDate)}</td>
                  <td className={`${TD} text-right font-mono text-[12px]`}>{inr(r.amountInr)}</td>
                  <td className={TD}>
                    <StateChip r={r} />
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {r.invoiceOpen && (r.status === 'queued' || r.status === 'skipped') ? (
                      <>
                        <Button size="sm" variant="secondary" disabled={r.status === 'skipped'} onClick={() => setEditing(r)}>
                          Edit
                        </Button>{' '}
                        <Button size="sm" variant="quiet" onClick={() => rem.update.mutate({ id: r.id, skipped: r.status !== 'skipped' }, { onError: (e) => toastError('Not saved', errorText(e)) })}>
                          {r.status === 'skipped' ? 'Undo skip' : 'Skip'}
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <RulesCard
        rules={rules}
        busy={rem.saveRules.isPending}
        onSave={(r) => rem.saveRules.mutate(r, { onSuccess: () => toastSuccess('Rules saved', 'They apply from the next queue.'), onError: (e) => toastError('Not saved', errorText(e)) })}
      />

      <section className="mb-4 rounded-md border border-line bg-surface-raised p-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">Paused</h2>
        {paused.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-muted">Nothing paused. Use Pause on a sheet row when a client promises a date.</p>
        ) : (
          <ul className="mt-2">
            {paused.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2 first:border-t-0">
                <div>
                  {i.clientName} <span className="font-mono text-[12px] text-ink-faint">{i.invoiceNo}</span>
                  <div className="text-[12px] text-ink-muted">
                    Until {sheetDate(i.remindersPausedUntil)}
                    {i.pauseReason ? ` · ${i.pauseReason}` : ''}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => actions.pause.mutate({ id: i.id, until: null }, { onSuccess: () => toastSuccess('Reminders resumed'), onError: (e) => toastError('Not saved', errorText(e)) })}>
                  Resume
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-line bg-surface-raised p-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">History · last 14 days</h2>
        {(desk.data?.history ?? []).length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-muted">No reminders yet.</p>
        ) : (
          <ul className="mt-2">
            {desk.data!.history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2 first:border-t-0">
                <div>
                  {r.clientName} {r.invoiceNo ? <span className="font-mono text-[12px] text-ink-faint">{r.invoiceNo}</span> : null} · {r.label}
                  <div className="text-[12px] text-ink-muted">
                    {sheetDate(r.forDate)} · {r.partnerEmail ?? 'no email'}
                    {r.status === 'failed' && r.error ? ` · ${r.error}` : ''}
                  </div>
                </div>
                <StateChip r={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <EditReminder
          r={editing}
          busy={rem.update.isPending}
          onClose={() => setEditing(null)}
          onReset={() => rem.update.mutate({ id: editing.id, subject: null, body: null }, { onSuccess: () => setEditing(null), onError: (e) => toastError('Not saved', errorText(e)) })}
          onSave={(v) => rem.update.mutate({ id: editing.id, ...v }, { onSuccess: () => (setEditing(null), toastSuccess('Saved for today')), onError: (e) => toastError('Not saved', errorText(e)) })}
        />
      ) : null}
    </>
  );
}
