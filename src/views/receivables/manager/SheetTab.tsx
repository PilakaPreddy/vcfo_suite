'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { FilterSelect } from '@/components/ui/native-select';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { daysLeft, monthBlockTitle, monthLong, monthShort, sheetDate } from '@/lib/receivables/dates';
import type { InvoicePatch, Partner, SheetInvoice } from '@/lib/receivables/model';
import { nextReminderDate } from '@/lib/receivables/reminder-rule';
import { monthsOf, payTiming, receivedThisWeek, sumInr } from '@/lib/receivables/summary';
import type { ManagerInvoiceDto, ManagerSheetDto } from '@/lib/receivables/wire';
import { fxChange, isForeign } from '@/lib/receivables/fx';
import type { useReceivablesActions } from '@/hooks/use-receivables';
import { fcText, inr, parseInr, rateText, signedInr, stamp } from '../format';
import { StatusChip } from '../StatusChip';
import { AddInvoiceDialog, MarkReceivedDialog, PauseDialog } from './InvoiceDialogs';
import { FxEditDialog } from './FxFields';
import { ComposeSummary } from './ComposeSummary';
import { ShareDialog } from './ShareDialog';
import { NotesButton, NotesDialog, PromiseChip } from './InvoiceNotes';

/**
 * The Sheet tab (prototype "Sheet"): today's month-block layout, one row per invoice, every cell
 * edited in place. Edits land in the draft; Update publishes them to the client page.
 *
 * Phase 9: when any open invoice is in USD the table gains an FX column. A USD row shows its USD
 * amount, the booked rate, the INR at today's rate and the change against the booked INR; its INR
 * amount is the booked INR and is changed through Edit FX, not typed. INR rows are unchanged. An
 * invoice under dispute carries a Disputed chip.
 */

type Actions = ReturnType<typeof useReceivablesActions>;
type Dialog = { kind: 'mark' | 'pause' | 'fx'; invoice: SheetInvoice } | { kind: 'notes'; invoice: ManagerInvoiceDto } | { kind: 'add' } | null;

const fxInput = (inv: SheetInvoice) => ({ currency: inv.currency ?? 'INR', fcAmount: inv.fcAmount ?? null, invoiceRate: inv.fxRate ?? null, amountInr: inv.amountInr });

/** The FX cell of a USD row: USD amount, booked rate, INR today and the change. */
function FxCell({ invoice, todayRate, onEdit }: { invoice: SheetInvoice; todayRate: number | null; onEdit: () => void }) {
  const change = fxChange(fxInput(invoice), todayRate);
  return (
    <div className="min-w-[170px] text-[12px] leading-[1.45]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">{fcText(invoice) ?? `${invoice.currency} —`}</span>
        <Button size="sm" variant="quiet" onClick={onEdit} aria-label={`Edit currency of ${invoice.clientName}${invoice.invoiceNo ? ` ${invoice.invoiceNo}` : ''}`}>
          Edit
        </Button>
      </div>
      <div className="text-ink-muted">Booked @ {rateText(invoice.fxRate)}</div>
      {change ? (
        <div>
          Today ₹{inr(change.inrToday)}{' '}
          <span className={change.changeInr < 0 ? 'text-danger' : change.changeInr > 0 ? 'text-positive' : 'text-ink-muted'}>
            {signedInr(change.changeInr)} ({change.changePct > 0 ? '+' : ''}
            {change.changePct.toFixed(2)}%)
          </span>
        </div>
      ) : (
        <div className="text-ink-faint">{todayRate ? 'No booked rate' : 'No rate for today yet'}</div>
      )}
    </div>
  );
}

const CELL = 'h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[13px] outline-none placeholder:text-ink-faint placeholder:font-sans hover:border-line focus:border-brand focus:bg-surface-raised focus:ring-4 focus:ring-focus-ring/25';
const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2.5 py-1.5 align-middle';

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

