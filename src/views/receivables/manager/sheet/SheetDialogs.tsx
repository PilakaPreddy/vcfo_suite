'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { addDaysIso, sheetDate } from '@/lib/receivables/dates';
import type { ManagerInvoiceDto } from '@/lib/receivables/wire';
import { inr, parseInr } from '../../format';
import { DatePick } from './DatePick';
import { invoiceName } from './cell-utils';

/**
 * The Sheet tab's Phase 10 dialogs: Dispute and Credit note from the row menu, and the bulk Mark
 * received and Pause reminders. The single-invoice dialogs are in ../InvoiceDialogs.tsx.
 */

type Busy = { busy: boolean; error: string | null };

function ErrorLine({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="m-0 text-[12.5px] text-danger">
      {text}
    </p>
  ) : null;
}

export function DisputeDialog({ invoice, state, onClose, onSave }: { invoice: ManagerInvoiceDto; state: Busy; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length > 0 && reason.length <= 300;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Dispute · ${invoiceName(invoice)}`}
      sub={`₹${inr(invoice.amountInr)} due ${sheetDate(invoice.dueDate)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ok || state.busy} onClick={() => onSave(reason.trim())}>
            {state.busy ? 'Saving…' : 'Mark disputed'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Reason" htmlFor="rcv-dispute-reason" hint="For example: the client questions the hours billed.">
          <Textarea id="rcv-dispute-reason" value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="m-0 text-[12.5px] text-ink-muted">Reminders stop and the invoice leaves the ageing until the dispute is resolved. The client page does not show a dispute.</p>
        <ErrorLine text={state.error} />
      </div>
    </Modal>
  );
}

export function CreditNoteDialog({
  invoice,
  today,
  state,
  onClose,
  onSave,
}: {
  invoice: ManagerInvoiceDto;
  today: string;
  state: Busy;
  onClose: () => void;
  onSave: (input: { number: string | null; issuedOn: string; amountInr: number; reason: string | null }) => void;
}) {
  const [number, setNumber] = useState('');
  const [issuedOn, setIssuedOn] = useState(today);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const value = parseInr(amount);
  const bad = !(value > 0) || value >= invoice.amountInr;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Credit note · ${invoiceName(invoice)}`}
      sub={`Open balance ₹${inr(invoice.amountInr)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={bad || !issuedOn || state.busy} onClick={() => onSave({ number: number.trim() || null, issuedOn, amountInr: value, reason: reason.trim() || null })}>
            {state.busy ? 'Saving…' : 'Add credit note'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Credit note no." htmlFor="rcv-cn-no" hint="Optional.">
            <Input id="rcv-cn-no" value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} className="font-mono" />
          </Field>
          <Field label="Issued on" htmlFor="rcv-cn-on">
            <DatePick id="rcv-cn-on" label="Issued on" value={issuedOn} max={today} onChange={setIssuedOn} />
          </Field>
        </div>
        <Field label="Amount (INR)" htmlFor="rcv-cn-amt" error={amount && bad ? 'Enter an amount above zero and below the open balance.' : undefined}>
          <Input id="rcv-cn-amt" inputMode="numeric" value={amount} aria-invalid={Boolean(amount) && bad} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Reason" htmlFor="rcv-cn-reason" hint="Optional.">
          <Input id="rcv-cn-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="m-0 text-[12.5px] text-ink-muted">The credit note lowers the open balance in the draft. To cancel the whole invoice, delete it instead.</p>
        <ErrorLine text={state.error} />
      </div>
    </Modal>
  );
}

export function BulkReceivedDialog({
  count,
  skipped,
  totalInr,
  today,
  state,
  onClose,
  onSave,
}: {
  count: number;
  skipped: number;
  totalInr: number;
  today: string;
  state: Busy;
  onClose: () => void;
  onSave: (paidOn: string) => void;
}) {
  const [paidOn, setPaidOn] = useState(today);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Mark ${count} invoice${count === 1 ? '' : 's'} received`}
      sub={`₹${inr(totalInr)} in full`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!paidOn || !count || state.busy} onClick={() => onSave(paidOn)}>
            {state.busy ? 'Saving…' : 'Mark received'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Paid on" htmlFor="rcv-bulk-paid">
          <DatePick id="rcv-bulk-paid" label="Paid on" value={paidOn} max={today} onChange={setPaidOn} />
        </Field>
        <p className="m-0 text-[12.5px] text-ink-muted">
          Each invoice is marked received in full for its open balance, on this date. For a part payment, TDS or a foreign invoice, use Mark received on the row.
        </p>
        {skipped ? <p className="m-0 text-[12.5px] text-ink-2">{`${skipped} picked invoice${skipped === 1 ? ' is' : 's are'} skipped: foreign-currency or already received.`}</p> : null}
        <ErrorLine text={state.error} />
      </div>
    </Modal>
  );
}

export function BulkPauseDialog({ count, today, state, onClose, onSave }: { count: number; today: string; state: Busy; onClose: () => void; onSave: (until: string | null, reason: string | null) => void }) {
  const [until, setUntil] = useState(addDaysIso(today, 7));
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Pause reminders · ${count} invoice${count === 1 ? '' : 's'}`}
      size="sm"
      footer={
        <>
          <Button variant="quiet" className="mr-auto" disabled={state.busy} onClick={() => onSave(null, null)}>
            Resume all
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!until || state.busy} onClick={() => onSave(until, reason.trim() || null)}>
            {state.busy ? 'Saving…' : 'Pause'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="No reminders until" htmlFor="rcv-bulk-until">
          <DatePick id="rcv-bulk-until" label="No reminders until" value={until} min={today} onChange={setUntil} quick={[7, 15, 30]} />
        </Field>
        <Field label="Reason" htmlFor="rcv-bulk-reason" hint="Optional.">
          <Input id="rcv-bulk-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="m-0 text-[12.5px] text-ink-muted">A pause changes reminders only. The client page does not show it, so it needs no Update.</p>
        <ErrorLine text={state.error} />
      </div>
    </Modal>
  );
}
