'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { BUDGET_TEMPLATES } from '@/data/budget-templates';
import { MONTHS } from '@/lib/budget/model';
import type { BudgetSummary } from '@/lib/budget/wire';
import { toastError } from '@/lib/toast-errors';
import { ApiError, STATUS_WORD, api, crore, errorText } from './format';

/**
 * Every budget this person can reach, one row per client and year. Staff start a budget here. A
 * client with one budget goes straight to it.
 */

interface ListResponse {
  budgets: BudgetSummary[];
  clients: { id: string; name: string }[];
}

function defaultFyYear(): number {
  const now = new Date();
  /* From January, firms plan the year starting next April; before that, the one under way. */
  return now.getMonth() >= 9 || now.getMonth() < 3 ? now.getFullYear() + (now.getMonth() >= 9 ? 1 : 0) : now.getFullYear();
}

export function BudgetListPage({ shellBase, isClient }: { shellBase: string; isClient?: boolean }) {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['budgets'], queryFn: () => api<ListResponse>('/api/budgets') });
  const [status, setStatus] = useState('');
  const [client, setClient] = useState('');
  const [creating, setCreating] = useState(false);
  const budgets = useMemo(() => data?.budgets ?? [], [data]);
  const shown = budgets.filter((b) => (!status || b.status === status) && (!client || b.engagementId === client));
  const clientOptions = useMemo(() => {
    const names = new Map(budgets.map((b) => [b.engagementId, b.companyName]));
    return [...names].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [budgets]);

  if (isClient && budgets.length === 1) router.replace(`${shellBase}/budgets/${budgets[0].id}`);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {clientOptions.length > 1 ? <FilterSelect aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)} options={[{ value: '', label: 'All clients' }, ...clientOptions]} /> : null}
        {budgets.length > 1 ? (
          <FilterSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...Object.entries(STATUS_WORD).map(([value, s]) => ({ value, label: s.label }))]} />
        ) : null}
        {!isClient ? (
          <Button className="ml-auto" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New budget
          </Button>
        ) : null}
      </div>

      {isLoading ? null : !shown.length ? (
        <EmptyState title={isClient ? 'Your firm has not started a budget for you yet.' : 'No budgets yet.'} action={!isClient ? <Button onClick={() => setCreating(true)}>Start the first budget</Button> : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] font-semibold text-ink-muted">
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Year</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Tabs done</th>
                <th className="px-4 py-2 text-right">Published total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id} className="border-b border-line-soft last:border-0 hover:bg-hover">
                  <td className="px-4 py-2.5">
                    <Link className="font-medium text-ink hover:underline" href={`${shellBase}/budgets/${b.id}`}>
                      {b.companyName}
                    </Link>
                    <div className="text-[12px] text-ink-muted">{b.title}</div>
                  </td>
                  <td className="px-4 py-2.5 text-ink">{b.fyName}</td>
                  <td className="px-4 py-2.5">
                    <Chip tone={STATUS_WORD[b.status].tone}>{STATUS_WORD[b.status].label}</Chip>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">
                    {b.sectionsDone} of {b.sectionsTotal}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] text-ink">{b.grandTotal == null ? '–' : crore(b.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? <CreateDialog clients={data?.clients ?? []} budgets={budgets} onClose={() => setCreating(false)} onCreated={(id) => router.push(`${shellBase}/budgets/${id}`)} /> : null}
    </div>
  );
}

function CreateDialog({ clients, budgets, onClose, onCreated }: { clients: { id: string; name: string }[]; budgets: BudgetSummary[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [engagementId, setEngagementId] = useState(clients[0]?.id ?? '');
  const [fyStartYear, setYear] = useState(defaultFyYear());
  const [fyStartMonth, setMonth] = useState(4);
  const [source, setSource] = useState('template:services');
  const [busy, setBusy] = useState(false);
  const earlier = budgets.filter((b) => b.engagementId === engagementId);
  const template = BUDGET_TEMPLATES.find((t) => `template:${t.key}` === source);

  async function create() {
    setBusy(true);
    try {
      const copy = source.startsWith('copy:') ? source.slice(5) : null;
      const { id } = await api<{ id: string }>('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({ engagementId, fyStartYear, fyStartMonth, templateKey: copy ? 'blank' : source.slice(9), copyFromBudgetId: copy }),
      });
      onCreated(id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'budget_exists' && (e.detail as { id?: string } | null)?.id) onCreated((e.detail as { id: string }).id);
      else toastError('Budget not created', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="New budget"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!engagementId || busy} onClick={create}>
            Create
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <FormRow label="Client">
          <FilterSelect size="md" className="w-full" aria-label="Client" value={engagementId} onChange={(e) => setEngagementId(e.target.value)} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        </FormRow>
        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Year starts in">
            <FilterSelect size="md" className="w-full" aria-label="Start month" value={String(fyStartMonth)} onChange={(e) => setMonth(Number(e.target.value))} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
          </FormRow>
          <FormRow label="Of calendar year">
            <input className="h-10 w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 text-[14px] text-ink" type="number" aria-label="Start year" value={fyStartYear} onChange={(e) => setYear(Number(e.target.value))} />
          </FormRow>
        </div>
        <FormRow label="Start from">
          <FilterSelect
            size="md"
            className="w-full"
            aria-label="Start from"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            options={[...BUDGET_TEMPLATES.map((t) => ({ value: `template:${t.key}`, label: t.label })), ...earlier.map((b) => ({ value: `copy:${b.id}`, label: `Copy of ${b.fyName}` }))]}
          />
        </FormRow>
        <p className="text-[13px] text-ink-muted">{template ? template.description : 'Keeps roles, costs and settings. Closing headcount becomes opening; joiners, exits and one-off amounts clear.'}</p>
      </div>
    </Modal>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-ink-muted">{label}</span>
      {children}
    </div>
  );
}
