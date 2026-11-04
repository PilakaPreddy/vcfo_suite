'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { fcLabel } from '@/lib/receivables/currencies';
import { sheetDate } from '@/lib/receivables/dates';
import type { FxDeskDto } from '@/lib/receivables/fx-desk-wire';
import type { ReportsDto } from '@/lib/receivables/reports-wire';
import { inr, rateText } from '../../format';
import { NUM, TD, TH, invoiceName, pctText } from './fx-format';
import { Section, Signed, Table } from './shared';

/**
 * Exposure on the FX tab (Phase 10): what is still to come in each foreign currency, its INR at
 * the booked rates and at today's, and the unrealised change; then each open foreign invoice
 * (moved here from the Reports tab) and the realised gain or loss on the foreign receipts.
 */

export function Exposure({ desk, reports }: { desk: FxDeskDto; reports: ReportsDto | undefined }) {
  const [showInvoices, setShowInvoices] = useState(false);
  const open = reports?.fx.open ?? [];
  return (
    <Section
      id="fx-exposure"
      title="Exposure"
      aside={desk.exposure.length ? `₹${inr(desk.exposureTotals.inrToday)} at today's rates` : undefined}
      action={
        open.length ? (
          <Button size="sm" variant="quiet" onClick={() => setShowInvoices((v) => !v)} aria-expanded={showInvoices}>
            {showInvoices ? 'Hide invoices' : `Show ${open.length} invoice${open.length === 1 ? '' : 's'}`}
          </Button>
        ) : null
      }
    >
      {desk.exposure.length === 0 ? (
        <EmptyState title="No open foreign invoices" />
      ) : (
        <Table
          minWidth={720}
          label="Exposure by currency"
          head={
            <>
              <th className={TH}>Currency</th>
              <th className={`${TH} text-right`}>Invoices</th>
              <th className={`${TH} text-right`}>Open amount</th>
              <th className={`${TH} text-right`}>Booked INR</th>
              <th className={`${TH} text-right`}>Rate today</th>
              <th className={`${TH} text-right`}>INR today</th>
              <th className={`${TH} text-right`}>Unrealised</th>
            </>
          }
        >
          {desk.exposure.map((e) => (
            <tr key={e.currency}>
              <td className={`${TD} font-semibold`}>{e.currency}</td>
              <td className={NUM}>{e.invoices}</td>
              <td className={NUM}>{fcLabel(e.openFc, e.currency)}</td>
              <td className={NUM}>{inr(e.bookedInr)}</td>
              <td className={NUM}>{rateText(e.spotRate)}</td>
              <td className={NUM}>{e.inrToday === null ? '—' : inr(e.inrToday)}</td>
              <td className={NUM}>
                <Signed n={e.changeInr} />
                {e.changePct !== null ? <span className="ml-1 text-[11.5px] text-ink-faint">{pctText(e.changePct)}</span> : null}
              </td>
            </tr>
          ))}
          {desk.exposure.length > 1 ? (
            <tr className="font-semibold">
              <td className={TD} colSpan={3}>
                All currencies
              </td>
              <td className={NUM}>{inr(desk.exposureTotals.bookedInr)}</td>
              <td className={NUM} />
              <td className={NUM}>{inr(desk.exposureTotals.inrToday)}</td>
              <td className={NUM}>
                <Signed n={desk.exposureTotals.changeInr} />
              </td>
            </tr>
          ) : null}
        </Table>
      )}
      {showInvoices && open.length ? (
        <div className="mt-3">
          <Table
            minWidth={760}
            label="Open foreign invoices at today's rate"
            head={
              <>
                <th className={TH}>Client · invoice</th>
                <th className={TH}>Due</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-right`}>Booked rate</th>
                <th className={`${TH} text-right`}>Booked INR</th>
                <th className={`${TH} text-right`}>INR today</th>
                <th className={`${TH} text-right`}>Change</th>
              </>
            }
          >
            {open.map((r) => (
              <tr key={r.id}>
                <td className={TD}>{invoiceName(r)}</td>
                <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.dueDate)}</td>
                <td className={NUM}>{fcLabel(r.fcAmount, r.currency)}</td>
                <td className={NUM}>{rateText(r.bookedRate)}</td>
                <td className={NUM}>{inr(r.bookedInr)}</td>
                <td className={NUM}>{r.inrToday === null ? '—' : inr(r.inrToday)}</td>
                <td className={NUM}>
                  <Signed n={r.changeInr} />
                  {r.changePct !== null ? <span className="ml-1 text-[11.5px] text-ink-faint">{pctText(r.changePct)}</span> : null}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      ) : null}
    </Section>
  );
}

export function Realised({ reports }: { reports: ReportsDto | undefined }) {
  if (!reports) return null;
  const { realised, realisedTotals } = reports.fx;
  return (
    <Section id="fx-realised" title="Realised on receipts" aside={realised.length ? <Signed n={realisedTotals.realisedInr} /> : undefined}>
      {realised.length === 0 ? (
        <EmptyState title="No foreign receipts yet" />
      ) : (
        <Table
          minWidth={820}
          label="Received foreign invoices"
          head={
            <>
              <th className={TH}>Client · invoice</th>
              <th className={TH}>Received</th>
              <th className={`${TH} text-right`}>Invoiced</th>
              <th className={`${TH} text-right`}>Arrived</th>
              <th className={`${TH} text-right`}>INR credited</th>
              <th className={`${TH} text-right`}>Booked / effective rate</th>
              <th className={`${TH} text-right`}>Bank charges</th>
              <th className={`${TH} text-right`}>Realised</th>
            </>
          }
        >
          {realised.map((r) => (
            <tr key={r.id}>
              <td className={TD}>{invoiceName(r)}</td>
              <td className={`${TD} whitespace-nowrap`}>{r.paidOn ? sheetDate(r.paidOn) : '—'}</td>
              <td className={NUM}>{fcLabel(r.fcAmount, r.currency)}</td>
              <td className={NUM}>{fcLabel(r.receivedFc, r.currency)}</td>
              <td className={NUM}>{r.receivedInr === null ? '—' : inr(r.receivedInr)}</td>
              <td className={NUM}>{`${rateText(r.bookedRate)} / ${rateText(r.effectiveRate)}`}</td>
              <td className={NUM}>{r.bankChargesFc === null ? '—' : `${fcLabel(r.bankChargesFc, r.currency)} · ₹${inr(r.bankChargesInr)}`}</td>
              <td className={NUM}>{r.realisedInr === null ? <span className="text-[12px] text-ink-faint">{`${r.currency} received not recorded`}</span> : <Signed n={r.realisedInr} />}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={TD} colSpan={6}>
              Realised
            </td>
            <td className={NUM}>₹{inr(realisedTotals.bankChargesInr)}</td>
            <td className={NUM}>
              <Signed n={realisedTotals.realisedInr} />
            </td>
          </tr>
        </Table>
      )}
    </Section>
  );
}
