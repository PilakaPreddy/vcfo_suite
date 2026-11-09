'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PanelSection, SidePanel } from '@/components/ui/side-panel';
import { CURRENCIES, MONTHS, ROW_SECTION, type BenefitData, type BudgetRow, type CostCommon, type OnceData, type RoleData } from '@/lib/budget/model';
import type { AttachmentEntry, ChangeEntry, CommentEntry } from '@/lib/budget/wire';
import { toastError } from '@/lib/toast-errors';
import { Field, NumberCell, SelectCell, TextCell } from './cells';
import { ApiError, api, errorText } from './format';
import { describeChange, stamp } from './tabs/ActivityTab';
import { departmentOptions, locationOptions, type Ready } from './types';

/** The less common fields of a row, with its comments, documents and history. */
export function RowPanel({ ready, row, onClose }: { ready: Ready; row: BudgetRow; onClose: () => void }) {
  const { b, settings, result, view } = ready;
  const section = ROW_SECTION[row.kind];
  const canEdit = ready.canEdit(section);
  const set = (patch: Record<string, unknown>) => b.patchRow(row.id, patch);
  const name = row.kind === 'role' ? (row.data as RoleData).role : (row.data as CostCommon).name;
  const isCost = row.kind !== 'role' && row.kind !== 'benefit';
  const monthOptions = result.calendar.map((m) => ({ value: String(m), label: MONTHS[m - 1] }));
  const [confirming, setConfirming] = useState(false);

  const copyAcross = () => {
    const first = result.calendar[0] - 1;
    if (row.kind === 'admin_once' || row.kind === 'finance_once') {
      const months = (row.data as OnceData).months ?? [];
      set({ months: months.map(() => months[first] ?? 0) });
    } else if (row.kind === 'role') {
      const hires = (row.data as RoleData).hires ?? [];
      set({ hires: hires.map(() => hires[first] ?? 0) });
    }
  };

  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={name || 'Row'}
      footer={
        canEdit ? (
          confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Keep the row
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void b.removeRow(row.id);
                  onClose();
                }}
              >
                Remove the row
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              Remove this row
            </Button>
          )
        ) : null
      }
    >
      <PanelSection title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          {row.kind === 'role' ? (
            <>
              <Field label="Joining day of the month" help="1 is a full first month. 16 is half a month.">
                <NumberCell label="Joining day" percent value={(row.data as RoleData).joinDay} disabled={!canEdit} onChange={(v) => set({ joinDay: v ?? 1 })} />
              </Field>
              <Field label="Location">
                <SelectCell label="Location" value={(row.data as RoleData).locationId} disabled={!canEdit} options={locationOptions(settings)} onChange={(v) => set({ locationId: v })} />
              </Field>
              {view.access.canSeeCtc ? (
                <>
                  <Field label="Own increment %" help="Blank uses the budget's increment.">
                    <NumberCell label="Own increment percent" percent placeholder={String(settings.incrementPct || 0)} value={(row.data as RoleData).incrementPct} disabled={!canEdit} onChange={(v) => set({ incrementPct: v })} />
                  </Field>
                  <Field label="Own increment month">
                    <SelectCell label="Own increment month" value={(row.data as RoleData).incrementMonth ? String((row.data as RoleData).incrementMonth) : ''} disabled={!canEdit} options={monthOptions} onChange={(v) => set({ incrementMonth: v ? Number(v) : null })} />
                  </Field>
                </>
              ) : null}
            </>
          ) : null}
          {row.kind === 'benefit' ? (
            <Field label="Location">
              <SelectCell label="Location" value={(row.data as BenefitData).locationId} disabled={!canEdit} options={locationOptions(settings)} onChange={(v) => set({ locationId: v })} />
            </Field>
          ) : null}
          {isCost ? (
            <>
              <Field label="Currency">
                <SelectCell label="Currency" blank={false} value={(row.data as CostCommon).currency || 'INR'} disabled={!canEdit} options={['INR', ...CURRENCIES].map((c) => ({ value: c, label: c }))} onChange={(v) => set({ currency: v === 'INR' ? '' : v })} />
              </Field>
              <Field label="Paid after (months)" help="Moves the payment in the cash flow, not the cost.">
                <NumberCell label="Payment lag" percent value={(row.data as CostCommon).payLagMonths} disabled={!canEdit} onChange={(v) => set({ payLagMonths: v ?? 0 })} />
              </Field>
              <Field label="Department">
                <SelectCell label="Department" value={(row.data as CostCommon).departmentId} disabled={!canEdit} options={departmentOptions(settings)} onChange={(v) => set({ departmentId: v })} />
              </Field>
              <Field label="Location">
                <SelectCell label="Location" value={(row.data as CostCommon).locationId} disabled={!canEdit} options={locationOptions(settings)} onChange={(v) => set({ locationId: v })} />
              </Field>
              <label htmlFor="budget-gst-recoverable" className="flex items-center gap-2 text-[14px] text-ink sm:col-span-2">
                <Checkbox id="budget-gst-recoverable" checked={(row.data as CostCommon).gstRecoverable} disabled={!canEdit} onCheckedChange={(v) => set({ gstRecoverable: v === true })} /> GST is recoverable as input credit
              </label>
              <label htmlFor="budget-capital" className="flex items-center gap-2 text-[14px] text-ink sm:col-span-2">
                <Checkbox id="budget-capital" checked={(row.data as CostCommon).capital} disabled={!canEdit} onCheckedChange={(v) => set({ capital: v === true })} /> Capital item: reaches the budget as depreciation
              </label>
              {(row.data as CostCommon).capital ? (
                <Field label="Useful life (years)">
                  <NumberCell label="Useful life" percent value={(row.data as CostCommon).lifeYears} disabled={!canEdit} onChange={(v) => set({ lifeYears: v ?? 0 })} />
                </Field>
              ) : null}
            </>
          ) : null}
          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextCell label="Notes" value={(row.data as CostCommon).notes} disabled={!canEdit} onChange={(v) => set({ notes: v })} />
            </Field>
          </div>
        </div>
        {canEdit && (row.kind === 'role' || row.kind.endsWith('_once')) ? (
          <Button className="mt-3" variant="outline" size="sm" onClick={copyAcross}>
            Copy the first month across the year
          </Button>
        ) : null}
      </PanelSection>
      <RowComments ready={ready} row={row} />
      <RowFiles ready={ready} row={row} canEdit={canEdit} />
      <RowHistory ready={ready} row={row} />
    </SidePanel>
  );
}

