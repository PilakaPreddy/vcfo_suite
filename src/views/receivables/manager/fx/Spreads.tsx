'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { fcLabel } from '@/lib/receivables/currencies';
import { sheetDate } from '@/lib/receivables/dates';
import type { FxDeskDto } from '@/lib/receivables/fx-desk-wire';
import { inr, rateText } from '../../format';
import { NUM, TD, TH, invoiceName, pctText } from './fx-format';
import { Section, Signed, Table } from './shared';

/**
 * The bank's spread on the FX tab (Phase 10): for each foreign receipt, the rate the bank gave
 * (INR credited over the foreign amount received) against the reference rate of the paid date,
 * and what the difference cost in rupees. The summary averages it per bank and currency, weighted
 * by the amount received, so the manager can compare banks or ask for a better card rate.
 */

export function Spreads({ desk }: { desk: FxDeskDto }) {
  const [showAll, setShowAll] = useState(false);
  const total = desk.spreadSummary.reduce((a, s) => a + s.costInr, 0);
  const rows = showAll ? desk.spreads : desk.spreads.slice(0, 8);
  return (
    <Section id="fx-spreads" title="Bank spread on receipts" aside={desk.spreadSummary.length ? <>Cost so far <Signed n={Math.round(total)} cost /></> : undefined}>
      {desk.spreads.length === 0 ? (
        <EmptyState title="No foreign receipts with the amount received recorded" />
      ) : (
        <div className="grid gap-3">
          {desk.spreadSummary.length ? (
            <Table
              minWidth={600}
              label="Average spread per bank"
              head={
                <>
                  <th className={TH}>Bank</th>
                  <th className={TH}>Currency</th>
                  <th className={`${TH} text-right`}>Receipts</th>
                  <th className={`${TH} text-right`}>Received</th>
                  <th className={`${TH} text-right`}>Average spread</th>
                  <th className={`${TH} text-right`}>Cost INR</th>
                </>
              }
            >
              {desk.spreadSummary.map((s) => (
                <tr key={`${s.bank}-${s.currency}`}>
                  <td className={`${TD} font-medium`}>{s.bank}</td>
                  <td className={TD}>{s.currency}</td>
                  <td className={NUM}>{s.receipts}</td>
                  <td className={NUM}>{fcLabel(s.receivedFc, s.currency)}</td>
                  <td className={NUM}>{`₹${s.avgSpreadPerUnit.toFixed(4)} · ${pctText(s.avgSpreadPct)}`}</td>
                  <td className={NUM}>
                    <Signed n={s.costInr} cost />
                  </td>
                </tr>
              ))}
            </Table>
          ) : null}
          <Table
            minWidth={860}
            label="Spread on each receipt"
            head={
              <>
                <th className={TH}>Client · invoice</th>
                <th className={TH}>Paid</th>
                <th className={TH}>Bank</th>
                <th className={`${TH} text-right`}>Received</th>
                <th className={`${TH} text-right`}>Bank rate</th>
                <th className={`${TH} text-right`}>Reference</th>
                <th className={`${TH} text-right`}>Spread</th>
                <th className={`${TH} text-right`}>Cost INR</th>
              </>
            }
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={TD}>{invoiceName(r)}</td>
                <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.paidOn)}</td>
                <td className={TD}>{r.bank}</td>
                <td className={NUM}>
                  <div>{fcLabel(r.receivedFc, r.currency)}</div>
                  <div className="text-[11.5px] text-ink-faint">₹{inr(r.receivedInr)}</div>
                </td>
                <td className={NUM}>{rateText(r.effectiveRate)}</td>
                <td className={NUM}>{r.referenceRate === null ? <span className="text-[12px] text-ink-faint">No rate stored</span> : rateText(r.referenceRate)}</td>
                <td className={NUM}>{r.spreadPerUnit === null ? '—' : `${r.spreadPerUnit.toFixed(4)} · ${pctText(r.spreadPct)}`}</td>
                <td className={NUM}>
                  <Signed n={r.costInr} cost />
                </td>
              </tr>
            ))}
          </Table>
          {desk.spreads.length > 8 ? (
            <div>
              <Button size="sm" variant="quiet" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? 'Show the latest 8' : `Show all ${desk.spreads.length}`}
              </Button>
            </div>
          ) : null}
          <p className="text-[12px] text-ink-faint">A positive spread is what the bank kept below the reference rate. The bank is the source of the matched bank credit; receipts marked by hand read as entered by hand.</p>
        </div>
      )}
    </Section>
  );
}
