'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { addDaysIso, sheetDate } from '@/lib/receivables/dates';
import type { PartnerReminderDto } from '@/lib/receivables/partner-wire';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { usePartnerInvoice, usePartnerInvoiceActions } from '@/hooks/use-receivables-partner';
import { inr, stamp } from '../format';
import { StatusChip } from '../StatusChip';

/**
 * One invoice's details for the signed-in client partner: amount, due date and status, the
 * reminders sent, the current pause, the Promise form (pauses reminders to that date and tells
 * SBC) and the notes shared with SBC.
 */

export type InvoiceDetailsProps = {
  invoiceId: string;
  today: string;
  onClose: () => void;
};

/** The server's cap (PARTNER_NOTE_MAX in the partner portal repository). */
const NOTE_MAX = 2000;
/** The furthest promise date the server takes. */
const PROMISE_MAX_DAYS = 366;

const REMINDER_STATUS: Record<PartnerReminderDto['status'], { text: string; tone: 'ok' | 'bad' | 'warn' | 'idle' }> = {
  sent: { text: 'Sent', tone: 'ok' },
  queued: { text: 'Queued', tone: 'idle' },
  skipped: { text: 'Skipped', tone: 'idle' },
  failed: { text: 'Not delivered', tone: 'bad' },
};

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-[12px] font-semibold uppercase tracking-[.04em] text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

export function InvoiceDetails({ invoiceId, today, onClose }: InvoiceDetailsProps) {
  const q = usePartnerInvoice(invoiceId);
  const actions = usePartnerInvoiceActions(invoiceId);
  const [promisedOn, setPromisedOn] = useState('');
  const [promiseNote, setPromiseNote] = useState('');
  const [note, setNote] = useState('');

  const d = q.data;
  const row = d?.row;
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
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      eyebrow="Invoice details"
      title={row ? `${row.clientName}${row.invoiceNo ? ` · ${row.invoiceNo}` : ''}` : 'Invoice'}
      sub={row ? <StatusChip invoice={row} today={today} /> : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {q.isPending ? (
        <p className="py-6 text-center text-[13px] text-ink-muted">Loading…</p>
      ) : q.isError || !d || !row ? (
        <p role="alert" className="py-6 text-center text-[13px] text-ink-2">
          {q.error instanceof Error ? q.error.message : 'This invoice did not load.'}
        </p>
      ) : (
        <div className="grid gap-4">
          <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[12px] text-ink-muted">Amount INR</dt>
              <dd className="font-mono text-[15px] font-medium">₹{inr(row.amountInr)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Due date</dt>
              <dd>{sheetDate(row.dueDate)}</dd>
            </div>
            {row.promisedOn ? (
              <div>
                <dt className="text-[12px] text-ink-muted">Promised by</dt>
                <dd>{sheetDate(row.promisedOn)}</dd>
              </div>
            ) : null}
            {row.status === 'received' && row.paidOn ? (
              <div>
                <dt className="text-[12px] text-ink-muted">Paid on</dt>
                <dd>{sheetDate(row.paidOn)}</dd>
              </div>
            ) : null}
          </dl>

          <Section title="Reminders">
            {d.pause ? (
              <p className="text-[13px] text-ink-2">
                Paused until {sheetDate(d.pause.until)}
                {d.pause.reason ? <span className="text-ink-muted"> · {d.pause.reason}</span> : null}
              </p>
            ) : null}
            {d.reminders.length ? (
              <ul className="grid gap-1.5 text-[13px]">
                {d.reminders.map((r) => {
                  const s = REMINDER_STATUS[r.status];
                  return (
                    <li key={`${r.forDate}-${r.label}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="w-[76px] flex-none whitespace-nowrap">{sheetDate(r.forDate)}</span>
                      <span className="min-w-0 flex-1 text-ink-2">{r.label}</span>
                      <Chip raw tone={s.tone}>
                        {s.text}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-muted">No reminders have gone for this invoice yet.</p>
            )}
          </Section>

          {open ? (
            <Section title="Client promised payment">
              <p className="text-[12.5px] text-ink-muted">
                {row.promisedOn ? `The client promised payment by ${sheetDate(row.promisedOn)}. Pick a new date to change it. ` : ''}
                Reminders pause until this date and SBC sees it.
              </p>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <Field label="Promised by" htmlFor="rcv-promise-date" error={badDate ? 'Pick a date from today to a year ahead.' : undefined}>
                  <Input id="rcv-promise-date" type="date" value={promisedOn} min={today} max={latest} aria-invalid={badDate} onChange={(e) => setPromisedOn(e.target.value)} />
                </Field>
                <Field label="Note" htmlFor="rcv-promise-note" hint="Optional.">
                  <Input id="rcv-promise-note" value={promiseNote} maxLength={NOTE_MAX} onChange={(e) => setPromiseNote(e.target.value)} />
                </Field>
              </div>
              <div>
                <Button size="sm" disabled={!promisedOn || badDate || actions.promise.isPending} onClick={sendPromise}>
                  {actions.promise.isPending ? 'Saving…' : row.promisedOn ? 'Change promise' : 'Save promise'}
                </Button>
              </div>
            </Section>
          ) : null}

          <Section title="Notes">
            {d.notes.length ? (
              <ul className="grid gap-2.5">
                {d.notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-line-soft px-3 py-2 text-[13px]">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                      <span className="font-medium text-ink-2">{n.authorName}</span>
                      {n.fromSbc ? <Tag>SBC</Tag> : null}
                      <span>{stamp(n.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{n.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-muted">No notes yet.</p>
            )}
            <Field label="Note to SBC" htmlFor="rcv-note" hint={`${note.length} of ${NOTE_MAX} characters.`}>
              <Textarea id="rcv-note" value={note} maxLength={NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div>
              <Button size="sm" variant="secondary" disabled={!noteText || actions.addNote.isPending} onClick={sendNote}>
                {actions.addNote.isPending ? 'Adding…' : 'Add note'}
              </Button>
            </div>
          </Section>
        </div>
      )}
    </Modal>
  );
}
