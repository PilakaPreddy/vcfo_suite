"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BellRing, ChevronRight, Download } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useInternPortfolio } from '@/hooks/use-intern-portfolio';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { shortCompany } from '@/components/super/parts/super-text';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { FilterChip } from '@/components/ui/filter-chip';
import { ClientIdentityTile } from '@/views/client-record/client-identity';
import {
  CLIENT_HEALTHS,
  ClientsLegend,
  NowCell,
  STAGE_CHIP_TONE,
  STAGE_WORD,
  clientRowFacts,
  nextInWeek,
  shortDate,
  type ClientRowFacts,
  type ClientStage,
} from '@/views/admin/clients/client-row';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { PhaseBar } from '@/components/ui/step-track';
import { EmptyState } from '@/components/ui/empty-state';
import { AvatarStack } from '@/components/ui/avatar-stack';
import { SavedViews, type SavedView, type ViewFilters } from '@/components/ui/saved-views';
import type { BulkAction } from '@/components/ui/bulk-bar';
import { RowMoreMenu, RowQuickActions } from '@/components/staff/today/row-actions';
import { workItemChangedAt } from '@/components/staff/today/today-rows';
import { copyRowLink, exportRowsCsv, remindMany } from '@/components/staff/today/work-actions';
import { remindableItemKey } from '@/lib/reminders/reminder-rules';
import type { DirectoryPerson } from '@/lib/email/directory-filter';
import { useRouter, useSearchParams } from 'next/navigation';
import { internEngagementPath } from '@/lib/projects/project-step-path';
import {
  filterInternWork,
  internCompanyPhaseProgress,
  type InternCompanyPhaseProgress,
  type InternWorkItem,
} from '@/lib/intern/intern-work';
import type { Engagement } from '@/data/engagements';
import { ClientHealthChip } from '@/components/client-health/ClientHealthChip';

type Row = {
  e: Engagement;
  pct: number;
  progress: InternCompanyPhaseProgress;
  /** Stage, Now, next date and health, derived from the step state (`clientRowFacts`). */
  facts: ClientRowFacts;
  /** The lead's work items on this client, for the views, Remind and the change time. */
  items: InternWorkItem[];
  /** People who work on the client (managers and leads), from the staff directory. */
  people: string[];
  changedAt?: string;
};

/** E-06: the default views of the lead's Clients; `?view=` opens one. */
const CLIENT_VIEWS: SavedView[] = [
  { key: 'all', label: 'All', filters: {} },
  { key: 'overdue', label: 'My overdue', filters: { show: 'overdue' } },
  { key: 'week', label: 'This week', filters: { show: 'week' } },
  { key: 'waiting', label: 'Waiting on clients', filters: { show: 'waiting' } },
];

/** Whether a client has work in the view: overdue, due this week, or waiting on the client. */
function inShow(show: string, items: InternWorkItem[], now: Date): boolean {
  if (show === 'overdue') return filterInternWork(items, { focus: 'overdue' }, now).length > 0;
  if (show === 'week') return filterInternWork(items, { focus: 'due' }, now).some((i) => i.kind !== 'done');
  if (show === 'waiting') return filterInternWork(items, { tag: 'client' }, now).length > 0;
  return true;
}

/** The same staff directory the managers card reads. */
async function fetchDirectory(): Promise<DirectoryPerson[]> {
  const res = await fetch('/api/outlook/directory');
  const json = (await res.json().catch(() => ({}))) as { people?: DirectoryPerson[] };
  if (!res.ok) return [];
  return json.people ?? [];
}

const remindTargets = (rows: Row[]) =>
  rows.flatMap((r) =>
    r.items
      .map((i) => ({ i, key: remindableItemKey(i) }))
      .filter((x): x is { i: InternWorkItem; key: string } => Boolean(x.key))
      .map(({ i, key }) => ({ engagementId: i.engagementId, itemKey: key, title: i.title })),
  );

/** Lead client status (prototype `clientStatus`): Stuck, Not started, In progress or Done. */
function rowStatus(r: Row): { word: string; tone: ChipTone } {
  if (r.progress.stuck) return { word: 'Stuck', tone: 'bad' };
  const done = r.progress.phases.reduce((n, p) => n + p.done, 0);
  const total = r.progress.phases.reduce((n, p) => n + p.total, 0);
  if (total > 0 && done >= total) return { word: 'Done', tone: 'ok' };
  if (done === 0) return { word: 'Not started', tone: 'idle' };
  return { word: 'In progress', tone: 'prog' };
}

