'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, History, Mail, PauseCircle, Settings2 } from 'lucide-react';
import { IconChip } from '@/components/common/IconChip';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Chip } from '@/components/ui/spectrum-chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { sheetDate } from '@/lib/receivables/dates';
import type { ReminderRules } from '@/lib/receivables/model';
import type { ManagerSheetDto, ReminderRowDto } from '@/lib/receivables/wire';
import { useOutlookStatus, useReminderActions, useReminderDesk, type useReceivablesActions } from '@/hooks/use-receivables';
import { inr } from '../format';

/**
 * The Reminders tab (Phase 5, polished in Phase 10): today's queue with Edit and Skip, the rules,
 * the Monday digest switch, the paused invoices and 14 days of history, each in a section card.
 * Reminders go to each invoice's client partner, from the manager's Outlook, at the send hour
 * (India time). The queue is a table from 768px and cards on a phone.
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
  if (r.status === 'failed')
    return (
      <Chip raw tone="bad" title={r.error ?? undefined}>
        Failed
      </Chip>
    );
  if (r.status === 'skipped') return <Chip raw tone="idle">Skipped</Chip>;
  if (!r.invoiceOpen) return <Chip raw tone="idle">Received, won’t send</Chip>;
  return <Chip raw tone="prog">Queued</Chip>;
}

function kindTone(kind: ReminderRowDto['kind']): 'bad' | 'warn' | 'prog' {
  return kind === 'overdue' ? 'bad' : kind === 'due' ? 'warn' : 'prog';
}

/** A tinted notice inside a card: soft tone ground, an icon tile and one sentence. */
function Notice({ tone, children }: { tone: 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px] ${tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info'}`} role="status">
      <IconChip icon={AlertTriangle} tone={tone} size="sm" className="bg-transparent" />
      <span className="pt-0.5">{children}</span>
    </div>
  );
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
  const toggles: Array<[string, boolean, (v: boolean) => void]> = [
    ['On the due date', onDue, setOnDue],
    ['Every day after the due date', daily, setDaily],
    ['Skip Saturdays and Sundays', weekends, setWeekends],
  ];
  return (
    <DashSection title="Rules" headIcon={{ icon: Settings2, tone: 'blue' }} meta="Each open invoice with a client partner">
      <div className="grid gap-4">
        <label className="flex items-center justify-between gap-4 rounded-md border border-line px-3 py-2.5">
          <span className="grid gap-0.5">
            <span className="text-[14px] font-medium">Send reminders to client partners</span>
            <span className="text-[12.5px] text-ink-muted">A reminder stops as soon as the invoice is marked received.</span>
          </span>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Send reminders to client partners" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Days before the due date" htmlFor="rcv-rule-days" error={badDays ? 'Whole days between 1 and 60, separated by commas.' : undefined} hint="For example: 5, 3">
            <Input id="rcv-rule-days" value={days} aria-invalid={badDays} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Field label="Send at (India time)" htmlFor="rcv-rule-hour" hint="The queue is ready an hour before.">
            <FilterSelect id="rcv-rule-hour" size="md" className="w-full [&>select]:w-full" value={String(hour)} onChange={(e) => setHour(Number(e.target.value))} options={HOURS.map((h) => ({ value: String(h), label: hourLabel(h) }))} />
          </Field>
        </div>
        <div className="grid gap-2 text-[13px]">
          {toggles.map(([label, value, set]) => (
            <label key={label} className="flex items-center gap-2.5">
              <input type="checkbox" className="h-4 w-4 accent-[oklch(var(--brand))]" checked={value} onChange={(e) => set(e.target.checked)} /> {label}
            </label>
          ))}
        </div>
        <div>
          <Button
            variant="secondary"
            disabled={busy || badDays}
            onClick={() =>
              onSave({
                enabled,
                daysBefore: [...new Set(parsed)].sort((a, b) => b - a),
                onDueDate: onDue,
                dailyAfterDue: daily,
                skipWeekends: weekends,
                sendHourIst: hour,
                // The digest switch lives in its own card; keep its value.
                digestEnabled: rules.digestEnabled !== false,
              })
            }
          >
            Save rules
          </Button>
        </div>
      </div>
    </DashSection>
  );
}

