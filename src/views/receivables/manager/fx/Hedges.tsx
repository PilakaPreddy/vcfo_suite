'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Chip } from '@/components/ui/spectrum-chip';
import { FOREIGN_CURRENCIES, fcLabel } from '@/lib/receivables/currencies';
import { addDaysIso, sheetDate } from '@/lib/receivables/dates';
import type { FxDeskDto, FxForwardDto, FxForwardInput } from '@/lib/receivables/fx-desk-wire';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { useFxDeskActions } from '@/hooks/use-receivables-fx-desk';
import { rateText } from '../../format';
import { NUM, SELECT, TD, TH, errorText } from './fx-format';
import { Section, Signed, Table } from './shared';

/**
 * Hedge cover on the FX tab (Phase 10): for each currency, how much of the open exposure the
 * open forward contracts cover, their weighted rate and what they are worth against spot; then
 * the contracts themselves with add, edit, close and cancel. A receipt is delivered against a
 * contract from Mark received; a fully used contract closes by itself.
 */

const STATUS_TONE = { open: 'prog', closed: 'ok', cancelled: 'idle' } as const;
const STATUS_TEXT = { open: 'Open', closed: 'Closed', cancelled: 'Cancelled' } as const;

function ForwardDialog({ sheetId, forward, today, currencies, onClose }: { sheetId: string; forward: FxForwardDto | null; today: string; currencies: string[]; onClose: () => void }) {
  const act = useFxDeskActions(sheetId);
  const [f, setF] = useState(() => ({
    currency: forward?.currency ?? currencies[0] ?? 'USD',
    bank: forward?.bank ?? '',
    contractNo: forward?.contractNo ?? '',
    amountFc: forward ? String(forward.amountFc) : '',
    forwardRate: forward ? String(forward.forwardRate) : '',
    bookedOn: forward?.bookedOn ?? today,
    maturityOn: forward?.maturityOn ?? addDaysIso(today, 90),
    note: forward?.note ?? '',
  }));
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const amount = Number(f.amountFc.replace(/[,\s]/g, ''));
  const rate = Number(f.forwardRate.replace(/[,\s]/g, ''));
  const ok = f.bank.trim() && amount > 0 && rate > 0 && f.bookedOn && f.maturityOn && f.maturityOn >= f.bookedOn;
  const busy = act.createForward.isPending || act.updateForward.isPending;
  const input: FxForwardInput = { currency: f.currency, bank: f.bank.trim(), contractNo: f.contractNo.trim() || null, amountFc: amount, forwardRate: rate, bookedOn: f.bookedOn, maturityOn: f.maturityOn, note: f.note.trim() || null };
  const done = { onSuccess: () => (toastSuccess(forward ? 'Contract saved' : 'Forward contract added'), onClose()), onError: (e: unknown) => toastError('Not saved', errorText(e)) };
  const save = () => (forward ? act.updateForward.mutate({ id: forward.id, ...input }, done) : act.createForward.mutate(input, done));
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={forward ? 'Edit forward contract' : 'Add forward contract'}
      sub="A forward fixes the rupee rate for a foreign amount the bank will buy from you by the maturity date."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ok || busy} onClick={save}>
            {busy ? 'Saving…' : forward ? 'Save' : 'Add contract'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Currency" htmlFor="fwd-currency">
            <select id="fwd-currency" className={SELECT} value={f.currency} disabled={Boolean(forward && forward.utilisedFc > 0)} onChange={(e) => set({ currency: e.target.value })}>
              {FOREIGN_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {`${c.code} · ${c.name}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bank" htmlFor="fwd-bank">
            <Input id="fwd-bank" maxLength={80} placeholder="e.g. HSBC" value={f.bank} onChange={(e) => set({ bank: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Amount (${f.currency})`} htmlFor="fwd-amount" hint={forward && forward.utilisedFc > 0 ? `${fcLabel(forward.utilisedFc, forward.currency)} already delivered.` : undefined}>
            <Input id="fwd-amount" inputMode="decimal" value={f.amountFc} onChange={(e) => set({ amountFc: e.target.value })} className="font-mono" />
          </Field>
          <Field label={`Forward rate (INR per ${f.currency})`} htmlFor="fwd-rate">
            <Input id="fwd-rate" inputMode="decimal" value={f.forwardRate} onChange={(e) => set({ forwardRate: e.target.value })} className="font-mono" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Booked on" htmlFor="fwd-booked">
            <Input id="fwd-booked" type="date" value={f.bookedOn} onChange={(e) => set({ bookedOn: e.target.value })} />
          </Field>
          <Field label="Matures on" htmlFor="fwd-maturity" error={f.maturityOn && f.bookedOn && f.maturityOn < f.bookedOn ? 'On or after the booking date.' : undefined}>
            <Input id="fwd-maturity" type="date" value={f.maturityOn} min={f.bookedOn} onChange={(e) => set({ maturityOn: e.target.value })} />
          </Field>
        </div>
        <Field label="Contract number" htmlFor="fwd-no" hint="Optional.">
          <Input id="fwd-no" maxLength={60} value={f.contractNo} onChange={(e) => set({ contractNo: e.target.value })} className="font-mono" />
        </Field>
        <Field label="Note" htmlFor="fwd-note" hint="Optional.">
          <Input id="fwd-note" maxLength={200} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        {ok ? <p className="text-[12.5px] text-ink-muted">{`Locks ${fcLabel(amount, f.currency)} at ₹${rate.toFixed(4)}: ₹${Math.round(amount * rate).toLocaleString('en-IN')}.`}</p> : null}
      </div>
    </Modal>
  );
}

