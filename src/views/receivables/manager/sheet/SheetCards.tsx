'use client';

import { ActionMenu } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { sheetDate } from '@/lib/receivables/dates';
import { isForeign } from '@/lib/receivables/fx';
import { payTiming } from '@/lib/receivables/summary';
import type { ManagerInvoiceDto, ManagerSheetDto } from '@/lib/receivables/wire';
import { cn } from '@/lib/utils';
import { fcText, inr } from '../../format';
import { NotesButton } from '../InvoiceNotes';
import { FxCell, NextReminder, StatusStack } from './cells';
import { fxInput, invoiceName } from './cell-utils';
import { DatePick } from './DatePick';
import { createRowMenu } from './row-menu';
import type { RowGroup, SheetTabState } from './use-sheet-tab';

/**
 * The sheet on a phone (Phase 10): one card per invoice instead of the wide table, grouped by
 * month the same way, with the pick box, the due date picker, Mark received and the same row
 * menu (Pause, Currency, Notes, History, Dispute, Credit note, Delete).
 */
export function SheetCards({
  s,
  data,
  groups,
  today,
  todayRate,
  monthTitle,
  label,
}: {
  s: SheetTabState;
  data: ManagerSheetDto;
  groups: RowGroup[];
  today: string;
  todayRate: number | null;
  monthTitle: (g: RowGroup) => string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3" aria-label={label} role="region">
      {groups.map((g) => (
        <section key={g.key} aria-label={monthTitle(g)} className="flex flex-col gap-2">
          <h3 className="m-0 flex items-baseline justify-between gap-2 px-1 text-[12px] font-semibold uppercase tracking-[.04em] text-ink">
            <span>{monthTitle(g)}</span>
            {g.totalLabel ? (
              <span className="font-mono text-[12px] font-medium normal-case tracking-normal text-ink-2">
                {`₹${inr(g.rows.reduce((a, r) => a + (r.status === 'received' ? (r.paidAmount ?? r.amountInr) : r.amountInr), 0))}`}
              </span>
            ) : null}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {g.rows.map((inv) => (
              <Card key={inv.id} inv={inv} s={s} data={data} today={today} todayRate={todayRate} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Card({ inv, s, data, today, todayRate }: { inv: ManagerInvoiceDto; s: SheetTabState; data: ManagerSheetDto; today: string; todayRate: number | null }) {
  const name = invoiceName(inv);
  const picked = s.picked.has(inv.id);
  const open = inv.status === 'open';
  const foreign = isForeign(fxInput(inv));
  const partner = (inv.partnerId && data.partners.find((p) => p.id === inv.partnerId)?.name) || 'No partner';
  return (
    <li className={cn('rounded-md border px-3 py-2.5', picked ? 'border-brand/40 bg-brand-soft/40' : 'border-line bg-surface-raised')} data-invoice={inv.id}>
      <div className="flex items-start gap-2.5">
        <Checkbox className="mt-1" aria-label={`Pick ${name}`} checked={picked} onCheckedChange={() => s.toggle(inv.id)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium text-ink">{inv.clientName}</div>
              <div className="truncate text-[12px] text-ink-muted">
                {inv.invoiceNo ? <span className="font-mono">{inv.invoiceNo}</span> : 'No invoice no.'}
                {` · ${partner}`}
              </div>
            </div>
            <div className="flex-none text-right">
              <div className="font-mono text-[14px] font-medium text-ink">{`₹${inr(open ? inv.amountInr : (inv.paidAmount ?? inv.amountInr))}`}</div>
              {foreign && !open ? <div className="font-mono text-[11.5px] text-ink-muted">{fcText(inv, inv.receivedFc ?? inv.fcAmount)}</div> : null}
            </div>
          </div>
          {foreign && open ? (
            <div className="mt-1">
              <FxCell invoice={inv} todayRate={todayRate} rates={data.fxRates} onEdit={() => s.runRow('fx', inv)} />
            </div>
          ) : null}
          <div className="mt-2 flex items-start justify-between gap-2">
            <StatusStack invoice={inv} today={today} />
            <div className="flex-none text-right text-[12px] text-ink-muted">
              {open ? (
                <>
                  <div className="flex items-center justify-end gap-1">
                    <span>Due</span>
                    <DatePick variant="cell" className="w-auto" label={`Due date of ${name}`} value={inv.dueDate} onChange={(v) => v !== inv.dueDate && s.edit(inv, { dueDate: v })} />
                  </div>
                  <div className="flex items-center justify-end gap-1 pr-1.5">
                    <span>Reminder</span>
                    <NextReminder invoice={inv} today={today} rules={data.sheet.reminderRules} />
                  </div>
                </>
              ) : (
                <>
                  <div className="pr-1.5">{`Due ${sheetDate(inv.dueDate)}`}</div>
                  <div className="pr-1.5">{payTiming(inv)}</div>
                </>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-line-soft pt-2">
            {open ? (
              <Button size="sm" variant="secondary" onClick={() => s.runRow('mark', inv)}>
                Mark received
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => s.runRow('reopen', inv)}>
                Set back to open
              </Button>
            )}
            <span className="flex-1" />
            <NotesButton invoice={inv} onOpen={() => s.runRow('notes', inv)} />
            <ActionMenu label={`More actions for ${name}`} items={createRowMenu(inv, today, s.runRow)} />
          </div>
        </div>
      </div>
    </li>
  );
}
