'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DangerConfirm } from '@/components/ui/danger-confirm';
import { EmptyState } from '@/components/ui/empty-state';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { monthBlockTitle, monthShort, sheetDate } from '@/lib/receivables/dates';
import { sumInr } from '@/lib/receivables/summary';
import type { ManagerSheetDto } from '@/lib/receivables/wire';
import type { useReceivablesActions } from '@/hooks/use-receivables';
import { AddInvoiceDialog, MarkReceivedDialog, PauseDialog } from './InvoiceDialogs';
import { FxEditDialog } from './FxFields';
import { NotesDialog } from './InvoiceNotes';
import { ShareViewDialog } from './ShareViewDialog';
import { HistoryDrawer } from './sheet/HistoryDrawer';
import { PublishBar } from './sheet/PublishBar';
import { SheetCards } from './sheet/SheetCards';
import { BulkPauseDialog, BulkReceivedDialog, CreditNoteDialog, DisputeDialog } from './sheet/SheetDialogs';
import { SheetFilterBar } from './sheet/SheetFilterBar';
import { SheetSummary } from './sheet/SheetSummary';
import { SheetTable } from './sheet/SheetTable';
import { useSheetTab, type RowGroup } from './sheet/use-sheet-tab';

/**
 * The Sheet tab (prototype "Sheet", Phase 10 layout): the summary card with the headline numbers,
 * the publish bar, the filter bar (filters in the URL, Share this view, bulk actions), then the
 * month blocks, one row per invoice, edited in place; edits land in the draft and Update publishes
 * them. Phones get cards instead of the table. State is in sheet/use-sheet-tab.ts and the parts
 * are in sheet/ (the large-view rule).
 *
 * Phase 9: a foreign invoice shows its foreign amount, booked rate and the INR at today's rate in
 * the FX column; its INR amount is the booked INR and changes through Currency and rate.
 */

type Actions = ReturnType<typeof useReceivablesActions>;

const monthTitle = (g: RowGroup) => monthBlockTitle(g.key);
const sectionTitle = (g: RowGroup) => g.title;