function ForwardRow({ f, today, onEdit, sheetId }: { f: FxForwardDto; today: string; onEdit: () => void; sheetId: string }) {
  const act = useFxDeskActions(sheetId);
  const busy = act.updateForward.isPending || act.cancelForward.isPending;
  const matured = f.status === 'open' && f.maturityOn < today;
  const used = f.amountFc > 0 ? Math.min(100, Math.round((f.utilisedFc / f.amountFc) * 100)) : 0;
  return (
    <tr>
      <td className={TD}>
        <div className="font-medium">{`${f.bank}${f.contractNo ? ` · ${f.contractNo}` : ''}`}</div>
        <div className="text-[12px] text-ink-muted">{`Booked ${sheetDate(f.bookedOn)}${f.note ? ` · ${f.note}` : ''}`}</div>
      </td>
      <td className={NUM}>{fcLabel(f.amountFc, f.currency)}</td>
      <td className={NUM}>{rateText(f.forwardRate)}</td>
      <td className={NUM}>
        <div>{fcLabel(f.unutilisedFc, f.currency)}</div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={`${used}% delivered`}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${used}%` }} />
        </div>
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        {sheetDate(f.maturityOn)}
        {matured ? (
          <Chip raw tone="bad" className="ml-1.5">
            Matured
          </Chip>
        ) : null}
      </td>
      <td className={TD}>
        <Chip raw tone={STATUS_TONE[f.status]}>
          {STATUS_TEXT[f.status]}
        </Chip>
      </td>
      <td className={`${TD} text-right`}>
        <div className="flex flex-wrap justify-end gap-1">
          {f.status !== 'cancelled' ? (
            <Button size="sm" variant="quiet" onClick={onEdit} disabled={busy}>
              Edit
            </Button>
          ) : null}
          {f.status === 'open' ? (
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => act.updateForward.mutate({ id: f.id, status: 'closed' }, { onSuccess: () => toastSuccess('Contract closed'), onError: (e) => toastError('Not saved', errorText(e)) })}>
              Close
            </Button>
          ) : f.status === 'closed' ? (
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => act.updateForward.mutate({ id: f.id, status: 'open' }, { onSuccess: () => toastSuccess('Contract reopened'), onError: (e) => toastError('Not saved', errorText(e)) })}>
              Reopen
            </Button>
          ) : null}
          {f.status !== 'cancelled' ? (
            <Button
              size="sm"
              variant="quiet"
              className="text-danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Cancel the ${f.currency} contract with ${f.bank}? It stays in the list but no longer counts as cover.`))
                  act.cancelForward.mutate(f.id, { onSuccess: () => toastSuccess('Contract cancelled'), onError: (e) => toastError('Not saved', errorText(e)) });
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function Hedges({ sheetId, desk }: { sheetId: string; desk: FxDeskDto }) {
  const [dialog, setDialog] = useState<{ forward: FxForwardDto | null } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const inUse = desk.exposure.map((e) => e.currency);
  const list = showAll ? desk.forwards : desk.forwards.filter((f) => f.status === 'open');
  const hidden = desk.forwards.length - desk.forwards.filter((f) => f.status === 'open').length;
  return (
    <Section
      id="fx-hedges"
      title="Hedge cover"
      aside="Open forward contracts against open exposure"
      action={
        <Button size="sm" variant="secondary" onClick={() => setDialog({ forward: null })}>
          Add forward
        </Button>
      }
    >
      {desk.hedges.length === 0 ? (
        <EmptyState title="No exposure and no forward contracts" />
      ) : (
        <Table
          minWidth={760}
          label="Hedge cover by currency"
          head={
            <>
              <th className={TH}>Currency</th>
              <th className={`${TH} text-right`}>Exposure</th>
              <th className={`${TH} text-right`}>Hedged</th>
              <th className={TH}>Cover</th>
              <th className={`${TH} text-right`}>Forward rate</th>
              <th className={`${TH} text-right`}>Spot</th>
              <th className={`${TH} text-right`}>Forwards vs spot</th>
            </>
          }
        >
          {desk.hedges.map((h) => {
            const cover = h.coverPct ?? (h.hedgedFc > 0 ? 100 : 0);
            return (
              <tr key={h.currency}>
                <td className={`${TD} font-semibold`}>
                  {h.currency}
                  {h.maturedForwards ? <span className="ml-1.5 text-[12px] font-normal text-danger">{`${h.maturedForwards} matured`}</span> : null}
                </td>
                <td className={NUM}>{fcLabel(h.exposureFc, h.currency)}</td>
                <td className={NUM}>{fcLabel(h.hedgedFc, h.currency)}</td>
                <td className={TD}>
                  <div className="flex min-w-[140px] items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={`${h.coverPct ?? 0}% covered`}>
                      <div className={`h-full rounded-full ${cover > 100 ? 'bg-warning-mid' : 'bg-positive-mid'}`} style={{ width: `${Math.min(100, cover)}%` }} />
                    </div>
                    <span className="w-[52px] text-right font-mono text-[12px] tabular-nums">{h.coverPct === null ? '—' : `${h.coverPct}%`}</span>
                  </div>
                </td>
                <td className={NUM}>{rateText(h.weightedForwardRate)}</td>
                <td className={NUM}>{rateText(h.spotRate)}</td>
                <td className={NUM}>
                  <Signed n={h.forwardVsSpotInr} />
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <div className="mt-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[.04em] text-ink-muted">Forward contracts</h3>
          {hidden > 0 ? (
            <Button size="sm" variant="quiet" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Open only' : `Show ${hidden} closed or cancelled`}
            </Button>
          ) : null}
        </div>
        {list.length === 0 ? (
          <EmptyState title={desk.forwards.length ? 'No open forward contracts' : 'No forward contracts booked'} action={<Button size="sm" variant="secondary" onClick={() => setDialog({ forward: null })}>Add forward</Button>} />
        ) : (
          <Table
            minWidth={820}
            label="Forward contracts"
            head={
              <>
                <th className={TH}>Bank · contract</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-right`}>Rate</th>
                <th className={`${TH} text-right`}>Left to deliver</th>
                <th className={TH}>Matures</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </>
            }
          >
            {list.map((f) => (
              <ForwardRow key={f.id} f={f} today={desk.today} sheetId={sheetId} onEdit={() => setDialog({ forward: f })} />
            ))}
          </Table>
        )}
      </div>
      {dialog ? <ForwardDialog sheetId={sheetId} forward={dialog.forward} today={desk.today} currencies={inUse} onClose={() => setDialog(null)} /> : null}
    </Section>
  );
}
