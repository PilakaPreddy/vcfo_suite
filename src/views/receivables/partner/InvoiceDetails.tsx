'use client';

import { useState } from 'react';
import { CalendarCheck2, MessageSquare } from 'lucide-react';
import { IconChip } from '@/components/common/IconChip';
import { Thread, type ThreadStep } from '@/components/dash/thread';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PanelSection, SidePanel } from '@/components/ui/side-panel';
import { Chip, OwnerChip } from '@/components/ui/spectrum-chip';
import { Textarea } from '@/components/ui/textarea';
import { addDaysIso, daysLeft, sheetDate } from '@/lib/receivables/dates';
import type { PartnerInvoiceDetailDto, PartnerReminderDto, PartnerRowDto } from '@/lib/receivables/partner-wire';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { usePartnerInvoice, usePartnerInvoiceActions } from '@/hooks/use-receivables-partner';
import { fcText, inr, stamp } from '../format';
import { StatusChip } from '../StatusChip';

/**
 * One invoice's details for the signed-in client partner, in the right-hand drawer (SidePanel):
 * amount, due date and status; the promise to pay (pauses reminders to that date and tells SBC);
 * the notes thread, SBC's replies on the left in the SBC colour and the partner's own on the
 * right; and the reminder timeline (step marks: sent, not delivered, skipped, then the promise
 * and the due date).
 */

export type InvoiceDetailsProps = {
  invoiceId: string;
  today: string;
  /** The row from the list, shown in the head while the details load. */
  preview?: PartnerRowDto;
  onClose: () => void;
};

/** The server's cap (PARTNER_NOTE_MAX in the partner portal repository). */
const NOTE_MAX = 2000;
/** The furthest promise date the server takes. */
const PROMISE_MAX_DAYS = 366;

const REMINDER_NOTE: Record<PartnerReminderDto['status'], string> = {
  sent: 'Emailed to you',
  queued: 'Queued',
  skipped: 'Skipped by SBC',
  failed: 'Not delivered',
};

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

/** The reminder timeline, oldest first: each reminder, then the promise and the due date where they fall. */
export function reminderSteps(d: PartnerInvoiceDetailDto, today: string): ThreadStep[] {
  const steps: Array<ThreadStep & { at: string }> = [...d.reminders]
    .sort((a, b) => a.forDate.localeCompare(b.forDate))
    .map((r, i) => ({
      id: `r-${r.forDate}-${i}`,
      at: r.forDate,
      title: r.label,
      state: r.status === 'sent' ? 'done' : r.status === 'failed' ? 'current' : 'upcoming',
      // Dates in the sheet's own format (dd-Mon-yy) in the note line, not the thread's long form.
      note: `${sheetDate(r.forDate)} · ${REMINDER_NOTE[r.status]}`,
    }));
  const row = d.row;
  if (row.status === 'open') {
    steps.push({
      id: 'due',
      at: row.dueDate,
      title: daysLeft(row.dueDate, today) < 0 ? 'Due date passed' : 'Due date',
      state: row.dueDate <= today ? 'done' : 'upcoming',
      note: sheetDate(row.dueDate),
    });
    if (row.promisedOn)
      steps.push({ id: 'promise', at: row.promisedOn, title: 'Promised payment', state: 'current', note: `${sheetDate(row.promisedOn)} · reminders pause until then` });
  } else if (row.paidOn) {
    steps.push({ id: 'paid', at: row.paidOn, title: 'Received', state: 'done', note: `${sheetDate(row.paidOn)}${row.paidAmount ? ` · ₹${inr(row.paidAmount)}` : ''}` });
  }
  return steps.sort((a, b) => a.at.localeCompare(b.at)).map(({ at: _at, ...s }) => s);
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] font-medium tabular-nums text-ink">{children}</dd>
    </div>
  );
}

