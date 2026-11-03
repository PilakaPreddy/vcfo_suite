'use client';

import Link from 'next/link';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { daysLeft, monthBlockTitle, monthShort, sheetDate } from '@/lib/receivables/dates';
import { SHARE_STATUS_LABEL } from '@/lib/receivables/share-filters';
import { shareExportPath, type SharedRowDto, type SharedViewDto } from '@/lib/receivables/share-wire';
import { isOpen, monthsOf, payTiming, sumInr } from '@/lib/receivables/summary';
import { fcText, inr, stamp } from '../format';
import { StatusChip } from '../StatusChip';
import { SHEET_TD as TD, SHEET_TH as TH, SheetTile as Tile, plural } from '../sheet-parts';

/**
 * A shared receivables view, /receivables/s/<token> (Phase 10 of docs/specs/receivables/PLAN.md):
 * the rows of the latest published version that the manager's saved filter picks, read only.
 * The link's name is the title, the filter shows as chips, and the rows sit in month blocks
 * like the client partner's page, with the foreign amount under the INR of a foreign invoice.
 * Print and, when the link allows it, Download Excel sit at the foot.
 */

const COLS = 6;

/** The figure a row adds to its month: the open amount, or what arrived for a received row. */
function shownInr(r: SharedRowDto): number {
  return isOpen(r) ? r.amountInr : (r.paidAmount ?? r.amountInr);
}

/** The filter as short chips: partners, clients, status, months, currency, search. */
function filterChips(view: SharedViewDto): string[] {
  const f = view.link.filters;
  const out: string[] = [];
  const names = new Map<string, string>();
  for (const r of view.rows) if (r.partnerSlug && r.partnerName) names.set(r.partnerSlug, r.partnerName);
  for (const s of f.partnerSlugs ?? []) out.push(names.get(s) ?? s);
  for (const c of f.clients ?? []) out.push(c);
  out.push(SHARE_STATUS_LABEL[f.status ?? 'open']);
  for (const m of f.months ?? []) out.push(monthShort(m));
  if (f.currency) out.push(f.currency);
  if (f.search) out.push(`“${f.search}”`);
  return out;
}

