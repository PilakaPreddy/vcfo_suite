'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { sheetDate } from '@/lib/receivables/dates';
import type { CreditDto, ManagerSheetDto } from '@/lib/receivables/wire';
import { useCreditActions, useCredits } from '@/hooks/use-receivables';
import { inr } from '../format';

/**
 * The From bank tab (Phase 6): credits on the client's HSBC account, from the live feed once HSBC
 * onboarding is done, or from a statement file the manager imports today. Sure matches are
 * already marked received in the draft; the rest wait here for Confirm, another invoice, or
 * "Not a receipt".
 */

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

function Amount({ c }: { c: CreditDto }) {
  return (
    <span className="whitespace-nowrap font-mono text-[13px]">
      {c.fcAmount !== null && c.currency !== 'INR' ? <span className="text-ink-faint">{`${c.currency} ${inr(c.fcAmount)} → `}</span> : null}₹{inr(c.inrAmount)}
    </span>
  );
}

function ToConfirm({ c, data, onConfirm, onIgnore, busy }: { c: CreditDto; data: ManagerSheetDto; onConfirm: (ids: string[]) => void; onIgnore: () => void; busy: boolean }) {
  const open = data.invoices.filter((i) => i.status === 'open');
  const suggested = c.matchInvoiceIds.filter((id) => open.some((i) => i.id === id));
  const [picked, setPicked] = useState<string>(suggested.length > 1 ? 'suggested' : suggested[0] ?? '');
  const label = (id: string) => {
    const i = open.find((x) => x.id === id);
    return i ? `${i.clientName}${i.invoiceNo ? ` ${i.invoiceNo}` : ''} · ₹${inr(i.amountInr)} · due ${sheetDate(i.dueDate)}` : '';
  };
  const ids = picked === 'suggested' ? suggested : picked ? [picked] : [];
  return (
    <div className="rounded-md border border-line bg-surface-raised p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <b className="font-semibold">{c.payer}</b> <span className="text-ink-muted">· {sheetDate(c.valueDate)}</span>
          {c.narration ? <div className="text-[12px] text-ink-faint">{c.narration}</div> : null}
        </div>
        <Amount c={c} />
      </div>
      {c.matchNote ? <p className="mt-1.5 text-[12.5px] text-ink-muted">{c.matchNote}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
        <label htmlFor={`rcv-credit-${c.id}`} className="text-ink-muted">
          Match to
        </label>
        <select id={`rcv-credit-${c.id}`} className="h-8 max-w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-2 text-[13px]" value={picked} onChange={(e) => setPicked(e.target.value)}>
          <option value="">Pick an open invoice</option>
          {suggested.length > 1 ? <option value="suggested">{`All ${suggested.length} suggested invoices together`}</option> : null}
          {open.map((i) => (
            <option key={i.id} value={i.id}>
              {label(i.id)}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" disabled={!ids.length || busy} onClick={() => onConfirm(ids)}>
          Confirm, mark received
        </Button>
        <Button size="sm" variant="quiet" disabled={busy} onClick={onIgnore}>
          Not a receipt
        </Button>
      </div>
    </div>
  );
}

export function BankTab({ data }: { data: ManagerSheetDto }) {
  const credits = useCredits(data.sheet.id);
  const act = useCreditActions(data.sheet.id);
  const file = useRef<HTMLInputElement>(null);
  const list = credits.data?.credits ?? [];
  const waiting = list.filter((c) => c.status === 'to_confirm' || c.status === 'unmatched');
  const auto = list.filter((c) => c.status === 'auto');
  const handled = list.filter((c) => c.status === 'confirmed' || c.status === 'ignored');
  const invoiceName = (id: string) => {
    const i = data.invoices.find((x) => x.id === id);
    return i ? `${i.clientName}${i.invoiceNo ? ` ${i.invoiceNo}` : ''}` : 'an invoice';
  };

  const importFile = (f: File | undefined) => {
    if (!f) return;
    act.importFile.mutate(f, {
      onSuccess: (r) => {
        const parts = [`${r.added} new credit${r.added === 1 ? '' : 's'}`, r.auto ? `${r.auto} matched and marked received` : '', r.duplicates ? `${r.duplicates} already here` : ''].filter(Boolean);
        toastSuccess('Statement imported', `${parts.join(', ')}.${r.skipped.length ? ` ${r.skipped.length} entr${r.skipped.length === 1 ? 'y' : 'ies'} left out.` : ''}`);
      },
      onError: (e) => toastError('Not imported', errorText(e)),
      onSettled: () => {
        if (file.current) file.current.value = '';
      },
    });
  };
  const decide = (c: CreditDto, body: { action: 'confirm'; invoiceIds: string[] } | { action: 'ignore' }) =>
    act.decide.mutate(
      { id: c.id, ...body },
      { onSuccess: () => toastSuccess(body.action === 'confirm' ? 'Marked received in the draft' : 'Recorded as not a receipt', body.action === 'confirm' ? 'Click Update to show it on the client page.' : undefined), onError: (e) => toastError('Not saved', errorText(e)) },
    );

  return (
    <>
      <section className="mb-4 rounded-md border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">HSBC account</h2>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-muted">
              {credits.data?.feed.live
                ? credits.data.feed.missing.length
                  ? `The live feed is switched on but not ready: ${credits.data.feed.missing.join(', ')} still to be set from HSBC onboarding.`
                  : 'The live feed checks the account every hour.'
                : 'The live HSBC feed starts once Summit completes HSBC API onboarding. Until then, download the statement from HSBCnet as ISO 20022 XML (camt.053) and import it here.'}{' '}
              A credit whose payer and amount fit one open invoice is marked received on its own; anything less certain waits below.
            </p>
          </div>
          <div>
            <input ref={file} type="file" accept=".xml,application/xml,text/xml" className="sr-only" id="rcv-statement" onChange={(e) => importFile(e.target.files?.[0])} />
            <Button variant="secondary" disabled={act.importFile.isPending} onClick={() => file.current?.click()}>
              {act.importFile.isPending ? 'Importing…' : 'Import statement'}
            </Button>
          </div>
        </div>
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">To confirm</h2>
        {credits.isLoading ? (
          <p className="text-ink-muted">Loading…</p>
        ) : waiting.length === 0 ? (
          <p className="rounded-md border border-line bg-surface-raised p-4 text-[13px] text-ink-muted">Nothing waiting.</p>
        ) : (
          <div className="grid gap-2.5">
            {waiting.map((c) => (
              <ToConfirm key={c.id} c={c} data={data} busy={act.decide.isPending} onConfirm={(invoiceIds) => decide(c, { action: 'confirm', invoiceIds })} onIgnore={() => decide(c, { action: 'ignore' })} />
            ))}
          </div>
        )}
      </section>

      {[
        { title: 'Matched automatically', rows: auto, chip: (c: CreditDto) => <Chip raw tone="ok">{`Received · ${c.matchInvoiceIds.map(invoiceName).join(', ')}`}</Chip> },
        { title: 'Handled', rows: handled, chip: (c: CreditDto) => (c.status === 'confirmed' ? <Chip raw tone="ok">{`Confirmed · ${c.matchInvoiceIds.map(invoiceName).join(', ')}`}</Chip> : <Chip raw tone="idle">Not a receipt</Chip>) },
      ].map((block) =>
        block.rows.length ? (
          <section key={block.title} className="mb-4 rounded-md border border-line bg-surface-raised p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">{block.title}</h2>
            <ul className="mt-1">
              {block.rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2 first:border-t-0">
                  <div>
                    <b className="font-medium">{c.payer}</b> <span className="text-ink-muted">· {sheetDate(c.valueDate)}</span>
                    <div className="text-[11px] text-ink-faint">{c.source === 'manual' ? 'Imported statement' : 'HSBC feed'} · ref {c.externalRef}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Amount c={c} />
                    {block.chip(c)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </>
  );
}
