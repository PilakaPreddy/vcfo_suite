'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { fcLabel } from '@/lib/receivables/currencies';
import type { FxDeskDto } from '@/lib/receivables/fx-desk-wire';
import { inr, rateText } from '../../format';
import { NUM, TD, TH } from './fx-format';
import { Section, Signed, Table } from './shared';

/**
 * The what-if on the FX tab (Phase 10): what the open exposure of each currency is worth if the
 * rupee moves by one to three rupees, or by one or two per cent, either way. "Change" shows the
 * difference against today's value; "Value" shows the INR, optionally with the hedged part held
 * at the forward rate.
 */

type View = 'change' | 'value' | 'hedged';

export function WhatIf({ desk }: { desk: FxDeskDto }) {
  const [view, setView] = useState<View>('change');
  const hasHedges = desk.hedges.some((h) => h.hedgedFc > 0);
  const rows = desk.whatIf.filter((r) => r.spotRate !== null);
  return (
    <Section
      id="fx-what-if"
      title="What if the rate moves"
      aside="Open exposure revalued at a moved rate"
      action={
        rows.length ? (
          <SpectrumTabs
            label="What-if view"
            items={[{ key: 'change', label: 'Change' }, { key: 'value', label: 'Value' }, ...(hasHedges ? [{ key: 'hedged', label: 'Net of forwards' }] : [])]}
            value={view}
            onChange={(k) => setView(k as View)}
          />
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No open foreign exposure with a rate to move" />
      ) : (
        <Table
          minWidth={1020}
          label="What-if on the rupee"
          head={
            <>
              <th className={TH}>Currency</th>
              <th className={`${TH} text-right`}>Today</th>
              {desk.whatIfMoves.map((m) => (
                <th key={m.key} className={`${TH} text-right`}>
                  {m.label}
                </th>
              ))}
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.currency}>
              <td className={TD}>
                <div className="font-semibold">{r.currency}</div>
                <div className="whitespace-nowrap text-[12px] text-ink-muted">{fcLabel(r.openFc, r.currency)}</div>
              </td>
              <td className={NUM}>
                <div>{r.inrToday === null ? '—' : inr(r.inrToday)}</div>
                <div className="text-[11.5px] text-ink-faint">@ {rateText(r.spotRate)}</div>
              </td>
              {r.cells.map((c) => (
                <td key={c.key} className={NUM}>
                  {c.rate === null ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    <>
                      <div>{view === 'change' ? <Signed n={c.changeVsToday} /> : inr(view === 'hedged' ? c.inrNetOfHedges : c.inr)}</div>
                      <div className="text-[11.5px] text-ink-faint">@ {rateText(c.rate)}</div>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      )}
      <p className="mt-1.5 text-[12px] text-ink-faint">A minus move is a stronger rupee: fewer rupees per unit. A move that would take the rate to zero or below is left blank.</p>
    </Section>
  );
}
