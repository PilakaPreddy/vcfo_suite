'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { fyName, type BudgetSection } from '@/lib/budget/model';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { RowPanel } from './RowPanel';
import { SectionBar } from './SectionBar';
import { ApiError, STATUS_WORD, api, errorText, sectionLabel } from './format';
import { ActivityTab } from './tabs/ActivityTab';
import { ActualsTab } from './tabs/ActualsTab';
import { AnalysisTab } from './tabs/AnalysisTab';
import { BenefitsTab } from './tabs/BenefitsTab';
import { CostTab } from './tabs/CostTab';
import { HiringTab } from './tabs/HiringTab';
import { MasterTab } from './tabs/MasterTab';
import { SettingsTab } from './tabs/SettingsTab';
import { VarianceTab } from './tabs/VarianceTab';
import { VersionsTab } from './tabs/VersionsTab';
import type { Ready } from './types';
import { useBudget } from './use-budget';

const FILL_TABS: BudgetSection[] = ['hiring', 'benefits', 'admin', 'finance', 'settings'];
type Action = 'publish' | 'approve' | 'reject' | 'revise';

const ACTION: Record<Action, { title: string; sub: string; button: string; noteRequired: boolean; done: string }> = {
  publish: { title: 'Publish this version', sub: 'This freezes a version and asks the client to approve it.', button: 'Publish', noteRequired: false, done: 'Published' },
  approve: { title: 'Approve this budget', sub: 'This records your name and the date, and locks the budget.', button: 'Approve', noteRequired: false, done: 'Approved' },
  reject: { title: 'Return this budget', sub: 'It goes back to draft. Give the reason.', button: 'Return', noteRequired: true, done: 'Returned' },
  revise: { title: 'Start a revision', sub: 'It opens a new draft. Published versions do not change. Give the reason.', button: 'Start revision', noteRequired: true, done: 'Revision started' },
};

/** One budget: a slim status bar, then the tabs. The client and year come from the sidebar's list. */
export function BudgetWorkspace({ budgetId, shellBase }: { budgetId: string; shellBase: string }) {
  const b = useBudget(budgetId);
  const router = useRouter();
  const { view, state, result, settings, rows } = b;
  const [tab, setTab] = useState<string>('');
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const tabs = useMemo(() => {
    if (!view) return [];
    const list: { key: string; label: string; count?: number }[] = [];
    if (view.access.canSeeMaster) list.push({ key: 'master', label: 'Master Budget' });
    for (const s of FILL_TABS) if (view.access.visibleSections.includes(s)) list.push({ key: s, label: sectionLabel(s) });
    if (view.access.canSeeActuals) list.push({ key: 'actuals', label: 'Actuals' });
    if (view.access.canSeeVariance) list.push({ key: 'variance', label: 'Variance' });
    if (view.access.canSeeMaster) list.push({ key: 'analysis', label: 'Analysis' });
    list.push({ key: 'versions', label: 'Versions' }, { key: 'activity', label: 'Activity' });
    return list;
  }, [view]);

  if (b.query.isError) return <div className="p-6"><EmptyState title="This budget could not be opened. It may have been removed, or you may not have access to it." /></div>;
  if (!view || !state || !result || !settings) return null;

  const canEdit = (section: BudgetSection) => view.status === 'draft' && view.access.editableSections.includes(section);
  const ready: Ready = { b, view, state, settings, rows, result, canEdit, openRow: setOpenRowId };
  const active = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? 'activity');
  const word = STATUS_WORD[view.status];
  const openRow = rows.find((r) => r.id === openRowId);
  const anyEditable = view.access.editableSections.length > 0;

  const download = (format: string) => {
    if (format) window.location.href = `/api/budgets/${view.id}/export?format=${format}`;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[14px] font-semibold text-ink">
          {view.companyName}, {fyName(settings)}
        </span>
        <Chip raw tone={word.tone}>
          {word.label}
        </Chip>
        {view.currentVersion ? <span className="text-[13px] text-ink-muted">Version {view.currentVersion}</span> : null}
        {view.approvedAt ? <span className="text-[13px] text-ink-muted">Approved by {view.approvedByName}</span> : null}
        <span className="text-[13px] text-ink-muted" aria-live="polite">
          {b.saveState === 'saving' ? 'Saving' : b.saveState === 'error' ? 'Not saved' : ''}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <FilterSelect
            aria-label="Download"
            value=""
            onChange={(e) => download(e.target.value)}
            options={[{ value: '', label: 'Download' }, { value: 'xlsx', label: 'Excel workbook' }, ...(view.access.canSeeMaster ? [{ value: 'pdf', label: 'PDF budget pack' }] : []), { value: 'template', label: 'Blank template' }]}
          />
          {anyEditable ? (
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              Import Excel
            </Button>
          ) : null}
          {view.access.canPublish && view.status === 'draft' ? (
            <Button size="sm" onClick={() => setAction('publish')}>
              Publish
            </Button>
          ) : null}
          {view.access.canApprove ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setAction('reject')}>
                Return
              </Button>
              <Button size="sm" onClick={() => setAction('approve')}>
                Approve
              </Button>
            </>
          ) : null}
          {view.access.canPublish && view.status !== 'draft' ? (
            <Button variant="outline" size="sm" onClick={() => setAction('revise')}>
              Start revision
            </Button>
          ) : null}
          {view.access.canManage && view.status === 'draft' && !view.currentVersion ? (
            <Button variant="quiet" size="sm" onClick={() => setRemoving(true)}>
              Remove
            </Button>
          ) : null}
        </span>
      </div>

      <SpectrumTabs label="Budget tabs" variant="underline" items={tabs} value={active} onChange={setTab} />

      {(FILL_TABS as string[]).includes(active) ? <SectionBar ready={ready} section={active as BudgetSection} /> : null}

      {active === 'master' ? <MasterTab ready={ready} /> : null}
      {active === 'hiring' ? <HiringTab ready={ready} /> : null}
      {active === 'benefits' ? <BenefitsTab ready={ready} /> : null}
      {active === 'admin' ? <CostTab ready={ready} section="admin" /> : null}
      {active === 'finance' ? <CostTab ready={ready} section="finance" /> : null}
      {active === 'settings' ? <SettingsTab ready={ready} /> : null}
      {active === 'actuals' ? <ActualsTab ready={ready} /> : null}
      {active === 'variance' ? <VarianceTab ready={ready} /> : null}
      {active === 'analysis' ? <AnalysisTab ready={ready} /> : null}
      {active === 'versions' ? <VersionsTab ready={ready} siblings={b.query.data?.siblings ?? []} /> : null}
      {active === 'activity' ? <ActivityTab ready={ready} /> : null}

      {openRow ? <RowPanel key={openRow.id} ready={ready} row={openRow} onClose={() => setOpenRowId(null)} /> : null}
      {action ? <ActionDialog ready={ready} action={action} onClose={() => setAction(null)} /> : null}
      {importing ? <ImportDialog ready={ready} onClose={() => setImporting(false)} /> : null}
      {removing ? (
        <Modal
          open
          onOpenChange={(open) => !open && setRemoving(false)}
          title="Remove this budget?"
          sub="It leaves the list for everyone on this client."
          footer={
            <>
              <Button variant="outline" onClick={() => setRemoving(false)}>
                Keep it
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await api(`/api/budgets/${view.id}`, { method: 'DELETE' });
                    router.push(`${shellBase}/budgets`);
                  } catch (e) {
                    toastError('Budget not removed', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
                  }
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          <span />
        </Modal>
      ) : null}
    </div>
  );
}

