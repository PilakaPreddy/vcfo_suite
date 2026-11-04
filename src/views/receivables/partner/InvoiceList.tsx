'use client';

import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { monthShort, sheetDate } from '@/lib/receivables/dates';
import type { PartnerRowDto } from '@/lib/receivables/partner-wire';
import { payTiming } from '@/lib/receivables/summary';
import { cn } from '@/lib/utils';
import { fcText, inr } from '../format';
import { StatusChip } from '../StatusChip';
import { SHEET_TD as TD, SHEET_TH as TH, plural } from '../sheet-parts';

/**
 * The client partner's invoice list: a table from 768px and one card per invoice on a phone.
 * `received` lists payments (paid on, how early or late) instead of open balances. A row that
 * changed since the partner's last visit carries the change word (`changed`).
 */

const label = (r: PartnerRowDto) => `${r.clientName}${r.invoiceNo ? ` ${r.invoiceNo}` : ''}`;

function Extra({ r, changed }: { r: PartnerRowDto; changed?: string }) {
  if (!r.noteCount && !changed) return null;
  return (
    <>
      {changed ? <Tag tone="prog">{changed}</Tag> : null}
      {r.noteCount > 0 ? <Tag>{plural(r.noteCount, 'note')}</Tag> : null}
    </>
  );
}

export function InvoiceList({
  rows,
  today,
  onOpen,
  received = false,
  changed,
}: {
  rows: PartnerRowDto[];
  today: string;
  onOpen: (id: string) => void;
  received?: boolean;
  changed?: Map<string, string>;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        {/* Fixed column widths, so the Needs attention and Coming up tables line up. */}
        <table className="w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[13%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[14%]" />
            <col />
            <col className="w-[104px]" />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Client</th>
              <th className={TH}>Invoice no.</th>
              <th className={TH}>Month</th>
              <th className={TH}>{received ? 'Paid on' : 'Due date'}</th>
              <th className={`${TH} text-right`}>Amount INR</th>
              <th className={TH}>Status</th>
              <th className={TH}>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const fc = received ? fcText(r, r.receivedFc) : fcText(r);
              return (
                <tr key={r.id} className="transition-colors hover:bg-hover">
                  <td className={`${TD} truncate`}>{r.clientName}</td>
                  <td className={`${TD} truncate font-mono text-[12px]`}>{r.invoiceNo}</td>
                  <td className={`${TD} whitespace-nowrap text-ink-muted`}>{monthShort(r.invoiceMonth)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{sheetDate(received ? r.paidOn : r.dueDate)}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {inr(received ? (r.paidAmount ?? r.amountInr) : r.amountInr)}
                    {fc ? <div className="text-[11.5px] text-ink-muted">{fc}</div> : null}
                  </td>
                  <td className={TD}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {received ? <Chip raw tone="ok">{payTiming(r) || 'Received'}</Chip> : <StatusChip invoice={r} today={today} />}
                      <Extra r={r} changed={changed?.get(r.id)} />
                    </div>
                    {!received && r.promisedOn ? <div className="mt-0.5 text-[12px] text-waiting">Promised {sheetDate(r.promisedOn)}</div> : null}
                  </td>
                  <td className={`${TD} text-right`}>
                    <Button size="sm" variant="secondary" onClick={() => onOpen(r.id)} aria-label={`Details of ${label(r)}`}>
                      Details
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden">
        {rows.map((r) => {
          const fc = received ? fcText(r, r.receivedFc) : fcText(r);
          return (
            <li key={r.id} className="border-t border-line-soft first:border-t-0">
              <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover" aria-label={`Details of ${label(r)}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[14px] font-medium text-ink">{r.clientName}</span>
                    <span className="whitespace-nowrap text-[14px] font-medium tabular-nums text-ink">₹{inr(received ? (r.paidAmount ?? r.amountInr) : r.amountInr)}</span>
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-3 text-[12px] text-ink-muted">
                    <span className="truncate">
                      {r.invoiceNo ? <span className="font-mono">{r.invoiceNo} · </span> : null}
                      {received ? `paid ${sheetDate(r.paidOn)}` : `due ${sheetDate(r.dueDate)}`}
                    </span>
                    {fc ? <span className="whitespace-nowrap">{fc}</span> : null}
                  </span>
                  <span className={cn('mt-2 flex flex-wrap items-center gap-1.5')}>
                    {received ? <Chip raw tone="ok">{payTiming(r) || 'Received'}</Chip> : <StatusChip invoice={r} today={today} />}
                    {!received && r.promisedOn ? <Chip raw tone="teal">{`Promised ${sheetDate(r.promisedOn)}`}</Chip> : null}
                    <Extra r={r} changed={changed?.get(r.id)} />
                  </span>
                </span>
                <ChevronRight size={16} className="mt-1 flex-none text-ink-faint" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
