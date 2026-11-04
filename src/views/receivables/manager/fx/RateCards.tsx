'use client';

import { useState } from 'react';
import { DashSparkline } from '@/components/charts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Chip } from '@/components/ui/spectrum-chip';
import { currencyInfo } from '@/lib/receivables/currencies';
import { addDaysIso, sheetDate } from '@/lib/receivables/dates';
import type { FxCurrencyDto } from '@/lib/receivables/fx-desk-wire';
import type { RateInForceDto } from '@/lib/receivables/reports-wire';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { useFxDeskActions } from '@/hooks/use-receivables-fx-desk';
import { errorText, pctText, signedRate } from './fx-format';

/**
 * The rate cards of the FX tab (Phase 10): one per currency in use, with today's rate in force
 * and its source, the change over 30 days, a 30-day sparkline and the manual override, which
 * wins over the fetched rate of that day everywhere (Sheet, Reports and FX tabs).
 */

const LINE = 'oklch(var(--data-1))';

export function SourceChip({ rate, today }: { rate: RateInForceDto; today: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Chip raw tone={rate.source === 'manual' ? 'warn' : rate.source === 'fbil' ? 'ok' : 'idle'}>
        {rate.source === 'manual' ? 'Set by hand' : rate.source === 'fbil' ? 'FBIL' : 'ECB'}
      </Chip>
      <span>{rate.rateDate === today ? 'Today' : sheetDate(rate.rateDate)}</span>
    </span>
  );
}

function RateCard({ c, today, onOverride }: { c: FxCurrencyDto; today: string; onOverride: () => void }) {
  const info = currencyInfo(c.currency);
  const d30 = c.trend.d30;
  const tone = (d30.change ?? 0) > 0 ? 'text-positive' : (d30.change ?? 0) < 0 ? 'text-danger' : 'text-ink-muted';
  const spark = c.history.filter((p) => p.date >= addDaysIso(today, -30)).map((p) => ({ date: p.date, rate: p.rate }));
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface-raised p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[.04em] text-ink-muted">{`${c.currency} to INR`}</div>
          <div className="truncate text-[12px] text-ink-faint">{info.name}</div>
        </div>
        <Button size="sm" variant="quiet" onClick={onOverride} aria-label={`Override the ${c.currency} rate`}>
          Override
        </Button>
      </div>
      {c.today ? (
        <>
          <div className="font-mono text-[22px] font-semibold leading-none tabular-nums">₹{c.today.rate.toFixed(4)}</div>
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[12px] text-ink-muted">
            <SourceChip rate={c.today} today={today} />
            {d30.points > 1 ? <span className={`font-mono tabular-nums ${tone}`}>{`${signedRate(d30.change)} (${pctText(d30.changePct)}) 30d`}</span> : <span className="text-ink-faint">No 30-day history</span>}
          </div>
          <DashSparkline data={spark} valueKey="rate" color={LINE} />
        </>
      ) : (
        <p className="text-[12.5px] text-ink-muted">No rate yet. Rates are fetched at 14:30 IST on weekdays; set one by hand meanwhile.</p>
      )}
    </div>
  );
}

export function RateOverrideDialog({ sheetId, currency, today, current, onClose }: { sheetId: string; currency: string; today: string; current: RateInForceDto | null; onClose: () => void }) {
  const act = useFxDeskActions(sheetId);
  const [day, setDay] = useState(today);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const n = Number(value.replace(/[,\s]/g, ''));
  const ok = Number.isFinite(n) && n > 0 && Boolean(day) && day <= today;
  const save = () =>
    act.setRate.mutate(
      { currency, rateDate: day, rate: n, note: note.trim() || null },
      {
        onSuccess: () => {
          toastSuccess('Rate saved', `${currency} ${n.toFixed(4)} is used for ${sheetDate(day)}.`);
          onClose();
        },
        onError: (e) => toastError('Not saved', errorText(e)),
      },
    );
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Override the ${currency} rate`}
      sub={current ? `In force: ₹${current.rate.toFixed(4)} (${current.source === 'manual' ? 'set by hand' : current.source.toUpperCase()}, ${sheetDate(current.rateDate)})` : 'No rate is stored yet.'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ok || act.setRate.isPending} onClick={save}>
            {act.setRate.isPending ? 'Saving…' : 'Save rate'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day" htmlFor="fx-ovr-day">
            <Input id="fx-ovr-day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label={`INR per ${currency}`} htmlFor="fx-ovr-rate">
            <Input id="fx-ovr-rate" inputMode="decimal" placeholder={current ? current.rate.toFixed(4) : ''} value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
          </Field>
        </div>
        <Field label="Note" htmlFor="fx-ovr-note" hint="Optional, for example the bank's card rate.">
          <Input id="fx-ovr-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-[12.5px] text-ink-muted">The override wins over the fetched rate of that day on every tab.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function RateCards({ sheetId, currencies, today }: { sheetId: string; currencies: FxCurrencyDto[]; today: string }) {
  const [override, setOverride] = useState<FxCurrencyDto | null>(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {currencies.map((c) => (
          <RateCard key={c.currency} c={c} today={today} onOverride={() => setOverride(c)} />
        ))}
      </div>
      {override ? <RateOverrideDialog sheetId={sheetId} currency={override.currency} today={today} current={override.today} onClose={() => setOverride(null)} /> : null}
    </>
  );
}
