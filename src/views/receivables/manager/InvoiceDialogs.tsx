'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { addDaysIso, monthLong, sheetDate } from '@/lib/receivables/dates';
import type { InvoiceInput, Partner, SheetInvoice } from '@/lib/receivables/model';
import { inr, parseInr } from '../format';

/** The three dialogs of the Sheet tab: Mark received, Pause reminders and Add invoice. */

type Busy = { busy: boolean; error: string | null };

export function MarkReceivedDialog({
  invoice,
  partnerName,
  today,
  onClose,
  onSave,
  state,
}: {
  invoice: SheetInvoice;
  partnerName: string;
  today: string;
  onClose: () => void;
  onSave: (input: { paidOn: string; amount: number; part: boolean }) => void;
  state: Busy;
}) {
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(inr(invoice.amountInr));
  const [part, setPart] = useState(false);
  const value = parseInr(amount);
  const bad = !(value > 0);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Mark received · ${invoice.clientName}${invoice.invoiceNo ? ` ${invoice.invoiceNo}` : ''}`}
      sub={`₹${inr(invoice.amountInr)} due ${sheetDate(invoice.dueDate)} · ${partnerName}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={bad || state.busy} onClick={() => onSave({ paidOn, amount: value, part })}>
            {state.busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Paid on" htmlFor="rcv-paid-on">
          <Input id="rcv-paid-on" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Amount received (INR)" htmlFor="rcv-amount" error={bad ? 'Enter an amount above zero.' : undefined}>
          <Input id="rcv-amount" inputMode="numeric" value={amount} aria-invalid={bad} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
        </Field>
        <fieldset className="grid gap-2 text-[13px]">
          <legend className="sr-only">Payment kind</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="rcv-kind" checked={!part} onChange={() => setPart(false)} /> Full payment
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="rcv-kind" checked={part} onChange={() => setPart(true)} /> Part payment, keep the balance open
          </label>
        </fieldset>
        <p className="text-[12.5px] text-ink-muted">A small difference from FX, TDS or bank charges still counts as full payment.</p>
        {state.error ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export function PauseDialog({
  invoice,
  today,
  onClose,
  onSave,
  state,
}: {
  invoice: SheetInvoice;
  today: string;
  onClose: () => void;
  onSave: (input: { until: string | null; reason: string | null }) => void;
  state: Busy;
}) {
  const [until, setUntil] = useState(invoice.remindersPausedUntil ?? addDaysIso(today, 7));
  const [reason, setReason] = useState(invoice.pauseReason ?? '');
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Pause reminders · ${invoice.clientName}${invoice.invoiceNo ? ` ${invoice.invoiceNo}` : ''}`}
      size="sm"
      footer={
        <>
          {invoice.remindersPausedUntil ? (
            <Button variant="quiet" className="mr-auto" disabled={state.busy} onClick={() => onSave({ until: null, reason: null })}>
              Resume now
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!until || state.busy} onClick={() => onSave({ until, reason: reason.trim() || null })}>
            Pause
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="No reminders until" htmlFor="rcv-until">
          <Input id="rcv-until" type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Field label="Reason" htmlFor="rcv-reason" hint="For example: client promised payment by 10 Nov.">
          <Input id="rcv-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="text-[12.5px] text-ink-muted">A pause changes reminders only. The client page does not show it, so it needs no Update.</p>
        {state.error ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export function AddInvoiceDialog({
  months,
  partners,
  clients,
  today,
  onClose,
  onSave,
  state,
}: {
  months: string[];
  partners: Partner[];
  clients: string[];
  today: string;
  onClose: () => void;
  onSave: (input: InvoiceInput) => void;
  state: Busy;
}) {
  const thisMonth = `${today.slice(0, 7)}-01`;
  const choices = [...new Set([...months, thisMonth])].sort();
  const [clientName, setClientName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [partnerId, setPartnerId] = useState(partners.find((p) => p.active)?.id ?? '');
  const [invoiceMonth, setInvoiceMonth] = useState(months.at(-1) ?? thisMonth);
  const [dueDate, setDueDate] = useState(addDaysIso(today, 30));
  const [amount, setAmount] = useState('');
  const value = parseInr(amount);
  const ok = clientName.trim() && value > 0 && dueDate;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add invoice"
      sub="It goes into the draft; the client page shows it after Update."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ok || state.busy}
            onClick={() => onSave({ clientName: clientName.trim(), invoiceNo: invoiceNo.trim() || null, partnerId: partnerId || null, invoiceMonth, dueDate, amountInr: value })}
          >
            Add to draft
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Client" htmlFor="rcv-client">
          <Input id="rcv-client" list="rcv-client-names" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          <datalist id="rcv-client-names">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Invoice number" htmlFor="rcv-no" hint="Optional.">
          <Input id="rcv-no" value={invoiceNo} maxLength={40} onChange={(e) => setInvoiceNo(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Client partner" htmlFor="rcv-partner">
          <select id="rcv-partner" className="h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px]" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">No partner yet</option>
            {partners
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Invoice month" htmlFor="rcv-month">
            <select id="rcv-month" className="h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px]" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)}>
              {choices.map((m) => (
                <option key={m} value={m}>
                  {monthLong(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date" htmlFor="rcv-due">
            <Input id="rcv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Amount (INR)" htmlFor="rcv-amt">
          <Input id="rcv-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
        </Field>
        {state.error ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
