'use client';

import type { ReactNode } from 'react';
import { CalendarClock, CircleAlert, Gauge, Handshake, Landmark, Wallet } from 'lucide-react';
import { DashHero, type DashHeroStat } from '@/components/dash/DashHero';
import type { ShareStatus } from '@/lib/receivables/share-filters';
import { DSO_WINDOW_DAYS, compactInr, type SheetKpis } from '@/lib/receivables/kpis';
import { inr } from '../../format';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The sheet's summary card (Phase 10): the one home card, `DashHero`, with the six headline
 * numbers. A tile that maps to a status filter sets it (Overdue shows the overdue rows).
 */
export function SheetSummary({ title, kpis, onStatus, children }: { title: string; kpis: SheetKpis; onStatus: (s: ShareStatus) => void; children?: ReactNode }) {
  const stats: DashHeroStat[] = [
    {
      label: 'Open receivables',
      icon: Wallet,
      value: kpis.openCount,
      of: kpis.openCount === 1 ? 'invoice' : 'invoices',
      note: `₹${inr(kpis.openInr)}`,
      onClick: () => onStatus('open'),
      how: 'Every open invoice in the draft and its open balance in rupees, after part payments and credit notes.',
    },
    {
      label: 'Overdue',
      icon: CircleAlert,
      value: compactInr(kpis.overdueInr),
      hot: kpis.overdueCount > 0,
      note: kpis.overdueCount ? `${plural(kpis.overdueCount, 'invoice')} · oldest ${plural(kpis.oldestOverdueDays, 'day')}` : 'Nothing overdue',
      onClick: () => onStatus('overdue'),
      how: 'Open invoices past their due date. The oldest is the one longest past due.',
    },
    {
      label: 'Due in 7 days',
      icon: CalendarClock,
      value: compactInr(kpis.dueSoonInr),
      note: kpis.dueSoonCount ? plural(kpis.dueSoonCount, 'invoice') : 'Nothing due',
      onClick: () => onStatus('due_soon'),
      how: 'Open invoices due today or in the next seven days.',
    },
    {
      label: 'Collected this month',
      icon: Landmark,
      value: compactInr(kpis.collectedMonthInr),
      good: kpis.collectedMonthInr > 0,
      note: kpis.collectedMonthCount ? plural(kpis.collectedMonthCount, 'receipt') : 'No receipts yet',
      onClick: () => onStatus('received'),
      how: 'Invoices marked received with a paid-on date in this month. A part payment counts once the invoice is fully received.',
    },
    {
      label: 'DSO',
      icon: Gauge,
      value: kpis.dsoDays === null ? '—' : kpis.dsoDays,
      of: kpis.dsoDays === null ? undefined : 'days',
      note: kpis.dsoDays === null ? `Nothing billed in ${DSO_WINDOW_DAYS} days` : `Last ${DSO_WINDOW_DAYS} days · ${compactInr(kpis.billedWindowInr)} billed`,
      how: `Days sales outstanding: the open balance divided by the amount billed in the last ${DSO_WINDOW_DAYS} days, times ${DSO_WINDOW_DAYS}. An invoice counts as billed on its invoice date, or the first of its month when there is none.`,
    },
    {
      label: 'Promises this week',
      icon: Handshake,
      value: kpis.promisesWeekCount,
      hot: kpis.promisesBrokenCount > 0 && kpis.promisesWeekCount === 0,
      note: kpis.promisesBrokenCount ? `${plural(kpis.promisesBrokenCount, 'promise')} broken` : kpis.promisesWeekCount ? `${compactInr(kpis.promisesWeekInr)} promised` : 'None due',
      how: 'Open invoices whose client partner recorded a promised payment date today or in the next six days. Broken: the promised date has passed and the invoice is still open.',
    },
  ];
  return (
    <DashHero title={title} stats={stats}>
      {children}
    </DashHero>
  );
}