function DigestCard({ rules, onSave, busy, email }: { rules: ReminderRules; onSave: (r: ReminderRules) => void; busy: boolean; email: string | null }) {
  const on = rules.digestEnabled !== false;
  return (
    <DashSection title="Monday digest" headIcon={{ icon: Mail, tone: 'violet' }}>
      <label className="flex items-start justify-between gap-4">
        <span className="grid gap-1">
          <span className="text-[14px] font-medium">Email me a summary every Monday</span>
          <span className="text-[12.5px] leading-snug text-ink-muted">
            At 08:40 India time{email ? ` to ${email}` : ''}: collected last week, the five largest overdue invoices, promises and invoices due this week, reminders that failed, and
            changes waiting for an Update.
          </span>
        </span>
        <Switch
          checked={on}
          disabled={busy}
          aria-label="Monday digest email"
          onCheckedChange={(v) => onSave({ ...rules, digestEnabled: v })}
        />
      </label>
    </DashSection>
  );
}

function QueueCards({ queue, onEdit, onSkip }: { queue: ReminderRowDto[]; onEdit: (r: ReminderRowDto) => void; onSkip: (r: ReminderRowDto) => void }) {
  return (
    <ul className="md:hidden">
      {queue.map((r) => (
        <li key={r.id} className={`border-t border-line-soft px-4 py-3 first:border-t-0 ${r.status === 'skipped' ? 'opacity-60' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {r.clientName} <span className="font-mono text-[12px] text-ink-muted">{r.invoiceNo}</span>
              </div>
              <div className="truncate text-[12px] text-ink-muted">
                To {r.partnerName ?? '—'} · due {sheetDate(r.dueDate)}
              </div>
            </div>
            <span className="whitespace-nowrap font-medium tabular-nums">₹{inr(r.amountInr)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip raw tone={kindTone(r.kind)}>
              {r.label}
            </Chip>
            <StateChip r={r} />
          </div>
          {r.invoiceOpen && (r.status === 'queued' || r.status === 'skipped') ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" disabled={r.status === 'skipped'} onClick={() => onEdit(r)}>
                Edit
              </Button>
              <Button size="sm" variant="quiet" onClick={() => onSkip(r)}>
                {r.status === 'skipped' ? 'Undo skip' : 'Skip'}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
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
  const history = desk.data?.history ?? [];
  const pending = queue.filter((r) => r.status === 'queued' && r.invoiceOpen).length;
  const paused = data.invoices.filter((i) => i.status === 'open' && i.remindersPausedUntil && today && i.remindersPausedUntil >= today);
  const noPartner = data.invoices.filter((i) => i.status === 'open' && !i.partnerId).length;
  const failedRecent = history.filter((r) => r.status === 'failed').length;

  const off = !rules.enabled;

  const sendNow = () => {
    if (!window.confirm(`Send ${pending} reminder${pending === 1 ? '' : 's'} now instead of at ${hourLabel(rules.sendHourIst)}?`)) return;
    rem.sendNow.mutate(undefined, {
      onSuccess: (r) => (r.failed ? toastError(`${r.sent} sent, ${r.failed} failed`, 'See the reason on each row.') : toastSuccess(`${r.sent} reminder${r.sent === 1 ? '' : 's'} sent`)),
      onError: (e) => toastError('Not sent', errorText(e)),
    });
  };
  const skip = (r: ReminderRowDto) => rem.update.mutate({ id: r.id, skipped: r.status !== 'skipped' }, { onError: (e) => toastError('Not saved', errorText(e)) });
  const saveRules = (r: ReminderRules, done: string) => rem.saveRules.mutate(r, { onSuccess: () => toastSuccess(done), onError: (e) => toastError('Not saved', errorText(e)) });

  return (
    <div className="grid gap-4">
      <DashSection
        title="Today’s queue"
        headIcon={{ icon: BellRing, tone: 'blue' }}
        meta={`${off ? 'When on, sends' : 'Sends'} at ${hourLabel(rules.sendHourIst)} India time from ${outlook.data?.connected ? outlook.data.msEmail : 'SBC email'}`}
        right={
          <Button size="sm" onClick={sendNow} disabled={off || !pending || rem.sendNow.isPending}>
            {rem.sendNow.isPending ? 'Sending…' : pending ? `Send ${pending} now` : 'Send now'}
          </Button>
        }
        flush
      >
        {off || noPartner || !outlook.data?.connected ? (
          <div className="grid gap-2 border-b border-line-soft px-4 py-3 md:px-5">
            {off ? <Notice tone="warning">Reminders are off for this sheet, so nothing is queued or sent. Check that every invoice has the right client partner, then turn them on under Rules.</Notice> : null}
            {noPartner ? (
              <Notice tone="warning">
                {noPartner} open invoice{noPartner === 1 ? ' has' : 's have'} no client partner, so no reminder goes for {noPartner === 1 ? 'it' : 'them'}. Pick a partner on the Sheet tab.
              </Notice>
            ) : null}
            {!outlook.data?.connected && !off ? <Notice tone="info">Connect Outlook to send reminders from your own mailbox; until then they go from SBC email.</Notice> : null}
          </div>
        ) : null}
        {desk.isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={3} />
          </div>
        ) : queue.length === 0 ? (
          <div className="p-4">
            <EmptyState title={off ? 'Nothing is queued while reminders are off.' : 'No reminders due today.'} />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-[13px]">
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
                  {queue.map((r) => (
                    <tr key={r.id} className={r.status === 'skipped' ? 'opacity-60' : ''}>
                      <td className={TD}>
                        {r.partnerName ?? '—'}
                        <div className="text-[11.5px] text-ink-faint">{r.partnerEmail}</div>
                      </td>
                      <td className={TD}>
                        {r.clientName} <span className="font-mono text-[12px] text-ink-faint">{r.invoiceNo}</span>
                        {r.edited ? <span className="ml-1 text-[11.5px] text-ink-muted">· edited</span> : null}
                      </td>
                      <td className={TD}>
                        <Chip raw tone={kindTone(r.kind)}>
                          {r.label}
                        </Chip>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.dueDate)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{inr(r.amountInr)}</td>
                      <td className={TD}>
                        <StateChip r={r} />
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        {r.invoiceOpen && (r.status === 'queued' || r.status === 'skipped') ? (
                          <span className="inline-flex gap-1.5">
                            <Button size="sm" variant="secondary" disabled={r.status === 'skipped'} onClick={() => setEditing(r)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="quiet" onClick={() => skip(r)}>
                              {r.status === 'skipped' ? 'Undo skip' : 'Skip'}
                            </Button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <QueueCards queue={queue} onEdit={setEditing} onSkip={skip} />
          </>
        )}
      </DashSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <RulesCard rules={rules} busy={rem.saveRules.isPending} onSave={(r) => saveRules(r, 'Rules saved')} />
        <div className="grid content-start gap-4">
          <DigestCard
            rules={rules}
            busy={rem.saveRules.isPending}
            email={outlook.data?.connected ? outlook.data.msEmail : null}
            onSave={(r) => saveRules(r, r.digestEnabled === false ? 'Monday digest off' : 'Monday digest on')}
          />
          <DashSection title="Paused" headIcon={{ icon: PauseCircle, tone: 'amber' }} meta={paused.length ? `${paused.length} invoice${paused.length === 1 ? '' : 's'}` : undefined} flush>
            {paused.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nothing paused. Use Pause on a sheet row when a client promises a date." />
              </div>
            ) : (
              <ul>
                {paused.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5 text-[13px] first:border-t-0 md:px-5">
                    <div className="min-w-0">
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
          </DashSection>
        </div>
      </div>

      <DashSection
        title="History"
        headIcon={{ icon: History, tone: 'teal' }}
        meta={`Last 14 days${history.length ? ` · ${history.length} sent or tried` : ''}${failedRecent ? ` · ${failedRecent} failed` : ''}`}
        flush
      >
        {history.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No reminders in the last 14 days." />
          </div>
        ) : (
          <ul>
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5 text-[13px] first:border-t-0 md:px-5">
                <div className="min-w-0">
                  {r.clientName} {r.invoiceNo ? <span className="font-mono text-[12px] text-ink-faint">{r.invoiceNo}</span> : null} · {r.label}
                  <div className="text-[12px] text-ink-muted">
                    {sheetDate(r.forDate)} · {r.partnerEmail ?? 'no email'}
                    {r.status === 'failed' && r.error ? <span className="text-danger"> · {r.error}</span> : null}
                  </div>
                </div>
                <StateChip r={r} />
              </li>
            ))}
          </ul>
        )}
      </DashSection>

      {editing ? (
        <EditReminder
          r={editing}
          busy={rem.update.isPending}
          onClose={() => setEditing(null)}
          onReset={() => rem.update.mutate({ id: editing.id, subject: null, body: null }, { onSuccess: () => setEditing(null), onError: (e) => toastError('Not saved', errorText(e)) })}
          onSave={(v) => rem.update.mutate({ id: editing.id, ...v }, { onSuccess: () => (setEditing(null), toastSuccess('Saved for today')), onError: (e) => toastError('Not saved', errorText(e)) })}
        />
      ) : null}
    </div>
  );
}
