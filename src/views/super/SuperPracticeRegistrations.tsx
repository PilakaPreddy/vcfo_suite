'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip, OwnerChip, type ChipTone } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ClientTile,
  NameCell,
  StackedBar,
  SuperFilterChips,
  SuperNumberStrip,
  SuperPageError,
  SuperPageHead,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { shortRegistration } from '@/components/super/overview/super-overview-format';
import {
  inRegistrations,
  registrationCounts,
  SUPER_STUCK_DAYS,
  type SuperInsightClient,
  type SuperRegCell,
} from '@/lib/super/super-insights-model';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { usePracticeMetrics } from '@/components/metrics/use-metrics';
import { cn } from '@/lib/utils';

/**
 * PRACTICE · REGISTRATIONS (prototype `PracticeScreen` area "Registrations").
 *
 * The registration-phase steps across every client, read through the checklist gate: a
 * matrix of clients by registration, and the open registrations as work items. A step marked
 * not applicable reads "Not needed"; a client before its certificate shows framed cells
 * ("After COI"). Read-only.
 */
const SUPER_REGISTRATIONS_HREF = '/app/super/practice/registrations';

const CELL_LABEL: Record<SuperRegCell, string> = {
  done: 'Done',
  progress: 'In progress',
  waiting: 'Pending',
  overdue: 'Overdue',
  'not-needed': 'Not needed',
  locked: 'After COI',
};

const CELL_TONE: Record<SuperRegCell, ChipTone> = {
  done: 'ok',
  progress: 'prog',
  waiting: 'teal',
  overdue: 'bad',
  'not-needed': 'idle',
  locked: 'idle',
};

/* Soft cells in status colours (R-13: no white text on a solid colour). */
const CELL_CLASS: Record<SuperRegCell, string> = {
  done: 'bg-positive-soft text-positive',
  progress: 'bg-brand-soft text-brand-text',
  waiting: 'bg-waiting-soft text-waiting',
  overdue: 'bg-danger-soft text-danger',
  'not-needed': 'text-ink-faint',
  locked: 'border-1.5 border-line',
};

function CellMark({ cell }: { cell: SuperRegCell }) {
  if (cell === 'done') return <Check size={14} strokeWidth={2} aria-hidden />;
  if (cell === 'progress') return <i className="h-[7px] w-[7px] rounded-[2px] bg-brand" aria-hidden />;
  if (cell === 'waiting') return <i className="h-[7px] w-[7px] rounded-[2px] bg-waiting-mid" aria-hidden />;
  if (cell === 'overdue') return <i className="h-[7px] w-[7px] rounded-[2px] bg-danger-mid" aria-hidden />;
  if (cell === 'not-needed') return <span aria-hidden>–</span>;
  return null;
}

interface WorkItem {
  id: string;
  client: SuperInsightClient;
  regId: string;
  title: string;
  cell: SuperRegCell;
}

