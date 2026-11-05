import { monthBlockTitle, monthShort, sheetDate } from '@/lib/receivables/dates';
import type { SnapshotRow } from '@/lib/receivables/model';
import { publicView } from '@/lib/receivables/public-view';
import { payTiming, sumInr } from '@/lib/receivables/summary';
import { fcText, inr, stamp } from '../format';
import { StatusChip } from '../StatusChip';
import { SHEET_TD as TD, SHEET_TH as TH, SheetTile as Tile, plural } from '../sheet-parts';
import { PrintNow } from './PrintNow';

/**
 * The manager print view (/receivables/manager/print, the PDF tile of Share): the published
 * version of one sheet laid out like the client partner page, every partner's rows together, with
 * the print box opened on load. It shows only the published snapshot, never the draft. A USD row
 * shows its USD amount beside the INR; a snapshot from before Phase 9 reads as all INR.
 */
export function PrintView({ clientOrgName, publishedAt, publishedByName, rows, today }: { clientOrgName: string; publishedAt: string; publishedByName: string; rows: SnapshotRow[]; today: string }) {
  const view = publicView(rows, null, today);
  const t = view.totals;
  const foreign = rows.some((r) => fcText(r) !== null);
  const cols = foreign ? 7 : 6;
  return (
    <main className="min-h-screen bg-surface text-ink print:bg-white">
      <div className="mx-auto max-w-[1080px] px-4 py-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-medium">Receivables · {clientOrgName}</h1>
            <p className="text-[13px] text-ink-muted">
              Published {stamp(publishedAt)} by {publishedByName}
            </p>
          </div>
          <PrintNow />
        </header>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <Tile label="Open receivables" value={`₹${inr(t.openInr)}`} sub={plural(t.openCount, 'invoice')} />
          <Tile label="Overdue" value={`₹${inr(t.overdueInr)}`} sub={t.overdueCount ? `${plural(t.overdueCount, 'invoice')}, oldest ${plural(t.oldestOverdueDays, 'day')}` : 'Nothing overdue'} />
          <Tile label="Received this week" value={`₹${inr(t.receivedWeekInr)}`} sub={plural(t.receivedWeekCount, 'payment')} />
        </div>

        <table className="mb-4 w-full border-collapse rounded-md border border-line text-[12.5px]">
          <thead>
            <tr>
              <th className={TH}>Client</th>
              <th className={TH}>Invoice no.</th>
              <th className={TH}>Client partner</th>
              <th className={TH}>Due date</th>
              {foreign ? <th className={`${TH} text-right`}>Foreign amount</th> : null}
              <th className={`${TH} text-right`}>Amount INR</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          {view.months.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={cols} className={`${TD} text-center text-ink-muted`}>
                  No open invoices.
                </td>
              </tr>
            </tbody>
          ) : null}
          {view.months.map(({ month, rows: list }) => (
            <tbody key={month} className="break-inside-avoid">
              <tr>
                <td colSpan={cols} className="border-t border-line px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em]">
                  {monthBlockTitle(month)}
                </td>
              </tr>
              {list.map((r) => (
                <tr key={r.id}>
                  <td className={TD}>{r.clientName}</td>
                  <td className={`${TD} font-mono text-[11.5px]`}>{r.invoiceNo}</td>
                  <td className={TD}>{r.partnerName ?? '—'}</td>
                  <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.dueDate)}</td>
                  {foreign ? <td className={`${TD} text-right font-mono text-[11.5px]`}>{fcText(r) ?? ''}</td> : null}
                  <td className={`${TD} text-right font-mono text-[11.5px]`}>{inr(r.amountInr)}</td>
                  <td className={TD}>
                    <StatusChip invoice={r} today={today} />
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-sunken font-semibold">
                <td colSpan={foreign ? 5 : 4} className={TD}>
                  {monthShort(month)} receivables
                </td>
                <td className={`${TD} text-right font-mono text-[11.5px]`}>{inr(sumInr(list))}</td>
                <td className={TD} />
              </tr>
            </tbody>
          ))}
        </table>

        {view.received.length ? (
          <table className="mb-4 w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <td colSpan={5} className="px-2.5 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em]">
                  Received this week
                </td>
              </tr>
              <tr>
                <th className={TH}>Client</th>
                <th className={TH}>Invoice no.</th>
                <th className={TH}>Paid on</th>
                <th className={`${TH} text-right`}>Amount INR</th>
                <th className={TH}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {view.received.map((r) => (
                <tr key={r.id}>
                  <td className={TD}>{r.clientName}</td>
                  <td className={`${TD} font-mono text-[11.5px]`}>{r.invoiceNo}</td>
                  <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.paidOn)}</td>
                  <td className={`${TD} text-right font-mono text-[11.5px]`}>
                    {inr(r.paidAmount)}
                    {fcText(r, r.receivedFc) ? <div className="text-[11px] text-ink-muted">{fcText(r, r.receivedFc)}</div> : null}
                  </td>
                  <td className={TD}>{payTiming(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <div className="flex justify-end gap-6 border-t border-line pt-3 text-[14px]">
          <span className="text-ink-muted">Total receivables</span>
          <span className="font-mono font-medium">₹{inr(t.openInr)}</span>
        </div>
      </div>
    </main>
  );
}
