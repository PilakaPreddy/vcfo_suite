'use client';

import { Field } from '@/components/ui/field';
import { fcLabel } from '@/lib/receivables/currencies';
import { sheetDate } from '@/lib/receivables/dates';
import { useFxForwards } from '@/hooks/use-receivables-fx-desk';
import { rateText } from '../../format';

/**
 * Mark received on a foreign invoice (Phase 10): optionally deliver the receipt against an open
 * forward contract of the same currency. Shows nothing while the sheet has no such contract, so
 * the dialog looks as before for a sheet that never books forwards.
 */
export function ForwardPicker({ sheetId, currency, value, onChange, receivedFc }: { sheetId: string; currency: string; value: string; onChange: (id: string) => void; receivedFc: number | null }) {
  const { data } = useFxForwards(sheetId);
  const open = (data ?? []).filter((f) => f.status === 'open' && f.currency === currency && f.unutilisedFc > 0);
  if (!open.length) return null;
  const chosen = open.find((f) => f.id === value);
  const hint = chosen
    ? receivedFc && receivedFc > chosen.unutilisedFc
      ? `Only ${fcLabel(chosen.unutilisedFc, currency)} is left on this contract; the rest is a spot receipt.`
      : `Delivered at the forward rate of ${rateText(chosen.forwardRate)}; ${fcLabel(Math.max(0, chosen.unutilisedFc - (receivedFc ?? 0)), currency)} stays open on it.`
    : 'Optional. Pick the contract the bank settled this receipt under.';
  return (
    <Field label="Forward contract" htmlFor="rcv-forward" hint={hint}>
      <select id="rcv-forward" className="h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px]" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None, at the spot rate</option>
        {open.map((f) => (
          <option key={f.id} value={f.id}>
            {`${f.bank}${f.contractNo ? ` ${f.contractNo}` : ''} · ${fcLabel(f.unutilisedFc, f.currency)} left @ ${rateText(f.forwardRate)} · matures ${sheetDate(f.maturityOn)}`}
          </option>
        ))}
      </select>
    </Field>
  );
}
