'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/spectrum-chip';
import { FOREIGN_CURRENCIES } from '@/lib/receivables/currencies';
import { sheetDate } from '@/lib/receivables/dates';
import type { FxAlertDirection, FxDeskDto } from '@/lib/receivables/fx-desk-wire';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { useFxDeskActions } from '@/hooks/use-receivables-fx-desk';
import { rateText } from '../../format';
import { errorText } from './fx-format';
import { Section } from './shared';

/**
 * Rate alerts on the FX tab (Phase 10): email me when a currency's reference rate goes above or
 * below a level. The 14:30 IST rates job checks them after storing the day's rates and emails the
 * sheet's manager at most once a day per alert.
 */

const SMALL_SELECT = 'h-8 rounded-md border-1.5 border-line-strong bg-surface-raised px-2 text-[13px]';

export function Alerts({ sheetId, desk }: { sheetId: string; desk: FxDeskDto }) {
  const act = useFxDeskActions(sheetId);
  const first = desk.currencies[0]?.currency ?? 'USD';
  const [currency, setCurrency] = useState(first);
  const [direction, setDirection] = useState<FxAlertDirection>('above');
  const [level, setLevel] = useState('');
  const n = Number(level.replace(/[,\s]/g, ''));
  const ok = Number.isFinite(n) && n > 0;
  const spot = (c: string) => desk.currencies.find((x) => x.currency === c)?.today?.rate ?? null;
  const add = () =>
    act.createAlert.mutate(
      { currency, direction, threshold: n },
      {
        onSuccess: () => {
          toastSuccess('Alert added', `You get an email when ${currency} goes ${direction} ₹${n.toFixed(4)}.`);
          setLevel('');
        },
        onError: (e) => toastError('Not saved', errorText(e)),
      },
    );
  const now = spot(currency);
  return (
    <Section id="fx-alerts" title="Rate alerts" aside="Checked after the 14:30 IST rates, emailed to you">
      <form
        className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line bg-surface-raised p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) add();
        }}
      >
        <label htmlFor="fx-alert-cur" className="grid gap-1 text-[12px] text-ink-muted">
          Currency
          <select id="fx-alert-cur" className={SMALL_SELECT} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {FOREIGN_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="fx-alert-dir" className="grid gap-1 text-[12px] text-ink-muted">
          When the rate goes
          <select id="fx-alert-dir" className={SMALL_SELECT} value={direction} onChange={(e) => setDirection(e.target.value === 'below' ? 'below' : 'above')}>
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
        </label>
        <label htmlFor="fx-alert-level" className="grid gap-1 text-[12px] text-ink-muted">
          {`Level (INR per ${currency})`}
          <Input id="fx-alert-level" inputMode="decimal" placeholder={now ? now.toFixed(2) : ''} value={level} onChange={(e) => setLevel(e.target.value)} className="h-8 w-[130px] font-mono" />
        </label>
        <Button size="sm" type="submit" disabled={!ok || act.createAlert.isPending}>
          Add alert
        </Button>
        {now ? <span className="pb-1.5 text-[12px] text-ink-faint">{`Today ${rateText(now)}`}</span> : null}
      </form>
      {desk.alerts.length === 0 ? (
        <EmptyState title="No rate alerts yet" />
      ) : (
        <ul className="grid gap-2">
          {desk.alerts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-raised px-3 py-2 text-[13px]">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <b className="font-semibold">{`${a.currency} ${a.direction} ₹${rateText(a.threshold)}`}</b>
                {!a.active ? (
                  <Chip raw tone="idle">
                    Off
                  </Chip>
                ) : a.crossedNow ? (
                  <Chip raw tone="warn">
                    Crossed now
                  </Chip>
                ) : (
                  <Chip raw tone="prog">
                    Watching
                  </Chip>
                )}
                <span className="text-[12px] text-ink-muted">{`Today ${rateText(spot(a.currency))}${a.lastTriggeredOn ? ` · last emailed ${sheetDate(a.lastTriggeredOn)}` : ''}`}</span>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={act.updateAlert.isPending}
                  onClick={() => act.updateAlert.mutate({ id: a.id, active: !a.active }, { onSuccess: () => toastSuccess(a.active ? 'Alert turned off' : 'Alert turned on'), onError: (e) => toastError('Not saved', errorText(e)) })}
                >
                  {a.active ? 'Turn off' : 'Turn on'}
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  className="text-danger"
                  disabled={act.deleteAlert.isPending}
                  onClick={() => act.deleteAlert.mutate(a.id, { onSuccess: () => toastSuccess('Alert removed'), onError: (e) => toastError('Not removed', errorText(e)) })}
                  aria-label={`Remove the ${a.currency} ${a.direction} ${rateText(a.threshold)} alert`}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
