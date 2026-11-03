'use client';

import { ActionMenu } from '@/components/ui/action-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { toastError } from '@/lib/toast-errors';
import { sheetDate } from '@/lib/receivables/dates';
import { isForeign } from '@/lib/receivables/fx';
import type { Partner } from '@/lib/receivables/model';
import { payTiming } from '@/lib/receivables/summary';
import type { ManagerInvoiceDto, ManagerSheetDto } from '@/lib/receivables/wire';
import { cn } from '@/lib/utils';
import { fcText, inr } from '../../format';
import { NotesButton } from '../InvoiceNotes';
import { AmountCell, FxCell, NextReminder, StatusStack, TextCell } from './cells';
import { CELL, fxInput, invoiceName } from './cell-utils';
import { DatePick } from './DatePick';
import { createRowMenu } from './row-menu';
import type { RowGroup, SheetTabState } from './use-sheet-tab';

/**
 * The sheet table (Phase 10). Fixed columns that fit 1280 px without scrolling; the header sticks
 * to the top of the page there. Narrower (a tablet) the table scrolls sideways with the pick box
 * and the client column held at the left. Phones get the cards instead (SheetCards.tsx).
 */

const TH = 'sticky top-0 z-[2] whitespace-nowrap border-b border-line bg-surface-sunken px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2 py-1.5 align-middle';
/* The pick box and the client column stay put while a narrow screen scrolls sideways. */
const STICK_PICK = 'max-xl:sticky max-xl:left-0 max-xl:z-[1] max-xl:bg-surface-raised';
const STICK_CLIENT = 'max-xl:sticky max-xl:left-9 max-xl:z-[1] max-xl:bg-surface-raised max-xl:shadow-[1px_0_0_var(--line)]';

