'use client';

import { SkeletonRows } from '@/components/ui/empty-state';
import { useFxDesk } from '@/hooks/use-receivables-fx-desk';
import { useReports } from '@/hooks/use-receivables-reports';
import { Alerts } from './fx/Alerts';
import { Exposure, Realised } from './fx/Exposure';
import { Hedges } from './fx/Hedges';
import { RateCards } from './fx/RateCards';
import { RateHistory } from './fx/RateHistory';
import { Section } from './fx/shared';
import { Spreads } from './fx/Spreads';
import { WhatIf } from './fx/WhatIf';

/**
 * The FX tab (Phase 10, docs/specs/receivables/PLAN.md, "forex desk"): every currency in use on
 * the sheet. Rate cards with the manual override, 90 days of rate history against the booked
 * rates, exposure by currency and the open invoices behind it, hedge cover with the forward
 * contracts, a what-if on the rupee, the bank's spread on each receipt, the realised gain or
 * loss, and rate alerts. Everything reads the draft, so it needs no Update. The figures come from
 * the FX desk route; the per-invoice open and realised tables reuse the Reports tab's data.
 */
export function FxTab({ sheetId }: { sheetId: string }) {
  const { data, isLoading, error } = useFxDesk(sheetId);
  const reports = useReports(sheetId);
  if (isLoading) return <SkeletonRows rows={6} />;
  if (error) return <p className="py-10 text-center text-danger">{error.message}</p>;
  if (!data) return null;
  return (
    <>
      <Section id="fx-rates" title="Rates today" aside="INR per unit · manual overrides win for their day">
        <RateCards sheetId={sheetId} currencies={data.currencies} today={data.today} />
      </Section>
      <Section id="fx-history" title="Rate history" aside="90 days, against the booked rates of open invoices">
        <RateHistory currencies={data.currencies} />
      </Section>
      <Exposure desk={data} reports={reports.data} />
      <Hedges sheetId={sheetId} desk={data} />
      <WhatIf desk={data} />
      <Spreads desk={data} />
      <Realised reports={reports.data} />
      <Alerts sheetId={sheetId} desk={data} />
    </>
  );
}