export function InvoiceDetails({ invoiceId, today, preview, onClose }: InvoiceDetailsProps) {
  const q = usePartnerInvoice(invoiceId);
  const actions = usePartnerInvoiceActions(invoiceId);
  const [promisedOn, setPromisedOn] = useState('');
  const [promiseNote, setPromiseNote] = useState('');
  const [note, setNote] = useState('');

  const d = q.data;
  const row = d?.row;
  const head = row ?? preview;
  const open = row?.status === 'open';
  const latest = addDaysIso(today, PROMISE_MAX_DAYS);
  const badDate = Boolean(promisedOn) && (promisedOn < today || promisedOn > latest);
  const noteText = note.trim();

  const sendPromise = () =>
    actions.promise.mutate(
      { promisedOn, ...(promiseNote.trim() ? { note: promiseNote.trim() } : {}) },
      {
        onSuccess: () => {
          toastSuccess('Promise saved', `Reminders pause until ${sheetDate(promisedOn)}.`);
          setPromisedOn('');
          setPromiseNote('');
        },
        onError: (e) => toastError('Promise not saved', errorText(e)),
      },
    );

  const sendNote = () =>
    actions.addNote.mutate(noteText, {
      onSuccess: () => {
        toastSuccess('Note added', 'SBC can see it now.');
        setNote('');
      },
      onError: (e) => toastError('Note not added', errorText(e)),
    });

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      width={480}
      eyebrow="Invoice details"
      title={head ? `${head.clientName}${head.invoiceNo ? ` · ${head.invoiceNo}` : ''}` : 'Invoice'}
      sub={
        head ? (
          <>
            <StatusChip invoice={head} today={today} />
            {head.promisedOn && head.status === 'open' ? <Chip raw tone="teal">{`Promised ${sheetDate(head.promisedOn)}`}</Chip> : null}
            {d?.pause && !head.promisedOn ? <Chip raw tone="idle">{`Paused to ${sheetDate(d.pause.until)}`}</Chip> : null}
          </>
        ) : undefined
      }
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {q.isPending ? (
        <div className="p-5">
          <SkeletonRows rows={4} />
        </div>
      ) : q.isError || !d || !row ? (
        <p role="alert" className="px-5 py-8 text-center text-[13px] text-ink-2">
          {q.error instanceof Error ? q.error.message : 'This invoice did not load.'}
        </p>
      ) : (
        <>
          <PanelSection>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Amount INR">₹{inr(row.amountInr)}</Fact>
              {fcText(row) ? <Fact label={`Amount ${row.currency}`}>{fcText(row)}</Fact> : null}
              <Fact label="Due date">{sheetDate(row.dueDate)}</Fact>
              {row.partPaid > 0 ? <Fact label="Part paid">₹{inr(row.partPaid)}</Fact> : null}
              {row.status === 'received' && row.paidOn ? <Fact label="Paid on">{sheetDate(row.paidOn)}</Fact> : null}
              {row.status === 'received' && (fcText(row, row.receivedFc) || row.paidAmount) ? (
                <Fact label="Received">{fcText(row, row.receivedFc) ?? `₹${inr(row.paidAmount)}`}</Fact>
              ) : null}
            </dl>
          </PanelSection>

          {open ? (
            <PanelSection title="Promise to pay">
              <div className="mb-3 flex items-start gap-3">
                <IconChip icon={CalendarCheck2} tone={row.promisedOn ? 'info' : 'neutral'} size="sm" />
                <p className="text-[13px] text-ink-2">
                  {row.promisedOn ? (
                    <>
                      The client promised payment by <b className="font-medium text-ink">{sheetDate(row.promisedOn)}</b>. Pick a new date to change it.
                    </>
                  ) : (
                    'When the client tells you a payment date, save it here. Reminders pause until then and SBC sees it.'
                  )}
                </p>
              </div>
              <div className="grid gap-3">
                <Field label="Promised by" htmlFor="rcv-promise-date" error={badDate ? 'Pick a date from today to a year ahead.' : undefined}>
                  <Input id="rcv-promise-date" type="date" value={promisedOn} min={today} max={latest} aria-invalid={badDate} onChange={(e) => setPromisedOn(e.target.value)} />
                </Field>
                <Field label="Note" htmlFor="rcv-promise-note" hint="Optional.">
                  <Input id="rcv-promise-note" value={promiseNote} maxLength={NOTE_MAX} onChange={(e) => setPromiseNote(e.target.value)} />
                </Field>
              </div>
              <div className="mt-3">
                <Button size="sm" disabled={!promisedOn || badDate || actions.promise.isPending} onClick={sendPromise}>
                  {actions.promise.isPending ? 'Saving…' : row.promisedOn ? 'Change promise' : 'Save promise'}
                </Button>
              </div>
            </PanelSection>
          ) : null}

          <PanelSection title={`Notes${d.notes.length ? ` · ${d.notes.length}` : ''}`}>
            {d.notes.length ? (
              <ul className="mb-3 grid gap-2.5" aria-label="Notes">
                {d.notes.map((n) => (
                  <li key={n.id} className={cn('flex', n.fromSbc ? 'justify-start' : 'justify-end')}>
                    <div
                      className={cn(
                        'max-w-[88%] rounded-md border px-3 py-2 text-[13px]',
                        n.fromSbc ? 'border-owner-sbc-soft bg-owner-sbc-soft/60' : 'border-line bg-surface-sunken',
                      )}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                        {n.fromSbc ? <OwnerChip owner="sbc" className="h-5 w-auto px-2 text-[11.5px]" /> : null}
                        <span className="font-medium text-ink-2">{n.fromSbc ? n.authorName : 'You'}</span>
                        <span>{stamp(n.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-ink">{n.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mb-3 flex items-center gap-2.5 text-[13px] text-ink-muted">
                <IconChip icon={MessageSquare} size="sm" /> No notes yet. Ask SBC a question or tell them what the client said.
              </div>
            )}
            <Field label="Note to SBC" htmlFor="rcv-note" hint={`${note.length} of ${NOTE_MAX} characters.`}>
              <Textarea id="rcv-note" value={note} maxLength={NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="mt-3">
              <Button size="sm" variant="secondary" disabled={!noteText || actions.addNote.isPending} onClick={sendNote}>
                {actions.addNote.isPending ? 'Adding…' : 'Add note'}
              </Button>
            </div>
          </PanelSection>

          <PanelSection title="Reminders">
            {d.pause ? (
              <p className="mb-3 text-[13px] text-ink-2">
                Paused until {sheetDate(d.pause.until)}
                {d.pause.reason ? <span className="text-ink-muted"> · {d.pause.reason}</span> : null}
              </p>
            ) : null}
            {d.reminders.length === 0 ? <p className="mb-3 text-[13px] text-ink-muted">No reminders have gone for this invoice yet.</p> : null}
            <Thread steps={reminderSteps(d, today)} />
          </PanelSection>
        </>
      )}
    </SidePanel>
  );
}