function RowComments({ ready, row }: { ready: Ready; row: BudgetRow }) {
  const { view, b } = ready;
  const queryClient = useQueryClient();
  const key = ['budget-comments', view.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api<{ comments: CommentEntry[] }>(`/api/budgets/${view.id}/comments`) });
  const [body, setBody] = useState('');
  const mine = (data?.comments ?? []).filter((c) => c.rowId === row.id);
  const post = async () => {
    try {
      await api(`/api/budgets/${view.id}/comments`, { method: 'POST', body: JSON.stringify({ section: ROW_SECTION[row.kind], rowId: row.id, body }) });
      setBody('');
      void queryClient.invalidateQueries({ queryKey: key });
      void b.refresh();
    } catch (e) {
      toastError('Comment not added', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    }
  };
  return (
    <PanelSection title="Comments">
      <ul className="flex flex-col gap-2 text-[14px] text-ink">
        {mine.map((c) => (
          <li key={c.id}>
            <p className="whitespace-pre-wrap">{c.body}</p>
            <p className="text-[12px] text-ink-muted">
              {c.authorName}, {stamp(c.createdAt)}
            </p>
          </li>
        ))}
      </ul>
      <textarea className="mt-2 min-h-[60px] w-full rounded-md border-1.5 border-line-strong bg-surface-raised p-2 text-[14px] text-ink outline-none focus:border-brand" aria-label="Comment on this row" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button className="mt-1.5" size="sm" variant="outline" disabled={!body.trim()} onClick={() => void post()}>
        Add comment
      </Button>
    </PanelSection>
  );
}

function RowFiles({ ready, row, canEdit }: { ready: Ready; row: BudgetRow; canEdit: boolean }) {
  const { view, b } = ready;
  const queryClient = useQueryClient();
  const key = ['budget-files', view.id, row.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api<{ attachments: AttachmentEntry[] }>(`/api/budgets/${view.id}/rows/${row.id}/attachments`) });
  const input = useRef<HTMLInputElement>(null);
  const after = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void b.refresh();
  };
  const upload = async (file: File) => {
    const form = new FormData();
    form.set('file', file);
    try {
      await api(`/api/budgets/${view.id}/rows/${row.id}/attachments`, { method: 'POST', body: form });
      after();
    } catch (e) {
      toastError('File not added', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    }
    if (input.current) input.current.value = '';
  };
  const remove = async (id: string) => {
    await api(`/api/budgets/${view.id}/attachments/${id}`, { method: 'DELETE' }).catch(() => toastError('File not removed'));
    after();
  };
  return (
    <PanelSection title="Supporting documents">
      <ul className="flex flex-col gap-1 text-[14px]">
        {(data?.attachments ?? []).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            <a className="truncate text-ink underline" href={`/api/budgets/${view.id}/attachments/${a.id}`} target="_blank" rel="noreferrer">
              {a.fileName}
            </a>
            {canEdit ? (
              <button type="button" className="text-[12px] text-ink-muted underline hover:text-ink" onClick={() => void remove(a.id)}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <>
          <input ref={input} type="file" className="hidden" aria-label="Supporting document" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button className="mt-1.5" size="sm" variant="outline" onClick={() => input.current?.click()}>
            Add a document
          </Button>
        </>
      ) : null}
    </PanelSection>
  );
}

function RowHistory({ ready, row }: { ready: Ready; row: BudgetRow }) {
  const { view } = ready;
  const { data } = useQuery({ queryKey: ['budget-changes', view.id, row.id], queryFn: () => api<{ changes: ChangeEntry[] }>(`/api/budgets/${view.id}/changes?row=${row.id}`) });
  return (
    <PanelSection title="History">
      <ul className="flex flex-col gap-1.5 text-[13px] text-ink">
        {(data?.changes ?? []).map((c) => (
          <li key={c.id}>
            {describeChange(c)}
            <div className="text-[12px] text-ink-muted">
              {c.actorName ?? 'System'}, {stamp(c.createdAt)}
            </div>
          </li>
        ))}
        {data && !data.changes.length ? <li className="text-ink-muted">No changes yet.</li> : null}
      </ul>
    </PanelSection>
  );
}