export function SheetTable({
  s,
  data,
  groups,
  today,
  todayRate,
  monthTitle,
  readOnly,
  label,
}: {
  s: SheetTabState;
  data: ManagerSheetDto;
  groups: RowGroup[];
  today: string;
  todayRate: number | null;
  /** The block title of a group (the month blocks); a section with one group passes its own. */
  monthTitle: (g: RowGroup) => string;
  /** Received rows: no in-place editing. */
  readOnly?: boolean;
  label: string;
}) {
  const fx = s.hasForeign;
  const cols = fx ? 10 : 9;
  const all = groups.flatMap((g) => g.rows);
  const allPicked = all.length > 0 && all.every((r) => s.picked.has(r.id));
  const somePicked = !allPicked && all.some((r) => s.picked.has(r.id));
  const partners = data.partners;

  return (
    <div className="overflow-x-auto rounded-md border-2 border-line bg-surface-raised xl:overflow-visible">
      <table className={cn('w-full table-fixed border-separate border-spacing-0 text-[13px]', fx ? 'min-w-[1150px]' : 'min-w-[980px]')} aria-label={label}>
        <colgroup>
          <col className="w-9" />
          <col />
          <col className="w-[104px]" />
          <col className="w-[148px]" />
          <col className="w-[104px]" />
          <col className="w-[118px]" />
          {fx ? <col className="w-[184px]" /> : null}
          <col className="w-[150px]" />
          <col className="w-[104px]" />
          <col className="w-[96px]" />
        </colgroup>
        <thead>
          <tr>
            <th className={cn(TH, 'rounded-tl-[4px] px-0 text-center', STICK_PICK, 'max-xl:z-[3]')}>
              <Checkbox
                className="mx-auto"
                aria-label={allPicked ? `Clear the picked ${label.toLowerCase()}` : `Pick every row of ${label.toLowerCase()}`}
                checked={allPicked ? true : somePicked ? 'indeterminate' : false}
                onCheckedChange={(on) => s.toggleMany(all.map((r) => r.id), on === true)}
                disabled={!all.length}
              />
            </th>
            <th className={cn(TH, STICK_CLIENT, 'max-xl:z-[3]')}>Client</th>
            <th className={TH}>Invoice no.</th>
            <th className={TH}>Client partner</th>
            <th className={TH}>Due date</th>
            <th className={cn(TH, 'text-right')}>{readOnly ? 'Paid INR' : 'Amount INR'}</th>
            {fx ? <th className={TH}>{data.usdRate ? `FX · USD ${data.usdRate.rate.toFixed(2)}` : 'FX'}</th> : null}
            <th className={TH}>Status</th>
            <th className={TH}>{readOnly ? 'Paid' : 'Next reminder'}</th>
            <th className={cn(TH, 'rounded-tr-[4px]')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key}>
            <tr>
              <td colSpan={cols} className="border-t border-line bg-surface-raised px-2 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[.04em] text-ink">
                <span className="max-xl:sticky max-xl:left-2">{monthTitle(g)}</span>
              </td>
            </tr>
            {g.rows.map((inv) => (
              <Row key={inv.id} inv={inv} s={s} data={data} partners={partners} today={today} todayRate={todayRate} fx={fx} readOnly={readOnly || inv.status !== 'open'} />
            ))}
            {g.totalLabel ? (
              <tr className="font-medium">
                <td className={cn(TD, 'bg-surface-sunken', STICK_PICK, 'max-xl:bg-surface-sunken')} />
                <td colSpan={4} className={cn(TD, 'bg-surface-sunken')}>
                  <span className="max-xl:sticky max-xl:left-11">{g.totalLabel}</span>
                </td>
                <td className={cn(TD, 'bg-surface-sunken text-right font-mono text-[12px]')}>
                  {inr(g.rows.reduce((a, r) => a + (r.status === 'received' ? (r.paidAmount ?? r.amountInr) : r.amountInr), 0))}
                </td>
                <td colSpan={cols - 6} className={cn(TD, 'bg-surface-sunken')} />
              </tr>
            ) : null}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Row({
  inv,
  s,
  data,
  partners,
  today,
  todayRate,
  fx,
  readOnly,
}: {
  inv: ManagerInvoiceDto;
  s: SheetTabState;
  data: ManagerSheetDto;
  partners: Partner[];
  today: string;
  todayRate: number | null;
  fx: boolean;
  readOnly: boolean;
}) {
  const foreign = isForeign(fxInput(inv));
  const name = invoiceName(inv);
  const picked = s.picked.has(inv.id);
  const partnerName = (inv.partnerId && partners.find((p) => p.id === inv.partnerId)?.name) || '';
  const choices = partners.filter((p) => p.active || p.id === inv.partnerId);
  const bg = picked ? 'bg-brand-soft/50' : inv.status === 'received' ? 'bg-positive-soft/30' : 'bg-surface-raised';
  return (
    <tr className={cn('group', bg)} data-invoice={inv.id}>
      <td className={cn(TD, 'px-0 text-center', STICK_PICK, picked && 'max-xl:bg-brand-soft')}>
        <Checkbox className="mx-auto" aria-label={`Pick ${name}`} checked={picked} onCheckedChange={() => s.toggle(inv.id)} />
      </td>
      <td className={cn(TD, STICK_CLIENT, picked && 'max-xl:bg-brand-soft')}>
        {readOnly ? (
          <span className="block truncate px-1.5" title={inv.clientName}>
            {inv.clientName}
          </span>
        ) : (
          <TextCell value={inv.clientName} label={`Client of ${name}`} list="rcv-sheet-clients" onCommit={(v) => (v ? s.edit(inv, { clientName: v }) : toastError('Not saved', 'The client name cannot be empty.'))} />
        )}
      </td>
      <td className={TD}>
        {readOnly ? (
          <span className="block truncate px-1.5 font-mono text-[12px]">{inv.invoiceNo ?? '—'}</span>
        ) : (
          <TextCell value={inv.invoiceNo ?? ''} label={`Invoice number of ${inv.clientName}`} mono placeholder="optional" onCommit={(v) => s.edit(inv, { invoiceNo: v || null })} />
        )}
      </td>
      <td className={TD}>
        {readOnly ? (
          <span className="block truncate px-1.5">{partnerName || '—'}</span>
        ) : (
          <select className={cn(CELL, 'cursor-pointer truncate pr-1')} aria-label={`Client partner of ${name}`} value={inv.partnerId ?? ''} onChange={(e) => s.edit(inv, { partnerId: e.target.value || null })}>
            <option value="">No partner</option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className={TD}>
        {readOnly ? (
          <span className="block px-1.5 tabular-nums">{sheetDate(inv.dueDate)}</span>
        ) : (
          <DatePick variant="cell" label={`Due date of ${name}`} value={inv.dueDate} onChange={(v) => v !== inv.dueDate && s.edit(inv, { dueDate: v })} />
        )}
      </td>
      <td className={TD}>
        {inv.status === 'received' ? (
          <div className="px-1.5 text-right font-mono text-[12px]">{inr(inv.paidAmount ?? inv.amountInr)}</div>
        ) : foreign || readOnly ? (
          <div className="px-1.5 text-right font-mono text-[12px]" title={foreign ? 'Booked INR; change it with the FX cell' : undefined}>
            {inr(inv.amountInr)}
          </div>
        ) : (
          <AmountCell value={inv.amountInr} label={`Amount INR of ${name}`} onCommit={(v) => s.edit(inv, { amountInr: v })} />
        )}
      </td>
      {fx ? (
        <td className={TD}>
          {foreign ? (
            inv.status === 'received' ? (
              <span className="block truncate px-1.5 font-mono text-[12px]">{fcText(inv, inv.receivedFc ?? inv.fcAmount)}</span>
            ) : (
              <FxCell invoice={inv} todayRate={todayRate} onEdit={readOnly ? undefined : () => s.runRow('fx', inv)} />
            )
          ) : null}
        </td>
      ) : null}
      <td className={TD}>
        <StatusStack invoice={inv} today={today} />
      </td>
      <td className={cn(TD, 'whitespace-nowrap text-[13px]')}>
        {inv.status === 'received' ? <span className="text-ink-muted">{payTiming(inv) || '—'}</span> : <NextReminder invoice={inv} today={today} rules={data.sheet.reminderRules} />}
      </td>
      <td className={cn(TD, 'whitespace-nowrap pr-1.5 text-right')}>
        <span className="inline-flex items-center justify-end gap-0.5">
          {inv.noteCount ? <NotesButton invoice={inv} onOpen={() => s.runRow('notes', inv)} /> : null}
          <ActionMenu label={`More actions for ${name}`} items={createRowMenu(inv, today, s.runRow)} />
        </span>
      </td>
    </tr>
  );
}