function ActionDialog({ ready, action, onClose }: { ready: Ready; action: Action; onClose: () => void }) {
  const { view, b, result } = ready;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const a = ACTION[action];
  const blockers = action === 'publish' ? [...result.issues.filter((i) => i.severity === 'error').map((i) => i.message), ...result.unmapped.map((u) => `${u.name}: choose a Master Budget line.`)] : [];
  const notDone = action === 'publish' ? view.sections.filter((s) => s.status !== 'done').map((s) => sectionLabel(s.section)) : [];

  const run = async () => {
    setBusy(true);
    try {
      await api(`/api/budgets/${view.id}/workflow`, { method: 'POST', body: JSON.stringify({ action, note: note.trim() || null }) });
      toastSuccess(a.done);
      void b.refresh();
      onClose();
    } catch (e) {
      toastError('Not done', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={a.title}
      sub={a.sub}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || blockers.length > 0 || (a.noteRequired && !note.trim())} onClick={() => void run()}>
            {a.button}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {blockers.length ? (
          <ul className="text-[13px] text-danger">
            {blockers.slice(0, 8).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}
        {notDone.length ? <p className="text-[13px] text-ink-muted">Not marked done yet: {notDone.join(', ')}.</p> : null}
        <textarea className="min-h-[80px] w-full rounded-md border-1.5 border-line-strong bg-surface-raised p-2 text-[14px] text-ink outline-none focus:border-brand" aria-label={a.noteRequired ? 'Reason' : 'Note'} placeholder={a.noteRequired ? 'Reason' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

interface ImportPreview {
  sheets: string[];
  rows: number;
  warnings: string[];
  saved: number;
  linked?: boolean;
}

function ImportDialog({ ready, onClose }: { ready: Ready; onClose: () => void }) {
  const { view, b } = ready;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (chosen: File, mode?: 'preview') => {
    setBusy(true);
    const form = new FormData();
    form.set('file', chosen);
    if (mode) form.set('mode', mode);
    try {
      const res = await api<ImportPreview>(`/api/budgets/${view.id}/import`, { method: 'POST', body: form });
      if (mode) setPreview(res);
      else {
        toastSuccess(`Imported ${res.saved} rows`);
        void b.refresh();
        onClose();
      }
    } catch (e) {
      toastError('File not imported', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Import from Excel"
      sub="Use the template from Download, an exported budget, or the linked budget workbook. Rows on the sheets in the file replace the rows on those tabs."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!file || !preview || busy} onClick={() => file && void send(file)}>
            Import {preview ? `${preview.rows} rows` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          aria-label="Workbook"
          className="text-[14px] text-ink"
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            setPreview(null);
            if (chosen) void send(chosen, 'preview');
          }}
        />
        {preview ? (
          <div className="text-[13px] text-ink">
            <p>
              Found {preview.rows} rows on: {preview.sheets.join(', ')}.
            </p>
            {preview.linked ? <p className="text-ink-muted">This is the linked budget workbook, so its settings, departments, tax assumptions and typed payroll come in too.</p> : null}
            {preview.warnings.length ? (
              <ul className="mt-1 text-danger">
                {preview.warnings.slice(0, 10).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
