'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, FileText, Printer, Wallet } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { sheetDate } from '@/lib/receivables/dates';
import type { Statement, StatementLine } from '@/lib/receivables/statement';
import { fc, inr } from './format';
import { SHEET_TD as TD, SHEET_TH as TH, SheetTile, plural } from './sheet-parts';

/**
 * The statement of account page (Phase 10), shared by the manager (/receivables/manager/statement,
 * the live draft) and the client partner (/receivables/statement, their published rows): the
 * client and period picker, the four totals (opening, invoiced, received, closing), every line,
 * and the receipts of the period. Print gives a clean A4 page; Download Excel gets the same as
 * an .xlsx. The data is worked out on the server (src/lib/receivables/statement.ts).
 */

export type StatementViewProps = {
  statement: Statement;
  clientOrgName: string;
  /** This page's path, without a query; the picker navigates here. */
  basePath: string;
  /** Extra query kept on every navigation (the manager's `sheet`). */
  keep?: Record<string, string>;
  /** The Excel route, without a query. */
  xlsxPath: string;
  backHref: string;
  backLabel: string;
  /** "Live draft" for the manager, "Published" for a partner. */
  source: string;
  /** A page header (the partner's header strip); without it the page shows a Back link. */
  header?: ReactNode;
};

function href(path: string, q: Record<string, string | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  const s = p.toString().replace(/\+/g, '%20');
  return s ? `${path}?${s}` : path;
}