export function SheetTab({ data, actions, today }: { data: ManagerSheetDto; actions: Actions; today: string }) {
  const s = useSheetTab(data, actions, today);
  const todayRate = data.usdRate?.rate ?? null;
  const d = s.dialog;
  const state = (busy: boolean) => ({ busy, error: s.dialogError });
  const fail = (e: unknown) => s.setDialogError(s.errorText(e));
  const monthGroups = s.groups.map((g) => ({ ...g, totalLabel: `${monthShort(g.key)} · ${g.rows.length} invoice${g.rows.length === 1 ? '' : 's'}${s.filtered ? ' (filtered)' : ''}` }));
  const weekGroups: RowGroup[] = s.receivedWeek.length ? [{ key: 'week', title: 'Received this week', rows: s.receivedWeek, totalLabel: `${s.receivedWeek.length} received` }] : [];
  const views = (groups: RowGroup[], title: (g: RowGroup) => string, label: string, readOnly?: boolean) => (
    <>
      <div className="hidden sm:block">
        <SheetTable s={s} data={data} groups={groups} today={today} todayRate={todayRate} monthTitle={title} readOnly={readOnly} label={label} />
      </div>
      <div className="sm:hidden">
        <SheetCards s={s} data={data} groups={groups} today={today} todayRate={todayRate} monthTitle={title} label={label} />
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <SheetSummary title={data.sheet.clientOrgName} kpis={s.kpis} onStatus={(status) => s.setFilters({ status })}>
        <Button onClick={() => s.setDialog({ kind: 'add' })}>
          <Plus aria-hidden />
          Add invoice
        </Button>
      </SheetSummary>

      <PublishBar data={data} actions={actions} />

      <SheetFilterBar s={s} partners={data.partners} />

      {monthGroups.length ? (
        views(monthGroups, monthTitle, 'Invoices')
      ) : (
        <EmptyState
          title={s.filtered ? 'No invoices match these filters.' : 'No open invoices.'}
          action={
            s.filtered ? (
              <Button size="sm" variant="secondary" onClick={() => s.setFilters({})}>
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => s.setDialog({ kind: 'add' })}>
                Add invoice
              </Button>
            )
          }
        />
      )}

      {weekGroups.length ? views(weekGroups, sectionTitle, 'Received this week', true) : null}

      <datalist id="rcv-sheet-clients">
        {s.clients.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {d?.kind === 'mark' ? (
        <MarkReceivedDialog
          sheetId={s.sheetId}
          invoice={d.invoice}
          partnerName={(d.invoice.partnerId && data.partners.find((p) => p.id === d.invoice.partnerId)?.name) || 'No partner'}
          today={today}
          state={state(actions.markReceived.isPending)}
          onClose={s.close}
          onSave={(input) => actions.markReceived.mutate({ id: d.invoice.id, ...input }, { onSuccess: s.savedToDraft, onError: fail })}
        />
      ) : null}
      {d?.kind === 'pause' ? (
        <PauseDialog
          invoice={d.invoice}
          today={today}
          state={state(actions.pause.isPending)}
          onClose={s.close}
          onSave={(input) =>
            actions.pause.mutate(
              { id: d.invoice.id, ...input },
              { onSuccess: () => (s.close(), toastSuccess(input.until ? `Reminders paused until ${sheetDate(input.until)}` : 'Reminders resumed')), onError: fail },
            )
          }
        />
      ) : null}
      {d?.kind === 'fx' ? (
        <FxEditDialog
          sheetId={s.sheetId}
          invoice={d.invoice}
          today={today}
          state={state(actions.updateInvoice.isPending)}
          onClose={s.close}
          onSave={(patch) => actions.updateInvoice.mutate({ id: d.invoice.id, patch }, { onSuccess: s.savedToDraft, onError: fail })}
        />
      ) : null}
      {d?.kind === 'notes' ? <NotesDialog sheetId={s.sheetId} invoice={d.invoice} onClose={s.close} /> : null}
      {d?.kind === 'history' ? <HistoryDrawer invoice={d.invoice} partners={data.partners} today={today} onClose={s.close} /> : null}
      {d?.kind === 'dispute' ? (
        <DisputeDialog
          invoice={d.invoice}
          state={state(s.report.raiseDispute.isPending)}
          onClose={s.close}
          onSave={(reason) =>
            s.report.raiseDispute.mutate({ invoiceId: d.invoice.id, reason }, { onSuccess: () => (s.close(), toastSuccess('Marked disputed', 'Reminders stop until it is resolved.')), onError: fail })
          }
        />
      ) : null}
      {d?.kind === 'credit' ? (
        <CreditNoteDialog
          invoice={d.invoice}
          today={today}
          state={state(s.report.addCreditNote.isPending)}
          onClose={s.close}
          onSave={(input) => s.report.addCreditNote.mutate({ invoiceId: d.invoice.id, ...input }, { onSuccess: s.savedToDraft, onError: fail })}
        />
      ) : null}
      {d?.kind === 'delete' ? (
        <DangerConfirm
          open
          onOpenChange={(o) => !o && s.close()}
          title={`Delete ${s.invoiceName(d.invoice)}?`}
          body="The invoice leaves the draft. Published versions keep their copy until the next Update."
          word="DELETE"
          confirm="Delete invoice"
          onConfirm={() =>
            actions.deleteInvoice
              .mutateAsync(d.invoice.id)
              .then(() => (s.close(), toastSuccess('Invoice deleted from the draft', 'Click Update to take it off the client page.')))
              .catch((e) => toastError('Not deleted', s.errorText(e)))
          }
        />
      ) : null}
      {d?.kind === 'add' ? (
        <AddInvoiceDialog
          sheetId={s.sheetId}
          months={s.months}
          partners={data.partners}
          clients={s.clients}
          today={today}
          state={state(actions.addInvoice.isPending)}
          onClose={s.close}
          onSave={(input) => actions.addInvoice.mutate(input, { onSuccess: () => (s.close(), toastSuccess('Invoice added to the draft')), onError: fail })}
        />
      ) : null}
      {d?.kind === 'bulk-received' ? (
        <BulkReceivedDialog
          count={s.bulkReceivable.length}
          skipped={s.pickedRows.length - s.bulkReceivable.length}
          totalInr={sumInr(s.bulkReceivable)}
          today={today}
          state={state(s.bulk.markReceived.isPending)}
          onClose={s.close}
          onSave={s.bulkReceive}
        />
      ) : null}
      {d?.kind === 'bulk-pause' ? (
        <BulkPauseDialog count={s.pickedRows.filter((r) => r.status === 'open').length} today={today} state={state(s.bulk.pause.isPending)} onClose={s.close} onSave={s.bulkPause} />
      ) : null}
      <ShareViewDialog sheetId={s.sheetId} filters={s.filters} partnerNames={s.partnerNames} open={d?.kind === 'share-view'} onOpenChange={(o) => !o && s.close()} />
    </div>
  );
}