export default function SuperPracticeRegistrations() {
  const router = useRouter();
  const query = useSuperInsights();
  const practiceQuery = usePracticeMetrics();
  const practice = practiceQuery.data;
  const insights = query.data;
  const [view, setView] = useState('matrix');
  const [manager, setManager] = useState('');
  const [openOnly, setOpenOnly] = useState('');
  const [status, setStatus] = useState('');

  const reached = useMemo(() => (insights?.clients ?? []).filter(inRegistrations), [insights]);
  const counts = useMemo(() => (insights ? registrationCounts({ ...insights, clients: reached }) : []), [insights, reached]);
  const neededTypes = useMemo(
    () => (insights?.registrationTypes ?? []).filter((type) => counts.find((c) => c.id === type.id)?.needed),
    [insights, counts],
  );

  const items: WorkItem[] = useMemo(
    () =>
      reached.flatMap((client) =>
        neededTypes.flatMap((type) => {
          const cell = client.registrations[type.id];
          if (cell !== 'progress' && cell !== 'waiting' && cell !== 'overdue') return [];
          return [{ id: `${client.summary.id}:${type.id}`, client, regId: type.id, title: type.title, cell }];
        }),
      ),
    [reached, neededTypes],
  );

  const seo = (
    <SEO
      title="Registrations — VCFO Suite"
      description="Registration steps across every client, from the checklist."
      path={SUPER_REGISTRATIONS_HREF}
    />
  );

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <SuperPageSkeleton label="Loading registrations" />
      </PageTransition>
    );
  }
  if (query.isError || !insights) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="Registrations could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const managers = [...new Set(insights.clients.map((c) => c.summary.managerName ?? 'Unassigned'))].sort((a, b) => a.localeCompare(b));
  const byManager = (c: SuperInsightClient) => !manager || (c.summary.managerName ?? 'Unassigned') === manager;
  const total = (key: 'done' | 'progress' | 'waiting' | 'overdue') => counts.reduce((sum, c) => sum + c[key], 0);
  const open = total('progress') + total('waiting') + total('overdue');

  // Every client is listed: those with a certificate first, then those still incorporating.
  const matrixRows = insights.clients
    .filter(byManager)
    .filter((c) => !openOnly || neededTypes.some((t) => ['progress', 'waiting', 'overdue'].includes(c.registrations[t.id] ?? '')))
    .sort(
      (a, b) =>
        Number(b.summary.incorporated) - Number(a.summary.incorporated) ||
        a.summary.companyName.localeCompare(b.summary.companyName),
    );

  const itemRows = items.filter((w) => byManager(w.client) && (!status || CELL_LABEL[w.cell] === status));

  const tabs = (
    <SpectrumTabs
      label="View"
      items={[
        { key: 'matrix', label: 'Matrix' },
        { key: 'items', label: 'Work items', count: items.length },
      ]}
      value={view}
      onChange={setView}
    />
  );

  const matrixColumns: EFilingColumn<SuperInsightClient>[] = [
    {
      key: 'client',
      header: 'Client',
      width: '220px',
      render: (c) => (
        <NameCell
          lead={<ClientTile id={c.summary.id} name={c.summary.companyName} />}
          title={shortCompany(c.summary.companyName)}
          sub={c.summary.managerName ?? 'No manager'}
        />
      ),
    },
    ...neededTypes.map((type): EFilingColumn<SuperInsightClient> => {
      const count = counts.find((c) => c.id === type.id);
      return {
        key: type.id,
        width: '104px',
        align: 'center',
        header: (
          <span className="block leading-tight" title={`${type.title}: ${count?.done ?? 0} done of ${count?.needed ?? 0} needed`}>
            <span className="block truncate">{shortRegistration(type.title)}</span>
            <span className="block text-[11.5px] font-medium opacity-70">
              {count?.done ?? 0}/{count?.needed ?? 0}
            </span>
          </span>
        ),
        render: (c) => {
          const cell = c.registrations[type.id] ?? 'locked';
          // A framed cell means after the certificate; with the certificate in hand it has just not begun.
          const word = cell === 'locked' && c.summary.incorporated ? 'Not started' : CELL_LABEL[cell];
          return (
            <span
              title={`${type.title} · ${word}`}
              aria-label={`${type.title}: ${word}`}
              className={cn('grid h-6 w-full min-w-[44px] place-items-center rounded-sm text-[12px] font-medium', CELL_CLASS[cell])}
            >
              <CellMark cell={cell} />
            </span>
          );
        },
      };
    }),
  ];

  const itemColumns: EFilingColumn<WorkItem>[] = [
    {
      key: 'client',
      header: 'Client',
      width: '26%',
      render: (w) => (
        <NameCell
          lead={<ClientTile id={w.client.summary.id} name={w.client.summary.companyName} />}
          title={shortCompany(w.client.summary.companyName)}
          sub={w.client.summary.managerName ?? 'No manager'}
        />
      ),
    },
    { key: 'reg', header: 'Registration', width: '28%', render: (w) => <span className="font-medium text-ink">{w.title}</span> },
    {
      key: 'with',
      header: 'With',
      width: '120px',
      render: (w) => <OwnerChip owner={w.cell === 'waiting' ? 'client' : 'sbc'} />,
    },
    { key: 'lead', header: 'Lead', width: '16%', render: (w) => w.client.summary.leadName ?? 'No lead' },
    {
      // Days since the registration step was opened, from the step events (G-13).
      key: 'days',
      header: 'Days in step',
      width: '104px',
      align: 'right',
      render: (w) => {
        const days = practice?.openStepDays[w.client.summary.id]?.[w.regId];
        return days === undefined ? <span className="text-ink-faint">–</span> : <span className="tabular-nums">{days}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (w) => (
        <Chip fixed tone={CELL_TONE[w.cell]}>
          {CELL_LABEL[w.cell]}
        </Chip>
      ),
    },
  ];

  return (
    <PageTransition>
      {seo}
      <div className="flex flex-col gap-5">
        <SuperPageHead title="Registrations" meta={`${reached.length} clients in registrations`} />

        {view === 'matrix' ? (
          <DashSection
            title="Registrations · clients by type"
            meta={`${total('progress')} in progress · ${total('waiting')} pending on documents`}
            right={
              <>
                <SuperFilterChips
                  onClear={() => {
                    setManager('');
                    setOpenOnly('');
                  }}
                  filters={[
                    { key: 'manager', label: 'Manager', value: manager, options: managers, onChange: setManager },
                    { key: 'open', label: 'Clients', value: openOnly, options: ['With open work'], onChange: setOpenOnly },
                  ]}
                />
                {tabs}
              </>
            }
            flush
          >
            <EFilingGrid
              caption="Registrations by client"
              columns={matrixColumns}
              rows={matrixRows}
              rowKey={(c) => c.summary.id}
              onRowClick={(c) => router.push(c.summary.href)}
              empty="No client yet"
              minWidth={220 + neededTypes.length * 104}
              pageSize={17}
              footer={
                <ul className="hidden flex-wrap items-center gap-x-3 gap-y-1 sm:flex">
                  {(['done', 'progress', 'waiting', 'overdue', 'locked', 'not-needed'] as SuperRegCell[])
                    .filter((cell) => cell !== 'overdue' || total('overdue') > 0)
                    .map((cell) => (
                      <li key={cell} className="inline-flex items-center gap-1.5">
                        <span className={cn('grid h-3 w-3 place-items-center rounded-[3px] text-[11px]', CELL_CLASS[cell])} aria-hidden>
                          {cell === 'not-needed' ? '–' : null}
                        </span>
                        {CELL_LABEL[cell]}
                      </li>
                    ))}
                </ul>
              }
            />
          </DashSection>
        ) : (
          // Work items: the grid, and a 360px rail with the status bar and the Stuck card (prototype).
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-5">
              <SuperNumberStrip
                items={[
                  { label: 'Open registrations', value: open },
                  { label: 'Waiting on client', value: total('waiting') },
                  { label: 'Overdue', value: total('overdue'), bad: total('overdue') > 0 },
                  { label: 'Done to date', value: total('done'), good: total('done') > 0 },
                ]}
              />
              <DashSection
                title="Open registrations"
                meta={`${itemRows.length} of ${items.length}`}
                right={
                  <>
                    <SuperFilterChips
                      onClear={() => {
                        setManager('');
                        setStatus('');
                      }}
                      filters={[
                        { key: 'manager', label: 'Manager', value: manager, options: managers, onChange: setManager },
                        { key: 'status', label: 'Status', value: status, options: ['In progress', 'Pending', 'Overdue'], onChange: setStatus },
                      ]}
                    />
                    {tabs}
                  </>
                }
                flush
              >
                <EFilingGrid
                  caption="Open registrations"
                  columns={itemColumns}
                  rows={itemRows}
                  rowKey={(w) => w.id}
                  onRowClick={(w) => router.push(w.client.summary.href)}
                  empty="No open registration matches these filters"
                  minWidth={760}
                  pageSize={15}
                  rowClassName={(w) => (w.cell === 'overdue' ? 'text-danger' : undefined)}
                />
              </DashSection>
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <DashSection title="Registrations by status">
                <StackedBar
                  segments={[
                    { label: 'Done', value: total('done'), tone: 'ok' },
                    { label: 'In progress', value: total('progress'), tone: 'prog' },
                    { label: 'Pending', value: total('waiting'), tone: 'teal' },
                    { label: 'Overdue', value: total('overdue'), tone: 'bad' },
                  ]}
                />
              </DashSection>
              <StuckCard
                items={items}
                daysOf={(w) => practice?.openStepDays[w.client.summary.id]?.[w.regId]}
                onOpen={(w) => router.push(w.client.summary.href)}
              />
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

/**
 * "Stuck" (prototype rail card): open registration items that are overdue or have sat in their
 * step for `SUPER_STUCK_DAYS` days or more, longest first. Days come from the step events.
 */
function StuckCard({
  items,
  daysOf,
  onOpen,
}: {
  items: WorkItem[];
  daysOf: (w: WorkItem) => number | undefined;
  onOpen: (w: WorkItem) => void;
}) {
  const stuck = items
    .map((w) => ({ w, days: daysOf(w) }))
    .filter(({ w, days }) => w.cell === 'overdue' || (days !== undefined && days >= SUPER_STUCK_DAYS))
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  return (
    <DashSection title="Stuck" meta={String(stuck.length)} flush>
      {stuck.length === 0 ? (
        <div className="p-4">
          <EmptyState title="None" />
        </div>
      ) : (
        <ul>
          {stuck.slice(0, 8).map(({ w, days }) => (
            <li key={w.id} className="border-t border-line-soft first:border-t-0">
              <button
                type="button"
                onClick={() => onOpen(w)}
                className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover md:px-5"
              >
                <ClientTile id={w.client.summary.id} name={w.client.summary.companyName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{shortCompany(w.client.summary.companyName)}</span>
                  <span className="block truncate text-[12.5px] text-ink-muted">
                    {w.title} · {w.client.summary.leadName ?? 'No lead'}
                    {days !== undefined ? ` · ${days} ${days === 1 ? 'day' : 'days'}` : ''}
                  </span>
                </span>
                <Chip fixed tone={CELL_TONE[w.cell]}>
                  {CELL_LABEL[w.cell]}
                </Chip>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}
