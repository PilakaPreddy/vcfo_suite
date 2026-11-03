'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { FilterSelect } from '@/components/ui/native-select';
import { daysLeft, monthBlockTitle, monthShort, sheetDate } from '@/lib/receivables/dates';
import type { PartnerRowDto } from '@/lib/receivables/partner-wire';
import { publicView } from '@/lib/receivables/public-view';
import { payTiming, sumInr } from '@/lib/receivables/summary';
import { PARTNER_EXPORT_HREF, usePartnerHome } from '@/hooks/use-receivables-partner';
import { inr, stamp } from '../format';
import { StatusChip } from '../StatusChip';
import { InvoiceDetails } from './InvoiceDetails';

/**
 * The signed-in client partner's page (/receivables, Phase 8 of docs/specs/receivables/PLAN.md):
 * the partner's own invoices of the latest published version, laid out like the client page
 * (ClientPage) without its partner filter, plus per-invoice details (reminders, pause, Promise,
 * notes). `?invoice=<id>` opens that invoice's details on load; reminder emails link there.
 */

const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2.5 py-2 align-middle';
const COLS = 6;

type StatusFilter = 'open' | 'overdue' | 'not_due';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'open', label: 'All open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'not_due', label: 'Not yet due' },
];

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

function Header({ clientOrgName, partnerName }: { clientOrgName?: string; partnerName?: string }) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 py-4 print:hidden">
      <span className="text-[13px] font-bold tracking-[.06em]">VCFO SUITE</span>
      <span className="min-w-0 text-[13px] text-ink-muted">/ Receivables{clientOrgName ? ` · ${clientOrgName}` : ''}</span>
      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {partnerName ? <span className="font-medium">{partnerName}</span> : null}
        <Link href="/receivables/account" className="text-ink-2 underline-offset-4 hover:underline">
          My account
        </Link>
        <Button size="sm" variant="quiet" onClick={() => void signOut({ callbackUrl: '/receivables/login' })}>
          Log out
        </Button>
      </div>
    </header>
  );
}

