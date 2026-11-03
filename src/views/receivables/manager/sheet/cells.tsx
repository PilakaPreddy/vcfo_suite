'use client';

import { Chip } from '@/components/ui/spectrum-chip';
import { toastError } from '@/lib/toast-errors';
import { sheetDate } from '@/lib/receivables/dates';
import { fxChange } from '@/lib/receivables/fx';
import type { SheetInvoice } from '@/lib/receivables/model';
import { nextReminderDate } from '@/lib/receivables/reminder-rule';
import type { ManagerInvoiceDto, ManagerSheetDto } from '@/lib/receivables/wire';
import { cn } from '@/lib/utils';
import { fcText, inr, parseInr, rateText, signedInr } from '../../format';
import { StatusChip } from '../../StatusChip';
import { PromiseChip } from '../InvoiceNotes';
import { CELL, fxInput, invoiceName } from './cell-utils';

/**
 * The sheet's cells (Phase 10), shared by the table and the phone cards: the in-place text and
 * amount editors, the compact two-line FX cell, the status stack and the next-reminder line.
 */

export function TextCell({ value, onCommit, label, mono, placeholder, list }: { value: string; onCommit: (v: string) => void; label: string; mono?: boolean; placeholder?: string; list?: string }) {
  return (
    <input
      key={value}
      className={cn(CELL, 'truncate', mono && 'font-mono text-[12px]')}
      defaultValue={value}
      aria-label={label}
      title={value || undefined}
      placeholder={placeholder}
      list={list}
      onBlur={(e) => e.target.value.trim() !== value && onCommit(e.target.value.trim())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

export function AmountCell({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  return (
    <input
      key={value}
      className={cn(CELL, 'text-right font-mono text-[12px]')}
      inputMode="numeric"
      defaultValue={inr(value)}
      aria-label={label}
      onBlur={(e) => {
        const n = parseInr(e.target.value);
        if (!(n > 0)) {
          e.target.value = inr(value);
          toastError('Amount not changed', 'Enter an amount above zero.');
          return;
        }
        if (Math.round(n) !== Math.round(value)) onCommit(n);
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/**
 * A foreign invoice's FX in two lines: the foreign amount at the booked rate, then the INR at
 * today's rate and the change against the booked INR. A click opens Edit FX.
 */
export function FxCell({ invoice, todayRate, onEdit }: { invoice: SheetInvoice; todayRate: number | null; onEdit?: () => void }) {
  const change = fxChange(fxInput(invoice), todayRate);
  const tone = change ? (change.changeInr < 0 ? 'text-danger' : change.changeInr > 0 ? 'text-positive' : 'text-ink-muted') : '';
  const body = (
    <>
      <span className="block truncate font-mono text-[12px] text-ink">
        {fcText(invoice) ?? `${invoice.currency} —`}
        <span className="text-ink-muted">{` @ ${invoice.fxRate ? invoice.fxRate.toFixed(2) : '—'}`}</span>
      </span>
      <span className="block truncate text-[11.5px] text-ink-muted">
        {change ? (
          <>
            {`Now ₹${inr(change.inrToday)} `}
            <span className={tone}>{signedInr(change.changeInr)}</span>
          </>
        ) : todayRate ? (
          'No booked rate'
        ) : (
          'No rate for today yet'
        )}
      </span>
    </>
  );
  const title = change ? `Booked at ${rateText(invoice.fxRate)}; at today's rate ₹${inr(change.inrToday)}, ${signedInr(change.changeInr)} (${change.changePct > 0 ? '+' : ''}${change.changePct.toFixed(2)}%)` : undefined;
  if (!onEdit) return <div title={title} className="min-w-0 leading-[1.35]">{body}</div>;
  return (
    <button
      type="button"
      onClick={onEdit}
      title={title}
      aria-label={`Edit currency of ${invoiceName(invoice)}`}
      className="block w-full min-w-0 rounded-md border border-transparent px-1.5 py-0.5 text-left leading-[1.35] hover:border-line focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
    >
      {body}
    </button>
  );
}

/** The status chip, plus Disputed, the promise and a part payment when there are any. */
export function StatusStack({ invoice, today }: { invoice: ManagerInvoiceDto; today: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <StatusChip invoice={invoice} today={today} />
      {invoice.status === 'open' && invoice.disputed ? (
        <Chip raw tone="bad" title="Disputed: no reminders until it is resolved">
          Disputed
        </Chip>
      ) : null}
      {invoice.status === 'open' && invoice.promisedOn ? <PromiseChip invoice={invoice} today={today} /> : null}
      {invoice.status === 'open' && invoice.partPaid > 0 ? <span className="text-[11.5px] text-ink-muted">{`₹${inr(invoice.partPaid)} part-paid`}</span> : null}
      {invoice.status === 'received' && invoice.paidOn ? (
        <span className="text-[11.5px] text-ink-muted">
          {`Paid ${sheetDate(invoice.paidOn)}`}
          {invoice.paidVia === 'bank' ? ' · bank' : ''}
        </span>
      ) : null}
    </div>
  );
}

/** The next reminder: "Today", a date, "Paused" with its end date, or a dash. */
export function NextReminder({ invoice, today, rules }: { invoice: SheetInvoice; today: string; rules: ManagerSheetDto['sheet']['reminderRules'] }) {
  if (invoice.status !== 'open') return <span className="text-ink-faint">—</span>;
  if (invoice.remindersPausedUntil && invoice.remindersPausedUntil >= today) {
    return (
      <span className="block leading-[1.35]" title={invoice.pauseReason ?? undefined}>
        <span className="block text-ink-2">Paused</span>
        <span className="block text-[11.5px] text-ink-muted">{`to ${sheetDate(invoice.remindersPausedUntil)}`}</span>
      </span>
    );
  }
  const next = nextReminderDate(invoice, today, rules);
  return <span className="text-ink-muted">{next ? (next === today ? 'Today' : sheetDate(next)) : '—'}</span>;
}