function Lines({ lines }: { lines: StatementLine[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block print:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Invoice date</th>
              <th className={TH}>Client · invoice</th>
              <th className={TH}>Due date</th>
              <th className={`${TH} text-right`}>Amount INR</th>
              <th className={TH}>Received on</th>
              <th className={`${TH} text-right`}>Received INR</th>
              <th className={`${TH} text-right`}>Closing INR</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={l.receivedOn ? 'bg-positive-soft/40' : undefined}>
                <td className={`${TD} whitespace-nowrap`}>{sheetDate(l.invoiceDate)}</td>
                <td className={TD}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{l.clientName}</span>
                    {l.invoiceNo ? <span className="font-mono text-[12px] text-ink-muted">{l.invoiceNo}</span> : null}
                    {l.kind === 'opening' ? <span className="text-[12px] text-ink-muted">· brought forward</span> : null}
                  </div>
                  {l.partPaid > 0 || (l.currency !== 'INR' && l.fcAmount) ? (
                    <div className="text-[12px] text-ink-muted">
                      {[l.partPaid > 0 ? `₹${inr(l.partPaid)} part paid earlier` : '', l.currency !== 'INR' && l.fcAmount ? `${l.currency} ${fc(l.fcAmount)}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  ) : null}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {sheetDate(l.dueDate)}
                  {l.daysOverdue ? <div className="text-[12px] text-danger">{plural(l.daysOverdue, 'day')} overdue</div> : null}
                </td>
                <td className={`${TD} text-right tabular-nums`}>{inr(l.amountInr)}</td>
                <td className={`${TD} whitespace-nowrap`}>{l.receivedOn ? sheetDate(l.receivedOn) : ''}</td>
                <td className={`${TD} text-right tabular-nums`}>{l.receivedInr ? inr(l.receivedInr) : ''}</td>
                <td className={`${TD} text-right tabular-nums`}>{l.closingInr ? inr(l.closingInr) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phones: one card per line. */}
      <ul className="grid gap-0 md:hidden print:hidden">
        {lines.map((l) => (
          <li key={l.id} className="border-t border-line-soft px-4 py-3 first:border-t-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{l.clientName}</div>
                <div className="text-[12px] text-ink-muted">
                  {l.invoiceNo ? <span className="font-mono">{l.invoiceNo} · </span> : null}
                  {sheetDate(l.invoiceDate)} · due {sheetDate(l.dueDate)}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-medium">₹{inr(l.amountInr)}</div>
                {l.kind === 'opening' ? <div className="text-[12px] text-ink-muted">brought forward</div> : null}
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
              {l.receivedOn ? (
                <Chip raw tone="ok">{`Received ${sheetDate(l.receivedOn)}`}</Chip>
              ) : l.daysOverdue ? (
                <Chip raw tone="bad">{`${plural(l.daysOverdue, 'day')} overdue`}</Chip>
              ) : (
                <Chip raw tone="idle">Open</Chip>
              )}
              {l.partPaid > 0 ? <span className="text-ink-muted">₹{inr(l.partPaid)} part paid earlier</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function StatementView({ statement: st, clientOrgName, basePath, keep = {}, xlsxPath, backHref, backLabel, source, header }: StatementViewProps) {
  const router = useRouter();
  const [client, setClient] = useState(st.client ?? '');
  const [from, setFrom] = useState(st.from);
  const [to, setTo] = useState(st.to);
  const bad = !from || !to || from > to;
  const query = { ...keep, client: st.client, from: st.from, to: st.to };

  const apply = (e: FormEvent) => {
    e.preventDefault();
    if (!bad) router.push(href(basePath, { ...keep, client: client || null, from, to }));
  };

  return (
    <main className="min-h-screen bg-surface text-ink print:bg-white">
      <div className={`mx-auto flex flex-col gap-4 px-4 pb-8 ${header ? 'max-w-[1180px]' : 'max-w-[1120px] pt-5 md:pt-6'}`}>
        {header ?? (
          <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink print:hidden">
            <ArrowLeft size={14} aria-hidden /> {backLabel}
          </Link>
        )}

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-medium leading-7 tracking-[-0.01em]">Statement of account</h1>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {st.client ?? 'All clients'} · {clientOrgName} · {sheetDate(st.from)} to {sheetDate(st.to)} · {source}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden /> Print
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={href(xlsxPath, { ...query, format: 'xlsx' })}>
                <ArrowDownToLine aria-hidden /> Download Excel
              </a>
            </Button>
          </div>
        </header>

        <form onSubmit={apply} className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-raised px-4 py-3 print:hidden" aria-label="Statement period">
          <label className="grid gap-1 text-[12.5px] text-ink-muted">
            Client
            <FilterSelect
              value={client}
              onChange={(e) => setClient(e.target.value)}
              size="md"
              options={[{ value: '', label: 'All clients' }, ...st.clients.map((c) => ({ value: c, label: c }))]}
            />
          </label>
          <label className="grid gap-1 text-[12.5px] text-ink-muted">
            From
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
          </label>
          <label className="grid gap-1 text-[12.5px] text-ink-muted">
            To
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
          </label>
          <Button type="submit" disabled={bad}>
            Show statement
          </Button>
          {bad ? <span className="text-[12.5px] text-danger">Pick a From date on or before the To date.</span> : null}
        </form>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SheetTile icon={Wallet} label={`Opening on ${sheetDate(st.from)}`} value={`₹${inr(st.opening.inr)}`} sub={plural(st.opening.count, 'invoice')} />
          <SheetTile icon={FileText} tone="primary" label="Invoiced in the period" value={`₹${inr(st.invoiced.inr)}`} sub={plural(st.invoiced.count, 'invoice')} />
          <SheetTile icon={ArrowUpFromLine} tone="success" label="Received in the period" value={`₹${inr(st.received.inr)}`} sub={plural(st.received.count, 'payment')} good={st.received.inr > 0} />
          <SheetTile icon={Wallet} tone="warning" label={`Closing on ${sheetDate(st.to)}`} value={`₹${inr(st.closing.inr)}`} sub={plural(st.closing.count, 'invoice')} />
        </div>

        <DashSection title="Invoices" meta={`${plural(st.lines.length, 'line')} · opening + invoiced − received = closing`} flush>
          {st.lines.length ? (
            <Lines lines={st.lines} />
          ) : (
            <div className="p-4">
              <EmptyState title={st.client ? `No invoices of ${st.client} in this period.` : 'No invoices in this period.'} />
            </div>
          )}
        </DashSection>

        <DashSection title="Receipts in the period" meta={st.receipts.length ? `₹${inr(st.received.inr)}` : undefined} flush>
          {st.receipts.length ? (
            <ul>
              {st.receipts.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5 text-[13px] first:border-t-0 md:px-5">
                  <span className="min-w-0">
                    <span className="font-medium">{l.clientName}</span>
                    {l.invoiceNo ? <span className="ml-2 font-mono text-[12px] text-ink-muted">{l.invoiceNo}</span> : null}
                    <span className="ml-2 text-ink-muted">{sheetDate(l.receivedOn)}</span>
                  </span>
                  <span className="tabular-nums">
                    ₹{inr(l.receivedInr)}
                    {l.creditedInr !== null && Math.round(l.creditedInr) !== Math.round(l.receivedInr) ? (
                      <span className="ml-2 text-[12px] text-ink-muted">₹{inr(l.creditedInr)} credited</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4">
              <EmptyState title="No payments were received in this period." />
            </div>
          )}
        </DashSection>

        <p className="text-[12px] text-ink-muted">
          Part payments are already netted off each balance. A receipt clears the invoice&rsquo;s balance; the INR credited after TDS or exchange differences is shown beside it.
        </p>
      </div>
    </main>
  );
}