export function PublishBar({ data, actions }: { data: ManagerSheetDto; actions: Actions }) {
  const [open, setOpen] = useState<'email' | 'share' | null>(null);
  const dirty = data.unpublishedChanges;
  const shown = data.latestVersion ? stamp(data.latestVersion.publishedAt) : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.publicUrl);
      toastSuccess('Client link copied', data.publicUrl);
    } catch {
      toastError('Could not copy', data.publicUrl);
    }
  };
  const publish = () =>
    actions.publish.mutate(undefined, {
      onSuccess: () => toastSuccess('Published', 'The client page now shows this version.'),
      onError: (e) => toastError('Update failed', errorText(e)),
    });
  return (
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${dirty ? 'border-warning/40 bg-warning-soft' : 'border-line bg-surface-raised'}`}>
      <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
        {dirty ? (
          <Chip raw tone="warn">{`Draft · ${dirty} unpublished change${dirty === 1 ? '' : 's'}`}</Chip>
        ) : (
          <Chip raw tone="ok">
            Published
          </Chip>
        )}
        <span className="text-ink-muted">{shown ? `The client page shows the version of ${shown}.` : 'Nothing published yet. The client page is empty until the first Update.'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={publish} disabled={!dirty || actions.publish.isPending}>
          {actions.publish.isPending ? 'Publishing…' : 'Update'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen('email')}>
          Send email
        </Button>
        <Button variant="secondary" onClick={() => setOpen('share')}>
          Share
        </Button>
        <Button variant="quiet" onClick={copy}>
          Copy client link
        </Button>
      </div>
      {open === 'email' ? <ComposeSummary data={data} actions={actions} onClose={() => setOpen(null)} /> : null}
      {open === 'share' ? <ShareDialog data={data} onClose={() => setOpen(null)} onEmail={() => setOpen('email')} /> : null}
    </div>
  );
}

function TextCell({ value, onCommit, label, mono, placeholder, list }: { value: string; onCommit: (v: string) => void; label: string; mono?: boolean; placeholder?: string; list?: string }) {
  return (
    <input
      key={value}
      className={`${CELL} ${mono ? 'min-w-[96px] font-mono text-[12px]' : 'min-w-[150px]'}`}
      defaultValue={value}
      aria-label={label}
      placeholder={placeholder}
      list={list}
      onBlur={(e) => e.target.value.trim() !== value && onCommit(e.target.value.trim())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function AmountCell({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  return (
    <input
      key={value}
      className={`${CELL} min-w-[110px] text-right font-mono text-[12px]`}
      inputMode="numeric"
      defaultValue={inr(value)}
      aria-label="Amount INR"
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

export function SheetTab({ data, actions, today }: { data: ManagerSheetDto; actions: Actions; today: string }) {
  const [partner, setPartner] = useState('all');
  const [status, setStatus] = useState<'open' | 'overdue' | 'notdue'>('open');
  const [month, setMonth] = useState('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const partnersById = useMemo(() => new Map(data.partners.map((p) => [p.id, p])), [data.partners]);
  const months = monthsOf(data.invoices);
  const filtered = partner !== 'all' || status !== 'open' || month !== 'all';
  const open = data.invoices.filter(
    (i) =>
      i.status === 'open' &&
      (partner === 'all' || i.partnerId === partner) &&
      (month === 'all' || i.invoiceMonth === month) &&
      (status === 'open' || (status === 'overdue' ? daysLeft(i.dueDate, today) < 0 : daysLeft(i.dueDate, today) >= 0)),
  );
  const received = data.invoices.filter((i) => receivedThisWeek(i, today) && (partner === 'all' || i.partnerId === partner));
  const clients = [...new Set(data.invoices.map((i) => i.clientName))].sort();
  const hasForeign = data.invoices.some((i) => i.status === 'open' && isForeign(fxInput(i)));
  const cols = hasForeign ? 9 : 8;
  const todayRate = data.usdRate?.rate ?? null;

  const edit = (inv: SheetInvoice, patch: InvoicePatch) =>
    actions.updateInvoice.mutate({ id: inv.id, patch }, { onError: (e) => toastError('Not saved', errorText(e)) });
  const close = () => {
    setDialog(null);
    setDialogError(null);
  };

  const partnerOptions = (inv: SheetInvoice) => {
    const list: Partner[] = data.partners.filter((p) => p.active || p.id === inv.partnerId);
    return list;
  };

  return (
    <>
      <PublishBar data={data} actions={actions} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterSelect aria-label="Client partner" value={partner} onChange={(e) => setPartner(e.target.value)} options={[{ value: 'all', label: 'All partners' }, ...data.partners.map((p) => ({ value: p.id, label: p.name }))]} />
        <FilterSelect
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={[
            { value: 'open', label: 'All open' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'notdue', label: 'Not yet due' },
          ]}
        />
        <FilterSelect aria-label="Invoice month" value={month} onChange={(e) => setMonth(e.target.value)} options={[{ value: 'all', label: 'All months' }, ...months.map((m) => ({ value: m, label: monthLong(m) }))]} />
        <span className="flex-1" />
        <Button variant="secondary" onClick={() => setDialog({ kind: 'add' })}>
          Add invoice
        </Button>
      </div>

      <div className="relative mb-4 overflow-x-auto rounded-md border border-line bg-surface-raised">
        <table className={`w-full ${hasForeign ? 'min-w-[1240px]' : 'min-w-[1040px]'} border-collapse text-[13px]`}>
          <thead>
            <tr>
              <th className={TH}>Client</th>
              <th className={TH}>Invoice no.</th>
              <th className={TH}>Client partner</th>
              <th className={TH}>Due date</th>
              <th className={`${TH} text-right`}>Amount INR</th>
              {hasForeign ? <th className={TH}>{`FX${data.usdRate ? ` · USD ${rateText(data.usdRate.rate)} (${sheetDate(data.usdRate.rateDate)})` : ''}`}</th> : null}
              <th className={TH}>Status</th>
              <th className={TH}>Next reminder</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          {(month === 'all' ? months : [month]).map((m) => {
            const rows = open.filter((i) => i.invoiceMonth === m).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
            return (
              <tbody key={m}>
                <tr>
                  <td colSpan={cols} className="border-t border-line px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em] text-ink">
                    {monthBlockTitle(m)}
                  </td>
                </tr>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={cols} className={`${TD} text-ink-muted`}>
                      No open invoices{filtered ? ' for this filter' : ''}.
                    </td>
                  </tr>
                ) : null}
                {rows.map((inv) => {
                  const foreign = isForeign(fxInput(inv));
                  const next = inv.remindersPausedUntil && inv.remindersPausedUntil >= today ? `Paused to ${sheetDate(inv.remindersPausedUntil)}` : nextReminderDate(inv, today, data.sheet.reminderRules);
                  return (
                    <tr key={inv.id}>
                      <td className={TD}>
                        <TextCell value={inv.clientName} label="Client" list="rcv-sheet-clients" onCommit={(v) => (v ? edit(inv, { clientName: v }) : toastError('Not saved', 'The client name cannot be empty.'))} />
                      </td>
                      <td className={TD}>
                        <TextCell value={inv.invoiceNo ?? ''} label="Invoice number" mono placeholder="optional" onCommit={(v) => edit(inv, { invoiceNo: v || null })} />
                      </td>
                      <td className={TD}>
                        <select className={`${CELL} min-w-[150px] cursor-pointer`} aria-label="Client partner" value={inv.partnerId ?? ''} onChange={(e) => edit(inv, { partnerId: e.target.value || null })}>
                          <option value="">No partner</option>
                          {partnerOptions(inv).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={TD}>
                        <input
                          key={inv.dueDate}
                          type="date"
                          className={`${CELL} min-w-[132px]`}
                          aria-label="Due date"
                          defaultValue={inv.dueDate}
                          onBlur={(e) => e.target.value && e.target.value !== inv.dueDate && edit(inv, { dueDate: e.target.value })}
                        />
                      </td>
                      <td className={TD}>
                        {foreign ? (
                          <div className="min-w-[110px] px-1.5 text-right font-mono text-[12px]" title="Booked INR; change it with Edit in the FX column">
                            {inr(inv.amountInr)}
                          </div>
                        ) : (
                          <AmountCell value={inv.amountInr} onCommit={(v) => edit(inv, { amountInr: v })} />
                        )}
                      </td>
                      {hasForeign ? <td className={TD}>{foreign ? <FxCell invoice={inv} todayRate={todayRate} onEdit={() => setDialog({ kind: 'fx', invoice: inv })} /> : null}</td> : null}
                      <td className={TD}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip invoice={inv} today={today} />
                          {inv.disputed ? (
                            <Chip raw tone="bad" title="Disputed: no reminders until it is resolved on the Reports tab">
                              Disputed
                            </Chip>
                          ) : null}
                        </div>
                        {inv.partPaid > 0 ? <div className="mt-0.5 text-[11px] text-ink-faint">₹{inr(inv.partPaid)} part-paid</div> : null}
                        {inv.promisedOn ? (
                          <div className="mt-0.5">
                            <PromiseChip invoice={inv} today={today} />
                          </div>
                        ) : null}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-ink-muted`}>{next ? (next.startsWith('Paused') ? next : next === today ? 'Today' : sheetDate(next)) : '—'}</td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'mark', invoice: inv })}>
                          Received
                        </Button>{' '}
                        <Button size="sm" variant="quiet" onClick={() => setDialog({ kind: 'pause', invoice: inv })}>
                          {inv.remindersPausedUntil && inv.remindersPausedUntil >= today ? 'Paused' : 'Pause'}
                        </Button>{' '}
                        <NotesButton invoice={inv} onOpen={() => setDialog({ kind: 'notes', invoice: inv })} />
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-surface-sunken font-semibold">
                  <td colSpan={4} className={TD}>
                    {monthShort(m)} receivables{filtered ? ' (filtered)' : ''}
                  </td>
                  <td className={`${TD} text-right font-mono text-[12px]`}>{inr(sumInr(rows))}</td>
                  <td colSpan={cols - 5} className={TD} />
                </tr>
              </tbody>
            );
          })}
        </table>
        <datalist id="rcv-sheet-clients">
          {clients.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="relative mb-4 overflow-x-auto rounded-md border border-line bg-surface-raised">
        <table className="w-full min-w-[880px] border-collapse text-[13px]">
          <thead>
            <tr>
              <td colSpan={8} className="px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em] text-ink">
                Received this week
              </td>
            </tr>
            <tr>
              <th className={TH}>Client</th>
              <th className={TH}>Invoice no.</th>
              <th className={TH}>Client partner</th>
              <th className={TH}>Due date</th>
              <th className={`${TH} text-right`}>Amount INR</th>
              <th className={TH}>Paid on</th>
              <th className={TH}>Paid</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {received.length === 0 ? (
              <tr>
                <td colSpan={8} className={`${TD} text-ink-muted`}>
                  Nothing received in the last 7 days.
                </td>
              </tr>
            ) : (
              received.map((inv) => (
                <tr key={inv.id} className="bg-positive-soft/40">
                  <td className={TD}>{inv.clientName}</td>
                  <td className={`${TD} font-mono text-[12px]`}>{inv.invoiceNo}</td>
                  <td className={TD}>{(inv.partnerId && partnersById.get(inv.partnerId)?.name) || '—'}</td>
                  <td className={TD}>{sheetDate(inv.dueDate)}</td>
                  <td className={`${TD} text-right font-mono text-[12px]`}>
                    {inr(inv.paidAmount ?? inv.amountInr)}
                    {fcText(inv, inv.receivedFc) ? <div className="text-[11px] text-ink-muted">{fcText(inv, inv.receivedFc)}</div> : null}
                  </td>
                  <td className={TD}>
                    {sheetDate(inv.paidOn)}
                    {inv.paidVia === 'bank' ? <span className="text-ink-faint"> · bank</span> : null}
                  </td>
                  <td className={TD}>{payTiming(inv)}</td>
                  <td className={`${TD} text-right`}>
                    <Button size="sm" variant="quiet" onClick={() => actions.reopen.mutate(inv.id, { onError: (e) => toastError('Not saved', errorText(e)) })}>
                      Undo
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 rounded-md border border-line bg-surface-raised px-4 py-3">
        <span className="text-ink-muted">Total receivables (all open invoices)</span>
        <span className="font-mono text-[20px] font-medium">₹{inr(sumInr(data.invoices.filter((i) => i.status === 'open')))}</span>
      </div>

      {dialog?.kind === 'mark' ? (
        <MarkReceivedDialog
          invoice={dialog.invoice}
          partnerName={(dialog.invoice.partnerId && partnersById.get(dialog.invoice.partnerId)?.name) || 'No partner'}
          today={today}
          state={{ busy: actions.markReceived.isPending, error: dialogError }}
          onClose={close}
          onSave={(input) =>
            actions.markReceived.mutate(
              { id: dialog.invoice.id, ...input },
              { onSuccess: () => (close(), toastSuccess('Saved in the draft', 'Click Update to show it on the client page.')), onError: (e) => setDialogError(errorText(e)) },
            )
          }
        />
      ) : null}
      {dialog?.kind === 'pause' ? (
        <PauseDialog
          invoice={dialog.invoice}
          today={today}
          state={{ busy: actions.pause.isPending, error: dialogError }}
          onClose={close}
          onSave={(input) =>
            actions.pause.mutate(
              { id: dialog.invoice.id, ...input },
              { onSuccess: () => (close(), toastSuccess(input.until ? `Reminders paused until ${sheetDate(input.until)}` : 'Reminders resumed')), onError: (e) => setDialogError(errorText(e)) },
            )
          }
        />
      ) : null}
      {dialog?.kind === 'fx' ? (
        <FxEditDialog
          sheetId={data.sheet.id}
          invoice={dialog.invoice}
          today={today}
          state={{ busy: actions.updateInvoice.isPending, error: dialogError }}
          onClose={close}
          onSave={(patch) =>
            actions.updateInvoice.mutate({ id: dialog.invoice.id, patch }, { onSuccess: () => (close(), toastSuccess('Saved in the draft', 'Click Update to show it on the client page.')), onError: (e) => setDialogError(errorText(e)) })
          }
        />
      ) : null}
      {dialog?.kind === 'notes' ? <NotesDialog sheetId={data.sheet.id} invoice={dialog.invoice} onClose={close} /> : null}
      {dialog?.kind === 'add' ? (
        <AddInvoiceDialog
          sheetId={data.sheet.id}
          months={months}
          partners={data.partners}
          clients={clients}
          today={today}
          state={{ busy: actions.addInvoice.isPending, error: dialogError }}
          onClose={close}
          onSave={(input) => actions.addInvoice.mutate(input, { onSuccess: () => (close(), toastSuccess('Invoice added to the draft')), onError: (e) => setDialogError(errorText(e)) })}
        />
      ) : null}
    </>
  );
}
