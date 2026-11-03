'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { addDaysIso, monthLong, sheetDate } from '@/lib/receivables/dates';
import { isForeign, realisedFx } from '@/lib/receivables/fx';
import type { InvoiceInput, Partner, ReceiptInput, SheetInvoice } from '@/lib/receivables/model';
import { fc, fcText, inr, parseInr, rateText, signedInr } from '../format';
import { FxFields } from './FxFields';
import { draftIsForeign, fxDraftOf, fxFigures, fxPayload, useDraftRate } from './fx-draft';
import { ForwardPicker } from './fx/ForwardPicker';
import { DatePick } from './sheet/DatePick';

/**
 * The dialogs of the Sheet tab: Mark received, Pause reminders and Add invoice (the Edit FX
 * dialog is in FxFields.tsx). Mark received on a foreign invoice asks for the foreign amount
 * received and the INR credited, previews the realised gain or loss and the bank charges, and may
 * deliver the receipt against an open forward contract of that currency (Phase 10); on an INR
 * invoice it takes an optional TDS.
 */

type Busy = { busy: boolean; error: string | null };

export function MarkReceivedDialog({
  sheetId,
  invoice,
  partnerName,
  today,
  onClose,
  onSave,
  state,
}: {
  /** The sheet, for the forward contract picker of a foreign invoice. */
  sheetId?: string;
  invoice: SheetInvoice;
  partnerName: string;
  today: string;
  onClose: () => void;
  onSave: (input: ReceiptInput) => void;
  state: Busy;
}) {
  const foreign = isForeign({ currency: invoice.currency ?? 'INR' });
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(foreign ? '' : inr(invoice.amountInr));
  const [receivedFc, setReceivedFc] = useState(foreign && invoice.fcAmount ? String(invoice.fcAmount) : '');
  const [tds, setTds] = useState('');
  const [part, setPart] = useState(false);
  const [forwardId, setForwardId] = useState('');
  const value = parseInr(amount);
  const fcValue = Number(receivedFc.replace(/[$,\s]/g, ''));
  const tdsValue = tds.trim() ? parseInr(tds) : 0;
  const badAmount = !(value > 0);
  const badFc = foreign && !(fcValue > 0);
  const badTds = !foreign && !(tdsValue >= 0);
  const bad = badAmount || badFc || badTds;
  const realised = foreign ? realisedFx({ fcAmount: invoice.fcAmount ?? null, invoiceRate: invoice.fxRate ?? null, receivedFc: fcValue || null, receivedInr: value || null }) : null;
  const fcDue = fcText(invoice);
  const save = () => onSave(foreign ? { paidOn, amount: value, part, receivedFc: fcValue, ...(forwardId ? { forwardId } : {}) } : { paidOn, amount: value, part, ...(tdsValue > 0 ? { tdsInr: tdsValue } : {}) });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Mark received · ${invoice.clientName}${invoice.invoiceNo ? ` ${invoice.invoiceNo}` : ''}`}
      sub={`${fcDue ? `${fcDue} · ` : ''}₹${inr(invoice.amountInr)} due ${sheetDate(invoice.dueDate)} · ${partnerName}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={bad || state.busy} onClick={save}>
            {state.busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Paid on" htmlFor="rcv-paid-on">
          <DatePick id="rcv-paid-on" label="Paid on" value={paidOn} max={today} onChange={setPaidOn} quick={[0]} />
        </Field>
        {foreign ? (
          <Field label={`Amount received (${invoice.currency})`} htmlFor="rcv-fc" error={badFc && receivedFc ? 'Enter an amount above zero.' : undefined}>
            <Input id="rcv-fc" inputMode="decimal" value={receivedFc} aria-invalid={badFc} onChange={(e) => setReceivedFc(e.target.value)} className="font-mono" />
          </Field>
        ) : null}
        <Field
          label={foreign ? 'INR credited by the bank' : 'Amount received (INR)'}
          htmlFor="rcv-amount"
          error={badAmount && (amount || !foreign) ? 'Enter an amount above zero.' : undefined}
          hint={foreign ? 'The rupees on the bank credit advice.' : undefined}
        >
          <Input id="rcv-amount" inputMode="numeric" value={amount} aria-invalid={badAmount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
        </Field>
        {!foreign ? (
          <Field label="TDS deducted (INR)" htmlFor="rcv-tds" hint="Optional. It settles the invoice along with the amount received." error={badTds ? 'Enter the TDS in rupees.' : undefined}>
            <Input id="rcv-tds" inputMode="numeric" value={tds} aria-invalid={badTds} onChange={(e) => setTds(e.target.value)} className="font-mono" />
          </Field>
        ) : null}
        {foreign && sheetId ? <ForwardPicker sheetId={sheetId} currency={invoice.currency} value={forwardId} onChange={setForwardId} receivedFc={fcValue > 0 ? fcValue : null} /> : null}
        {realised ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-surface-sunken px-3 py-2 text-[12.5px]">
            <dt className="text-ink-muted">Effective rate</dt>
            <dd className="text-right font-mono">{rateText(realised.effectiveRate)} (booked {rateText(invoice.fxRate)})</dd>
            <dt className="text-ink-muted">Booked INR for this {invoice.currency}</dt>
            <dd className="text-right font-mono">₹{inr(realised.bookedInrForReceived)}</dd>
            <dt className="text-ink-muted">Realised {realised.realisedInr < 0 ? 'loss' : 'gain'}</dt>
            <dd className={`text-right font-mono ${realised.realisedInr < 0 ? 'text-danger' : 'text-positive'}`}>{signedInr(realised.realisedInr)}</dd>
            <dt className="text-ink-muted">Bank charges</dt>
            <dd className="text-right font-mono">{realised.bankChargesFc > 0 ? `${invoice.currency} ${fc(realised.bankChargesFc)} (₹${inr(realised.bankChargesInr)})` : 'None'}</dd>
          </dl>
        ) : foreign && !invoice.fxRate ? (
          <p className="text-[12.5px] text-ink-muted">No booked rate on this invoice, so the gain or loss cannot be worked out.</p>
        ) : null}
        <fieldset className="grid gap-2 text-[13px]">
          <legend className="sr-only">Payment kind</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="rcv-kind" checked={!part} onChange={() => setPart(false)} /> Full payment
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="rcv-kind" checked={part} onChange={() => setPart(true)} /> Part payment, keep the balance open
          </label>
        </fieldset>
        <p className="text-[12.5px] text-ink-muted">
          {foreign
            ? 'Bank charges or a rate difference still count as full payment. An awaited FIRA is added on the Reports tab.'
            : 'A small difference from TDS or bank charges still counts as full payment.'}
        </p>
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
          <DatePick id="rcv-until" label="No reminders until" value={until} min={today} onChange={setUntil} quick={[7, 15, 30]} />
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
  sheetId,
  months,
  partners,
  clients,
  today,
  onClose,
  onSave,
  state,
}: {
  sheetId: string;
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
  const [fx, setFx] = useState(() => fxDraftOf(null, today));
  const stored = useDraftRate(sheetId, fx);
  const figures = fxFigures(fx, stored);
  const value = draftIsForeign(fx) ? (figures.bookedInr ?? NaN) : parseInr(amount);
  const ok = clientName.trim() && value > 0 && dueDate && figures.ok;
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
            onClick={() =>
              onSave({ clientName: clientName.trim(), invoiceNo: invoiceNo.trim() || null, partnerId: partnerId || null, invoiceMonth, dueDate, amountInr: value, ...fxPayload(fx, stored) })
            }
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
            <DatePick id="rcv-due" label="Due date" value={dueDate} onChange={setDueDate} quick={[15, 30, 45, 60]} />
          </Field>
        </div>
        <FxFields draft={fx} onChange={setFx} stored={stored} idPrefix="rcv-add" />
        {fx.currency === 'INR' ? (
          <Field label="Amount (INR)" htmlFor="rcv-amt">
            <Input id="rcv-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
          </Field>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