export function SharedView({ view, token, home }: { view: SharedViewDto; token: string; home?: { href: string; label: string } | null }) {
  const { rows, today } = view;
  const open = rows.filter(isOpen);
  const overdue = open.filter((r) => daysLeft(r.dueDate, today) < 0);
  const received = rows.filter((r) => !isOpen(r));
  const oldest = overdue.reduce((m, r) => Math.max(m, -daysLeft(r.dueDate, today)), 0);
  const months = monthsOf(rows).map((m) => ({
    month: m,
    rows: rows.filter((r) => r.invoiceMonth === m).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  }));
  const showPartner = rows.some((r) => r.partnerName) && !(view.link.filters.partnerSlugs?.length === 1);

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-[1180px] px-4 pb-12">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 py-4 print:hidden">
          <span className="text-[13px] font-bold tracking-[.06em]">VCFO SUITE</span>
          <span className="min-w-0 text-[13px] text-ink-muted">/ Receivables · {view.clientOrgName}</span>
          {home ? (
            <Button size="sm" variant="quiet" className="ml-auto" asChild>
              <Link href={home.href}>{home.label}</Link>
            </Button>
          ) : null}
        </header>

        <div className="mb-4">
          <div className="text-[12px] font-medium uppercase tracking-[.04em] text-ink-muted">Shared view</div>
          <h1 className="mt-0.5 break-words text-[22px] font-semibold leading-tight">{view.link.name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="Filters of this view">
            {filterChips(view).map((c, i) => (
              <Tag key={`${c}-${i}`}>{c}</Tag>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            {view.publishedAt ? (
              <>
                <Chip raw tone="ok">
                  Live
                </Chip>
                <span>Published by SBC {stamp(view.publishedAt)}</span>
              </>
            ) : (
              <Chip raw tone="idle">
                Not published yet
              </Chip>
            )}
            {view.link.expiresAt ? <span className="text-ink-muted">Link works until {stamp(view.link.expiresAt)}</span> : null}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile label="Open in this view" value={`₹${inr(sumInr(open))}`} sub={plural(open.length, 'invoice')} />
          <Tile
            label="Overdue"
            value={`₹${inr(sumInr(overdue))}`}
            sub={overdue.length ? `${plural(overdue.length, 'invoice')}, oldest ${plural(oldest, 'day')}` : 'Nothing overdue'}
          />
          <Tile label="Received in this view" value={`₹${inr(received.reduce((a, r) => a + (r.paidAmount ?? 0), 0))}`} sub={plural(received.length, 'payment')} />
        </div>

        {months.length === 0 ? (
          <EmptyState className="mb-4 bg-surface-raised" title={view.publishedAt ? 'No invoices match this view today.' : 'SBC has not published the sheet yet.'} />
        ) : (
          <div className="relative mb-4 overflow-x-auto rounded-md border border-line bg-surface-raised">
            <table className="w-full border-collapse text-[13px] sm:min-w-[680px]">
              <thead>
                <tr>
                  <th className={TH}>Client</th>
                  <th className={`${TH} hidden sm:table-cell`}>Invoice no.</th>
                  {showPartner ? <th className={`${TH} hidden md:table-cell`}>Client partner</th> : null}
                  <th className={TH}>Due date</th>
                  <th className={`${TH} text-right`}>Amount INR</th>
                  <th className={`${TH} hidden sm:table-cell`}>Status</th>
                </tr>
              </thead>
              {months.map(({ month, rows: list }) => (
                <tbody key={month}>
                  <tr>
                    <td colSpan={COLS} className="border-t border-line px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em]">
                      {monthBlockTitle(month)}
                    </td>
                  </tr>
                  {list.map((r) => {
                    const fx = isOpen(r) ? fcText(r) : fcText(r, r.receivedFc ?? r.fcAmount);
                    return (
                      <tr key={r.id} className={isOpen(r) ? undefined : 'bg-positive-soft/40'}>
                        <td className={TD}>
                          <div className="break-words">{r.clientName}</div>
                          {r.invoiceNo ? <div className="font-mono text-[11px] text-ink-muted sm:hidden">{r.invoiceNo}</div> : null}
                          <div className="mt-1 sm:hidden">
                            <StatusChip invoice={r} today={today} />
                          </div>
                        </td>
                        <td className={`${TD} hidden font-mono text-[12px] sm:table-cell`}>{r.invoiceNo}</td>
                        {showPartner ? <td className={`${TD} hidden md:table-cell`}>{r.partnerName ?? '—'}</td> : null}
                        <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.dueDate)}</td>
                        <td className={`${TD} whitespace-nowrap text-right font-mono text-[12px]`}>
                          {inr(shownInr(r))}
                          {fx ? <div className="text-[11px] text-ink-muted">{fx}</div> : null}
                        </td>
                        <td className={`${TD} hidden sm:table-cell`}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusChip invoice={r} today={today} />
                            {view.staffViewer && r.disputed ? <Tag tone="bad">Disputed</Tag> : null}
                          </div>
                          {!isOpen(r) && r.paidOn ? (
                            <div className="mt-0.5 text-[12px] text-ink-muted">
                              Paid {sheetDate(r.paidOn)}
                              <span className="hidden sm:inline">{payTiming(r) ? ` · ${payTiming(r)}` : ''}</span>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-surface-sunken font-semibold">
                    <td className={`${TD} sm:hidden`} colSpan={2}>
                      {monthShort(month)} total
                    </td>
                    <td className={`${TD} hidden sm:table-cell ${showPartner ? 'md:hidden' : ''}`} colSpan={3}>
                      {monthShort(month)} total
                    </td>
                    {showPartner ? (
                      <td className={`${TD} hidden md:table-cell`} colSpan={4}>
                        {monthShort(month)} total
                      </td>
                    ) : null}
                    <td className={`${TD} whitespace-nowrap text-right font-mono text-[12px]`}>{inr(list.reduce((a, r) => a + shownInr(r), 0))}</td>
                    <td className={`${TD} hidden sm:table-cell`} />
                  </tr>
                </tbody>
              ))}
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-muted">
          <span>Shared by SBC. The figures change when SBC publishes an update.</span>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden /> Print
            </Button>
            {view.link.allowDownload && rows.length ? (
              <Button size="sm" variant="secondary" asChild>
                <a href={shareExportPath(token)} rel="noreferrer">
                  <Download aria-hidden /> Download Excel
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SharedView;
