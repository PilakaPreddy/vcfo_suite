'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FOREIGN_CURRENCIES } from '@/lib/receivables/currencies';
import { sheetDate } from '@/lib/receivables/dates';
import type { InvoicePatch, SheetInvoice } from '@/lib/receivables/model';
import type { RateInForceDto } from '@/lib/receivables/reports-wire';
import { inr } from '../format';
import { draftIsForeign, fxDraftOf, fxFigures, fxPayload, useDraftRate, type FxDraft } from './fx-draft';

/**
 * The foreign-currency part of the Add invoice and Edit FX dialogs (Phases 9 and 10): the currency
 * (INR or any supported foreign currency), and for a foreign invoice its foreign amount, invoice
 * date and booked rate. The booked rate defaults to the rate of that currency stored in fx_rates
 * for the invoice date (or the latest earlier day within ten days); the manager may type another.
 * The INR booked is the foreign amount at that rate. The draft state and its figures are in
 * fx-draft.ts.
 */

const SELECT = 'h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px]';
const SOURCE: Record<RateInForceDto['source'], string> = { fbil: 'FBIL', ecb: 'ECB', manual: 'manual' };

export function FxFields({ draft, onChange, stored, idPrefix }: { draft: FxDraft; onChange: (d: FxDraft) => void; stored: RateInForceDto | null; idPrefix: string }) {
  const f = fxFigures(draft, stored);
  const set = (patch: Partial<FxDraft>) => onChange({ ...draft, ...patch });
  const c = draft.currency;
  const rateHint = draft.fxRate.trim()
    ? 'Typed by you.'
    : stored && stored.currency === c
      ? `The ${SOURCE[stored.source]} rate of ${sheetDate(stored.rateDate)}. Type another to change it.`
      : 'No stored rate for this day. Type the booked rate.';
  return (
    <>
      <Field label="Currency" htmlFor={`${idPrefix}-currency`}>
        <select id={`${idPrefix}-currency`} className={SELECT} value={draft.currency} onChange={(e) => set({ currency: e.target.value, fxRate: '' })}>
          <option value="INR">INR · Indian rupee</option>
          {FOREIGN_CURRENCIES.map((x) => (
            <option key={x.code} value={x.code}>
              {`${x.code} · ${x.name}`}
            </option>
          ))}
        </select>
      </Field>
      {draftIsForeign(draft) ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Amount (${c})`} htmlFor={`${idPrefix}-fc`}>
              <Input id={`${idPrefix}-fc`} inputMode="decimal" value={draft.fcAmount} onChange={(e) => set({ fcAmount: e.target.value })} className="font-mono" />
            </Field>
            <Field label="Invoice date" htmlFor={`${idPrefix}-date`}>
              <Input id={`${idPrefix}-date`} type="date" value={draft.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} />
            </Field>
          </div>
          <Field label={`Booked rate (INR per ${c})`} htmlFor={`${idPrefix}-rate`} hint={rateHint}>
            <Input
              id={`${idPrefix}-rate`}
              inputMode="decimal"
              value={draft.fxRate}
              placeholder={stored && stored.currency === c ? String(stored.rate) : ''}
              onChange={(e) => set({ fxRate: e.target.value })}
              className="font-mono"
            />
          </Field>
          <p className="text-[12.5px] text-ink-muted">{f.bookedInr !== null ? `Booked in INR: ₹${inr(f.bookedInr)}` : `Enter the ${c} amount, the invoice date and the rate.`}</p>
        </>
      ) : null}
    </>
  );
}

/** Edit FX: change a foreign invoice's currency, amount, date or booked rate, or set it back to INR. */
export function FxEditDialog({
  sheetId,
  invoice,
  today,
  onClose,
  onSave,
  state,
}: {
  sheetId: string;
  invoice: SheetInvoice;
  today: string;
  onClose: () => void;
  onSave: (patch: InvoicePatch) => void;
  state: { busy: boolean; error: string | null };
}) {
  const [draft, setDraft] = useState(() => fxDraftOf(invoice, today));
  const stored = useDraftRate(sheetId, draft);
  const f = fxFigures(draft, stored);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Currency · ${invoice.clientName}${invoice.invoiceNo ? ` ${invoice.invoiceNo}` : ''}`}
      sub={invoice.partPaid > 0 ? 'This invoice is part-paid, so the open INR balance stays as it is.' : `The open INR follows the ${draft.currency === 'INR' ? 'foreign' : draft.currency} amount at the booked rate.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!f.ok || state.busy} onClick={() => onSave(fxPayload(draft, stored))}>
            {state.busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <FxFields draft={draft} onChange={setDraft} stored={stored} idPrefix="rcv-fx-edit" />
        {state.error ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