export function PartnerPage() {
  const router = useRouter();
  const params = useSearchParams();
  const home = usePartnerHome();
  const [openId, setOpenId] = useState<string | null>(params.get('invoice'));
  const [client, setClient] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');

  // A reminder email links to ?invoice=<id>; follow the address when it changes.
  const fromUrl = params.get('invoice');
  useEffect(() => {
    if (fromUrl) setOpenId(fromUrl);
  }, [fromUrl]);

  const showInvoice = (id: string | null) => {
    setOpenId(id);
    const q = new URLSearchParams(params.toString());
    if (id) q.set('invoice', id);
    else q.delete('invoice');
    const qs = q.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  };

  const data = home.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const clients = useMemo(() => [...new Set(rows.map((r) => r.clientName))].sort((a, b) => a.localeCompare(b)), [rows]);
  const clientRows = client && clients.includes(client) ? rows.filter((r) => r.clientName === client) : rows;

  if (home.isPending) {
    return (
      <div className="min-h-screen bg-surface text-ink">
        <div className="mx-auto max-w-[1180px] px-4 pb-12">
          <Header />
          <p className="py-10 text-center text-[13px] text-ink-muted">Loading your invoices…</p>
        </div>
      </div>
    );
  }

  if (home.isError || !data) {
    return (
      <div className="min-h-screen bg-surface text-ink">
        <div className="mx-auto max-w-[1180px] px-4 pb-12">
          <Header />
          <div className="rounded-md border border-line bg-surface-raised px-4 py-8 text-center text-[13px]">
            <p role="alert" className="text-ink-2">
              {home.error instanceof Error ? home.error.message : 'The invoices did not load.'}
            </p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => void home.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const today = data.today;
  const details = openId ? <InvoiceDetails invoiceId={openId} today={today} onClose={() => showInvoice(null)} /> : null;

  if (!data.publishedAt) {
    return (
      <div className="min-h-screen bg-surface text-ink">
        <div className="mx-auto max-w-[1180px] px-4 pb-12">
          <Header clientOrgName={data.clientOrgName} partnerName={data.partner.name} />
          <div className="rounded-md border border-line bg-surface-raised px-4 py-12 text-center">
            <p className="text-[14px] font-medium">Nothing is published yet.</p>
            <p className="mt-1 text-[13px] text-ink-muted">SBC will share the sheet here.</p>
          </div>
        </div>
        {details}
      </div>
    );
  }

  const view = publicView(clientRows, null, today);
  const t = view.totals;
  const keep = (r: PartnerRowDto) => (status === 'overdue' ? daysLeft(r.dueDate, today) < 0 : status === 'not_due' ? daysLeft(r.dueDate, today) >= 0 : true);
  const months = view.months.map((m) => ({ month: m.month, rows: (m.rows as PartnerRowDto[]).filter(keep) })).filter((m) => m.rows.length);
  const received = view.received as PartnerRowDto[];
  const emptyText = status === 'overdue' ? 'Nothing is overdue.' : status === 'not_due' ? 'No invoices are waiting for their due date.' : 'No open invoices.';

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-[1180px] px-4 pb-12">
        <Header clientOrgName={data.clientOrgName} partnerName={data.partner.name} />

        <div className="mb-3.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <Chip raw tone="ok">
            Live
          </Chip>
          <span>Updated {stamp(data.publishedAt)} by SBC</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-muted print:hidden">
          {clients.length > 1 ? (
            <span className="flex items-center gap-2">
              <label htmlFor="rcv-partner-client">Client</label>
              <FilterSelect
                id="rcv-partner-client"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                options={[{ value: '', label: 'All clients' }, ...clients.map((c) => ({ value: c, label: c }))]}
              />
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            <label htmlFor="rcv-partner-status">Status</label>
            <FilterSelect id="rcv-partner-status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} options={STATUS_OPTIONS} />
          </span>
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
                <th className={TH}>Due date</th>
                <th className={`${TH} text-right`}>Amount INR</th>
                <th className={TH}>Status</th>
                <th className={`${TH} print:hidden`}>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            {months.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={COLS} className="px-2.5 py-8 text-center text-ink-muted">
                    {emptyText}
                  </td>
                </tr>
              </tbody>
            ) : null}
            {months.map(({ month, rows: list }) => (
              <tbody key={month}>
                <tr>
                  <td colSpan={COLS} className="border-t border-line px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em]">
                    {monthBlockTitle(month)}
                  </td>
                </tr>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className={TD}>{r.clientName}</td>
                    <td className={`${TD} hidden font-mono text-[12px] sm:table-cell`}>{r.invoiceNo}</td>
                    <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.dueDate)}</td>
                    <td className={`${TD} text-right font-mono text-[12px]`}>{inr(r.amountInr)}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusChip invoice={r} today={today} />
                        {r.noteCount > 0 ? (
                          <Tag>{plural(r.noteCount, 'note')}</Tag>
                        ) : null}
                      </div>
                      {r.promisedOn ? <div className="mt-0.5 text-[12px] text-ink-muted">Promised {sheetDate(r.promisedOn)}</div> : null}
                    </td>
                    <td className={`${TD} text-right print:hidden`}>
                      <Button size="sm" variant="secondary" onClick={() => showInvoice(r.id)} aria-label={`Details of ${r.clientName}${r.invoiceNo ? ` ${r.invoiceNo}` : ''}`}>
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-sunken font-semibold">
                  <td colSpan={2} className={`${TD} sm:hidden`}>
                    {monthShort(month)} receivables
                  </td>
                  <td colSpan={3} className={`${TD} hidden sm:table-cell`}>
                    {monthShort(month)} receivables
                  </td>
                  <td className={`${TD} text-right font-mono text-[12px]`}>{inr(sumInr(list))}</td>
                  <td colSpan={2} className={TD} />
                </tr>
              </tbody>
            ))}
          </table>
        </div>

        {received.length ? (
          <div className="relative mb-4 overflow-x-auto rounded-md border border-line bg-surface-raised">
            <table className="w-full border-collapse text-[13px] sm:min-w-[640px]">
              <thead>
                <tr>
                  <td colSpan={5} className="px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em]">
                    Received this week
                  </td>
                </tr>
                <tr>
                  <th className={TH}>Client</th>
                  <th className={`${TH} hidden sm:table-cell`}>Invoice no.</th>
                  <th className={TH}>Paid on</th>
                  <th className={`${TH} text-right`}>Amount INR</th>
                  <th className={TH}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {received.map((r) => (
                  <tr key={r.id} className="bg-positive-soft/40">
                    <td className={TD}>{r.clientName}</td>
                    <td className={`${TD} hidden font-mono text-[12px] sm:table-cell`}>{r.invoiceNo}</td>
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
          <span>The figures change when SBC publishes an update.</span>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={PARTNER_EXPORT_HREF}>Download Excel</a>
            </Button>
          </div>
        </div>
      </div>
      {details}
    </div>
  );
}

export default PartnerPage;
