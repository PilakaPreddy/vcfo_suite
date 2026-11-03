'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { FilterSelect } from '@/components/ui/native-select';
import { monthBlockTitle, monthShort, sheetDate } from '@/lib/receivables/dates';
import type { SnapshotRow } from '@/lib/receivables/model';
import { publicView, validPartner } from '@/lib/receivables/public-view';
import { payTiming, sumInr } from '@/lib/receivables/summary';
import { inr, stamp } from '../format';
import { StatusChip } from '../StatusChip';

/**
 * The client page (/receivables/k/<key>, docs/specs/receivables/PLAN.md): no login, read-only,
 * the latest published version only. A client partner picks their name; the choice is kept in the
 * address (?partner=) and remembered on this device.
 */

export type ClientPageProps = {
  clientOrgName: string;
  publishedAt: string;
  rows: SnapshotRow[];
  partners: Array<{ slug: string; name: string }>;
  today: string;
  /** The Excel download address, key included, without the partner. */
  exportHref: string;
  /** Where the remembered partner is stored on this device; one per sheet. */
  storageKey: string;
};

const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2.5 py-2 align-middle';

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-raised px-4 py-3.5">
      <div className="text-[12px] text-ink-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[20px] font-medium">{value}</div>
      <div className="text-[12px] text-ink-muted">{sub}</div>
    </div>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function ClientPage({ clientOrgName, publishedAt, rows, partners, today, exportHref, storageKey }: ClientPageProps) {
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = validPartner(params.get('partner'), partners);
  const [partner, setPartner] = useState<string | null>(fromUrl);

  // No partner in the address: use the one this device picked last time.
  useEffect(() => {
    if (fromUrl) return;
    try {
      const saved = validPartner(window.localStorage.getItem(storageKey), partners);
      if (saved) setPartner(saved);
    } catch {
      /* Storage can be blocked; the page works without it. */
    }
  }, [fromUrl, partners, storageKey]);

  // Share › PDF opens the page with ?print=1: print once the page is drawn.
  useEffect(() => {
    if (params.get('print') !== '1') return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [params]);

  const choose = (slug: string | null) => {
    setPartner(slug);
    try {
      if (slug) window.localStorage.setItem(storageKey, slug);
      else window.localStorage.removeItem(storageKey);
    } catch {
      /* As above. */
    }
    const q = new URLSearchParams(params.toString());
    if (slug) q.set('partner', slug);
    else q.delete('partner');
    const qs = q.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  };

  const view = publicView(rows, partner, today);
  const all = partner === null;
  const cols = all ? 6 : 5;
  const t = view.totals;

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-[1180px] px-4 pb-12">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 py-4">
          <span className="text-[13px] font-bold tracking-[.06em]">VCFO SUITE</span>
          <span className="text-[13px] text-ink-muted">/ Receivables · {clientOrgName}</span>
        </header>

        <div className="mb-3.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <Chip raw tone="ok">
            Live
          </Chip>
          <span>Updated {stamp(publishedAt)} by SBC</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          <label htmlFor="rcv-client-partner">Client partner</label>
          <FilterSelect
            id="rcv-client-partner"
            value={partner ?? ''}
            onChange={(e) => choose(e.target.value || null)}
            options={[{ value: '', label: 'All partners' }, ...partners.map((p) => ({ value: p.slug, label: p.name }))]}
          />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile label="Open receivables" value={`₹${inr(t.openInr)}`} sub={plural(t.openCount, 'invoice')} />
          <Tile label="Overdue" value={`₹${inr(t.overdueInr)}`} sub={t.overdueCount ? `${plural(t.overdueCount, 'invoice')}, oldest ${plural(t.oldestOverdueDays, 'day')}` : 'Nothing overdue'} />
          <Tile label="Received this week" value={`₹${inr(t.receivedWeekInr)}`} sub={plural(t.receivedWeekCount, 'payment')} />
        </div>

        <div className="relative mb-4 overflow-x-auto rounded-md border border-line bg-surface-raised">
          <table className="w-full border-collapse text-[13px] sm:min-w-[640px]">
            <thead>
              <tr>
                <th className={TH}>Client</th>
                <th className={`${TH} hidden sm:table-cell`}>Invoice no.</th>
                {all ? <th className={TH}>Client partner</th> : null}
                <th className={TH}>Due date</th>
                <th className={`${TH} text-right`}>Amount INR</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            {view.months.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={cols} className="px-2.5 py-8 text-center text-ink-muted">
                    No open invoices{all ? '' : ' for this partner'}.
                  </td>
                </tr>
              </tbody>
            ) : null}
            {view.months.map(({ month, rows: list }) => (
              <tbody key={month}>
                <tr>
                  <td colSpan={cols} className="border-t border-line px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em]">
                    {monthBlockTitle(month)}
                  </td>
                </tr>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className={TD}>{r.clientName}</td>
                    <td className={`${TD} hidden font-mono text-[12px] sm:table-cell`}>{r.invoiceNo}</td>
                    {all ? <td className={TD}>{r.partnerName ?? '—'}</td> : null}
                    <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.dueDate)}</td>
                    <td className={`${TD} text-right font-mono text-[12px]`}>{inr(r.amountInr)}</td>
                    <td className={TD}>
                      <StatusChip invoice={r} today={today} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-sunken font-semibold">
                  <td colSpan={all ? 3 : 2} className={`${TD} sm:hidden`}>
                    {monthShort(month)} receivables
                  </td>
                  <td colSpan={all ? 4 : 3} className={`${TD} hidden sm:table-cell`}>
                    {monthShort(month)} receivables
                  </td>
                  <td className={`${TD} text-right font-mono text-[12px]`}>{inr(sumInr(list))}</td>
                  <td className={TD} />
                </tr>
              </tbody>
            ))}
          </table>
        </div>

        {view.received.length ? (
          <div className="relative mb-4 overflow-x-auto rounded-md border border-line bg-surface-raised">
            <table className="w-full border-collapse text-[13px] sm:min-w-[640px]">
              <thead>
                <tr>
                  <td colSpan={cols} className="px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em]">
                    Received this week
                  </td>
                </tr>
                <tr>
                  <th className={TH}>Client</th>
                  <th className={`${TH} hidden sm:table-cell`}>Invoice no.</th>
                  {all ? <th className={TH}>Client partner</th> : null}
                  <th className={TH}>Paid on</th>
                  <th className={`${TH} text-right`}>Amount INR</th>
                  <th className={TH}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {view.received.map((r) => (
                  <tr key={r.id} className="bg-positive-soft/40">
                    <td className={TD}>{r.clientName}</td>
                    <td className={`${TD} hidden font-mono text-[12px] sm:table-cell`}>{r.invoiceNo}</td>
                    {all ? <td className={TD}>{r.partnerName ?? '—'}</td> : null}
                    <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.paidOn)}</td>
                    <td className={`${TD} text-right font-mono text-[12px]`}>{inr(r.paidAmount)}</td>
                    <td className={TD}>{payTiming(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-muted">
          <span>Read only. The figures change when SBC publishes an update.</span>
          <Button size="sm" variant="secondary" className="print:hidden" asChild>
            <a href={partner ? `${exportHref}&partner=${encodeURIComponent(partner)}` : exportHref}>Download Excel</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