const NEXT_OPTIONS = [
  { value: 'week', label: 'This week' },
  { value: 'next', label: 'Next week' },
];

/**
 * Lead Clients (prototype `ClientsScreen` and `ClientsGrid`): a T1 grid of the lead's companies
 * with the identity tile and contact, the stage chip (Incorporating or Compliance), the ST5 phase
 * bars, where each one is now (holder square, step code, step), who works on it (V3 stacked faces
 * from the staff directory), steps done and its status. Stage tabs, the Health and Next filter
 * chips sit in the card head; the saved views sit in a row under it. Rows can be picked for the bulk bar (Remind the client about what they owe, Export),
 * and Open and Remind show at the row end. A lead does not reassign clients, so there is no
 * Assign. The status is derived from the steps, so its chip stays plain. On phones each company
 * is one row card.
 */
export default function InternClients() {
  return (
    <Suspense fallback={null}>
      <InternClientsInner />
    </Suspense>
  );
}

function InternClientsInner() {
  const { myEngagements, progressByEngagement, workItems } = useInternPortfolio();
  const { user, getStateForEngagement, engagementsLoading } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [stage, setStage] = useState('');
  const [show, setShow] = useState('');
  const [health, setHealth] = useState('');
  const [nextWin, setNextWin] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const now = useMemo(() => new Date(), []);
  const scope = user?.id ?? 'lead';
  const directory = useQuery({ queryKey: ['outlook-directory', 'intern-managers'], queryFn: fetchDirectory, staleTime: 5 * 60_000 });

  // E-05: `?view=overdue` and the like open the list on one saved view.
  const viewParam = params.get('view');
  useEffect(() => {
    const v = CLIENT_VIEWS.find((x) => x.key === viewParam);
    if (v) {
      setShow(v.filters.show ?? '');
      setStage(v.filters.stage ?? '');
    }
  }, [viewParam]);

  const all: Row[] = useMemo(() => {
    const firm = (directory.data ?? []).filter((p) => p.kind === 'firm' && p.status !== 'inactive' && (p.role === 'manager' || p.role === 'intern'));
    return myEngagements.map((e) => {
      const state = getStateForEngagement(e);
      const items = workItems.filter((i) => i.engagementId === e.id);
      const people = firm.filter((p) => p.projects.some((pr) => pr.id === e.id || pr.slug === e.slug)).map((p) => p.name);
      const stamps = items.map((i) => workItemChangedAt(i, i.catalogId ? state[i.catalogId] : undefined)).filter(Boolean) as string[];
      return {
        e,
        pct: progressByEngagement.get(e.id) ?? 0,
        progress: internCompanyPhaseProgress(e, state),
        facts: clientRowFacts(e, state, now),
        items,
        people,
        changedAt: stamps.sort().at(-1),
      };
    });
  }, [myEngagements, progressByEngagement, getStateForEngagement, workItems, directory.data, now]);
  const todayIso = now.toISOString().slice(0, 10);
  const rows = all.filter(
    (r) =>
      (!stage || r.facts.stage === stage) &&
      inShow(show, r.items, now) &&
      (!health || r.facts.health === health) &&
      nextInWeek(r.facts.next, todayIso, nextWin),
  );
  const rowSig = rows.map((r) => r.e.id).join('|');
  // Clients that leave the list (a filter, a refetch) leave the selection too.
  useEffect(() => {
    setPicked((p) => {
      if (p.size === 0) return p;
      const live = new Set(rowSig.split('|'));
      const next = new Set([...p].filter((k) => live.has(k)));
      return next.size === p.size ? p : next;
    });
  }, [rowSig]);
  const current: ViewFilters = { stage, show };
  const anyFilter = Boolean(stage || show || health || nextWin);
  const clear = () => {
    setStage('');
    setShow('');
    setHealth('');
    setNextWin('');
  };
  const remind = (list: Row[]) => {
    const targets = remindTargets(list);
    if (targets.length > 0) void remindMany(targets);
  };
  const bulkActions = (list: Row[]): BulkAction[] => [
    {
      key: 'remind',
      label: 'Remind',
      icon: BellRing,
      disabled: remindTargets(list).length === 0,
      onClick: () => {
        remind(list);
        setPicked(new Set());
      },
    },
    {
      key: 'export',
      label: 'Export',
      icon: Download,
      onClick: () => {
        exportRowsCsv(
          'clients.csv',
          ['Client', 'Contact', 'Stage', 'Now', 'Steps', 'Next', 'Health', 'Status'],
          list.map((r) => [
            r.e.companyName,
            r.e.clientDisplayName ?? '',
            STAGE_WORD[r.facts.stage],
            r.facts.now ? `${r.facts.now.code} ${r.facts.now.title}` : '',
            `${r.facts.done}/${r.facts.total}`,
            r.facts.next ?? '',
            r.facts.health,
            rowStatus(r).word,
          ]),
        );
        setPicked(new Set());
      },
    },
  ];

  const columns: EFilingColumn<Row>[] = [
    {
      key: 'name',
      header: 'Client',
      width: '240px',
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <ClientIdentityTile id={r.e.id} name={r.e.companyName} size={30} />
          <span className="grid min-w-0">
            <Link href={internEngagementPath(r.e)} onClick={(ev) => ev.stopPropagation()} className="min-w-0 truncate font-medium text-ink hover:underline" title={r.e.companyName}>
              {shortCompany(r.e.companyName)}
            </Link>
            {r.e.clientDisplayName ? (
              <span className="grid-sub truncate text-[12px] leading-4 text-ink-muted">
                {r.e.clientDisplayName}
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      width: '124px',
      render: (r) => (
        <Chip tone={STAGE_CHIP_TONE[r.facts.stage]} fixed dot={false}>
          {STAGE_WORD[r.facts.stage]}
        </Chip>
      ),
    },
    {
      key: 'phases',
      header: 'Phases',
      width: '210px',
      render: (r) => (
        <PhaseBar
          done={r.progress.phases.map((p) => p.done)}
          totals={r.progress.phases.map((p) => p.total)}
          names={r.progress.phases.map((p) => p.title)}
          className="w-full"
          stuck={r.progress.stuck}
          hrefFor={(i) => `${internEngagementPath(r.e)}?phase=${i + 1}`}
        />
      ),
    },
    {
      key: 'now',
      header: 'Now',
      render: (r) => <NowCell now={r.facts.now} />,
    },
    {
      key: 'team',
      header: 'Team',
      width: '96px',
      render: (r) => <AvatarStack people={r.people} label={r.people.length ? `Works on it: ${r.people.join(', ')}` : undefined} />,
    },
    {
      key: 'steps',
      // The steps of phases 1 to 3 (25), named so it is not read as the project page's "Step 10 of 14".
      header: 'Phases 1–3',
      width: '92px',
      align: 'right',
      render: (r) => (
        <span className="text-[13px] tabular-nums text-ink-muted" title={`${r.pct}% done`}>
          {r.progress.phases.slice(0, 3).reduce((n, p) => n + p.done, 0)}/{r.progress.phases.slice(0, 3).reduce((n, p) => n + p.total, 0)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '232px',
      render: (r) => {
        const st = rowStatus(r);
        return (
          <span className="flex items-center gap-1.5">
            <Chip tone={st.tone} fixed>
              {st.word}
            </Chip>
            <ClientHealthChip engagementId={r.e.id} />
          </span>
        );
      },
    },
  ];

  const stageCount = (k: ClientStage) => all.filter((r) => r.facts.stage === k).length;
  const tabs = (
    <SpectrumTabs
      label="Stage"
      items={[
        { key: '', label: 'All', count: all.length },
        { key: 'incorporating', label: STAGE_WORD.incorporating, count: stageCount('incorporating') },
        { key: 'compliance', label: STAGE_WORD.compliance, count: stageCount('compliance') },
      ]}
      value={stage}
      onChange={setStage}
    />
  );
  return (
    <PageTransition>
      <SEO title="Clients — VCFO Suite" description="Engagements assigned to you and how far each company is through setup." path="/app/intern/clients" />
      <h1 className="sr-only">Clients</h1>

      {myEngagements.length === 0 && !engagementsLoading ? (
        <EmptyState title="No clients assigned yet" />
      ) : (
        <section className="surface min-w-0 overflow-hidden">
          <div className="flex min-h-[52px] min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line-soft px-4 py-2 md:px-5">
            <CardHeadTile title="Clients" />
            <h2 className="whitespace-nowrap text-[15px] font-medium text-ink">Clients</h2>
            <span className="truncate text-[13px] tabular-nums text-ink-muted">
              {rows.length} of {all.length}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {tabs}
              <FilterChip
                label="Health"
                value={health}
                options={CLIENT_HEALTHS.map((h) => ({ value: h, label: h, count: all.filter((r) => r.facts.health === h).length }))}
                onChange={setHealth}
              />
              <FilterChip label="Next" value={nextWin} options={NEXT_OPTIONS} onChange={setNextWin} />
            </div>
          </div>
          {/* Saved views sit in their own row under the head (prototype `ClientsGrid`). */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 md:px-5">
            <SavedViews storageKey={`${scope}:clients`} views={CLIENT_VIEWS} current={current} onApply={(f) => {
              setStage(f.stage ?? '');
              setShow(f.show ?? '');
            }} />
          </div>
          <div className="hidden md:block">
            <EFilingGrid
              caption="Clients"
              columns={columns}
              rows={rows}
              rowKey={(r) => r.e.id}
              pageSize={14}
              minWidth={860}
              onRowClick={(r) => router.push(internEngagementPath(r.e))}
              empty="No clients match these filters"
              loading={engagementsLoading}
              onClearFilters={anyFilter ? clear : undefined}
              stickyHead
              stickyFirstColumn
              selectable
              selected={picked}
              onSelectedChange={setPicked}
              bulkActions={bulkActions}
              bulkNoun={['client', 'clients']}
              actionsColumn="now"
              footer={<ClientsLegend className="p-0 md:px-0" />}
              rowActions={(r) => (
                <RowQuickActions
                  onOpen={() => router.push(internEngagementPath(r.e))}
                  onRemind={remindTargets([r]).length > 0 ? () => remind([r]) : undefined}
                >
                  <RowMoreMenu link={() => void copyRowLink(internEngagementPath(r.e))} />
                </RowQuickActions>
              )}
              rowShortcuts={[
                { key: 'r', run: (r) => remind([r]) },
                { key: 'c', run: (r) => void copyRowLink(internEngagementPath(r.e)) },
              ]}
              densityScope={`${scope}:clients`}
              changedAt={(r) => r.changedAt}
              visitKey={`${scope}:clients`}
            />
          </div>
          <ul className="md:hidden">
            {rows.length === 0 ? (
              <li className="p-4">
                <EmptyState title="No clients match these filters" />
              </li>
            ) : null}
            {rows.map((r) => {
              const st = rowStatus(r);
              return (
                <li key={r.e.id} className="border-b border-line-soft last:border-b-0">
                  <Link href={internEngagementPath(r.e)} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-sunken/60">
                    <ClientIdentityTile id={r.e.id} name={r.e.companyName} size={30} />
                    <span className="grid min-w-0 flex-1 gap-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <b className="min-w-0 truncate font-medium text-ink">{shortCompany(r.e.companyName)}</b>
                        <Chip tone={st.tone} className="ml-auto flex-none">
                          {st.word}
                        </Chip>
                      </span>
                      <NowCell now={r.facts.now} className="text-[12.5px]" />
                      <span className="flex items-center gap-2">
                        <PhaseBar
                          done={r.progress.phases.map((p) => p.done)}
                          totals={r.progress.phases.map((p) => p.total)}
                          names={r.progress.phases.map((p) => p.title)}
                          className="flex-1"
                        />
                        <span className="flex-none text-[12px] tabular-nums text-ink-muted">
                          {r.progress.phases.slice(0, 3).reduce((n, p) => n + p.done, 0)}/{r.progress.phases.slice(0, 3).reduce((n, p) => n + p.total, 0)}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-muted">
                        <Chip tone={STAGE_CHIP_TONE[r.facts.stage]} dot={false}>
                          {STAGE_WORD[r.facts.stage]}
                        </Chip>
                        {r.facts.next ? <span className="tabular-nums">Next {shortDate(r.facts.next)}</span> : null}
                        <AvatarStack people={r.people} className="ml-auto" />
                      </span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 flex-none text-ink-faint" strokeWidth={1.6} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </PageTransition>
  );
}
