'use client';

import Link from 'next/link';
import { useMemo, useRef } from 'react';
import { AlertCircle, AlertTriangle, CalendarClock, Check, CircleCheck, CircleDashed, Clock, MoreHorizontal, User } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { FilterSelect } from '@/components/ui/native-select';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { useApp } from '@/context/AppContext';
import type { Engagement } from '@/data/engagements';
import { REG_SHORT } from '@/lib/client-portal/credentials';
import { cn } from '@/lib/utils';
import { ALL_COMPANIES, normaliseCompanyParam, soleCompany, type ComplianceScope } from '@/views/compliances/compliance-scope';
import { isIdentifier, plainDate } from '@/lib/compliance/spectrum-status';
import { FilterStrip, FlowCard, RailCard, WordChip, type StripItem } from '@/views/compliances/spectrum-parts';
import { useViewParams } from '@/views/compliances/view-params';
import { useRegistrationFacts, type RegistrationFacts } from '@/hooks/use-registration-facts';
import { renewalOf } from '@/lib/registrations/registration-facts';
import { GroupedGrid, HeadCard, KeyHint, useListKeys, type GridColumn, type GridGroup } from '@/views/compliances/grouped-grid';
import {
  REG_CATEGORIES,
  regDateLabel,
  regFlow,
  registrationRows,
  workbookRowKey,
  type RegistrationRow,
  type RegWord,
} from '@/views/compliances/registration-rows';

type RegFilter = '' | 'done' | 'progress' | 'waiting' | 'none' | 'overdue' | 'renewals';
/** Renewals tile and rail: a stored expiry within this many days, or past. */
const RENEWAL_WINDOW_DAYS = 60;
const FILTER_WORD: Record<Exclude<RegFilter, '' | 'renewals'>, RegWord[]> = {
  done: ['Done'],
  progress: ['In progress'],
  waiting: ['Waiting'],
  none: ['Not started', 'Due soon'],
  overdue: ['Overdue'],
};
const CAT_DOT: Record<string, string> = {
  Tax: 'bg-reg-gst',
  Labour: 'bg-reg-labour',
  Business: 'bg-warning-mid',
  IP: 'bg-identity',
  FEMA: 'bg-reg-fema',
  na: 'bg-ink-faint',
};

/** Grid cell look per word: done green tick, working blue dots, waiting teal mark, not started grey, not needed hatched. */
const CELL: Record<'done' | 'run' | 'wait' | 'late' | 'none' | 'na', { cls: string; Icon?: typeof Check; label: string }> = {
  done: { cls: 'bg-positive-soft text-positive', Icon: Check, label: 'Done' },
  run: { cls: 'bg-brand-soft text-brand-text', Icon: MoreHorizontal, label: 'In progress' },
  wait: { cls: 'bg-waiting-soft text-waiting', Icon: AlertCircle, label: 'Waiting' },
  late: { cls: 'bg-danger-soft text-danger', Icon: AlertTriangle, label: 'Overdue' },
  none: { cls: 'bg-surface-sunken text-ink-faint', label: 'Not started' },
  na: { cls: 'border-1.5 border-line-strong text-ink-faint', label: 'Not needed' },
};
function cellOf(word: RegWord): keyof typeof CELL {
  if (word === 'Done') return 'done';
  if (word === 'In progress') return 'run';
  if (word === 'Waiting') return 'wait';
  if (word === 'Overdue') return 'late';
  if (word === 'Not needed') return 'na';
  return 'none';
}

/**
 * REGISTRATIONS — the registration-phase steps across the staff member's
 * engagements (prototype RegistrationsScreen). A number strip filters the
 * list; the list groups by category with "Not needed" last, and the grid view
 * shows each client against each registration. The rail carries the progress
 * flow, "Due in the next 15 days", "Waiting on client" and "Recently done".
 *
 * The roster in `scope` is the caller's own (scoped by `AuthContext`) and the
 * step state is `getStateForEngagement`; pre-incorporation companies are left
 * out (their registrations cannot start) and counted in the portfolio note.
 * `?company=`, `?view=grid` and `?state=` carry the state on refresh.
 *
 * Numbers, certificates and renewal dates come from the slim, scoped
 * `GET /api/registrations` read across the engagements in scope (G-05, G-06);
 * a number typed on the credentials workbook wins over the step's answer.
 * `embedded` renders the list as a tab of the client record (G-19): the state
 * stays in memory and the page head is left to the record.
 */
export function RegistrationsView({ shellBase, scope, embedded = false }: { shellBase: string; scope: ComplianceScope; embedded?: boolean }) {
  const now = useMemo(() => new Date(), []);
  const { getStateForEngagement } = useApp();
  const basePath = `${shellBase}/registrations`;
  const params = useViewParams(basePath, embedded);
  const factsQ = useRegistrationFacts({ engagementId: embedded ? scope.engagements[0]?.id : null });
  const factOf = (r: RegistrationRow): RegistrationFacts | undefined => factsQ.data?.[r.engagement.id]?.[r.item.id];
  const numberOf = (r: RegistrationRow): string | undefined => factOf(r)?.number ?? r.number;

  const engagements = useMemo(
    () => scope.engagements.filter((e) => !scope.preIncorporationIds.has(e.id)),
    [scope.engagements, scope.preIncorporationIds],
  );
  const sole = soleCompany(engagements);
  const companyId = sole ? sole.id : normaliseCompanyParam(params.get('company'), engagements);
  const view = params.get('view') === 'grid' ? 'grid' : 'list';
  const stateParam = params.get('state') ?? '';
  const filter: RegFilter = stateParam in FILTER_WORD || stateParam === 'renewals' ? (stateParam as RegFilter) : '';

  const inView: Engagement[] = useMemo(
    () => (companyId === ALL_COMPANIES ? engagements : engagements.filter((e) => e.id === companyId)),
    [engagements, companyId],
  );
  const items = useMemo(() => registrationRows(inView, getStateForEngagement, now), [inView, getStateForEngagement, now]);
  const live = items.filter((r) => r.word !== 'Not needed');
  const notNeeded = items.filter((r) => r.word === 'Not needed');
  // A renewal is a granted registration whose stored expiry falls within 60 days or has passed.
  const renewalSoon = (r: RegistrationRow) => {
    const renewal = renewalOf(factOf(r), now);
    return Boolean(renewal && renewal.days <= RENEWAL_WINDOW_DAYS);
  };
  const match = (r: RegistrationRow, f: RegFilter) => !f || (f === 'renewals' ? renewalSoon(r) : FILTER_WORD[f].includes(r.word));
  const shown = live.filter((r) => match(r, filter));
  const count = (f: Exclude<RegFilter, ''>) => live.filter((r) => match(r, f)).length;

  const setParams = params.set;
  const hrefOf = (r: RegistrationRow) => `${basePath}/${encodeURIComponent(r.key)}`;

  // Prototype strip: Granted, In progress, Waiting, Not started, Renewals in 60 days.
  const strip: StripItem[] = [
    { key: 'done', label: 'Granted', value: count('done'), Icon: CircleCheck, valueClass: 'text-positive' },
    { key: 'progress', label: 'In progress', value: count('progress'), Icon: Clock },
    { key: 'waiting', label: 'Waiting on client', value: count('waiting'), Icon: User },
    { key: 'none', label: 'Not started', value: count('none'), Icon: CircleDashed },
    { key: 'renewals', label: 'Renewals in 60 days', value: count('renewals'), Icon: CalendarClock, valueClass: 'text-warning' },
  ];

  const groups: GridGroup<RegistrationRow>[] = REG_CATEGORIES.map((c) => ({
    id: c,
    label: c,
    dot: CAT_DOT[c],
    rows: shown.filter((r) => r.category === c),
  }));
  // "Not needed" closes the list when no state filter is on.
  if (!filter && notNeeded.length) groups.push({ id: 'na', label: 'Not needed', dot: CAT_DOT.na, rows: notNeeded });

  const listCols: GridColumn<RegistrationRow>[] = [
    {
      key: 'name',
      label: 'Registration',
      render: (r) => (
        <span className="block min-w-0">
          <b className="block truncate text-[14px] font-medium text-ink">{r.name}</b>
          <span className="block truncate text-[12.5px] text-ink-muted">{r.engagement.companyName}</span>
        </span>
      ),
    },
    { key: 'auth', label: 'Authority', width: 150, className: 'hidden md:table-cell', render: (r) => <span className="text-ink-2">{r.authority}</span> },
    {
      key: 'num',
      label: 'Number',
      width: 160,
      className: 'hidden md:table-cell',
      render: (r) => {
        const number = numberOf(r);
        return number ? (
          <span className={cn(isIdentifier(number) && 'font-mono text-[12.5px]')}>{number}</span>
        ) : (
          <span className="text-ink-muted">{r.form ?? '—'}</span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      width: 128,
      render: (r) =>
        r.word === 'Not needed' ? (
          <Chip tone="idle" fixed dot={false} raw>
            Not needed
          </Chip>
        ) : (
          <WordChip word={r.word} />
        ),
    },
    {
      key: 'date',
      label: 'Date',
      width: 120,
      render: (r) => {
        const d = regDateLabel(r, now);
        return <span className={cn('whitespace-nowrap', d.className ?? 'text-ink-muted')}>{d.text}</span>;
      },
    },
  ];

  // Grid view: one row per client, one column per registration.
  const types = useMemo(() => (items.length ? [...new Map(items.map((r) => [r.item.id, r.item])).values()] : []), [items]);
  const byKey = new Map(items.map((r) => [r.key, r]));
  const gridCols: EFilingColumn<Engagement>[] = [
    { key: 'client', header: 'Client', width: '200px', render: (e) => <b className="font-medium text-ink">{e.companyName}</b> },
    ...types.map(
      (item): EFilingColumn<Engagement> => ({
        key: item.id,
        header: <span title={item.title}>{REG_SHORT[workbookRowKey(item) ?? ''] ?? item.title.split(' ')[0]}</span>,
        width: '64px',
        align: 'center',
        render: (e) => {
          const r = byKey.get(`${e.id}~${item.id}`);
          if (!r) return null;
          const c = CELL[cellOf(r.word)];
          return (
            <Link href={hrefOf(r)} className="block hover:opacity-80" aria-label={`${e.companyName} · ${item.title} · ${c.label}`} title={`${item.title} · ${c.label}`}>
              <span className={cn('mx-auto grid h-6 w-9 place-items-center rounded-sm', c.cls)}>
                {c.Icon ? <c.Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden /> : null}
              </span>
            </Link>
          );
        },
      }),
    ),
  ];

  const flow = regFlow(items);
  const waiting = live.filter((r) => r.word === 'Waiting').slice(0, 5);
  // Renewals: registrations with a stored expiry within 60 days or past (amber within 30, red past).
  const renewals = live
    .map((r) => ({ r, renewal: renewalOf(factOf(r), now) }))
    .filter((x) => x.renewal && x.renewal.days <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.renewal!.renewBy.localeCompare(b.renewal!.renewBy))
    .slice(0, 5);
  const nextToStart = live.filter((r) => r.word === 'Not started').slice(0, 4);
  const done = live
    .filter((r) => r.word === 'Done')
    .sort((a, b) => (b.completedOn ?? '').localeCompare(a.completedOn ?? ''))
    .slice(0, 4);

  // List keys (prototype `useListKeys`); inside the client record the ref stays unattached.
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLSpanElement>(null);
  useListKeys(listRef, filterRef);

  const head = (
    <span ref={filterRef} className="contents">
      {sole ? null : (
        <FilterSelect
          aria-label="Client"
          options={[{ value: ALL_COMPANIES, label: 'All my clients' }, ...engagements.map((e) => ({ value: e.id, label: e.companyName }))]}
          value={companyId}
          onChange={(e) => setParams({ company: e.target.value === ALL_COMPANIES ? null : e.target.value })}
        />
      )}
      <SpectrumTabs
        label="View"
        items={[
          { key: 'list', label: 'List' },
          { key: 'grid', label: 'Grid' },
        ]}
        value={view}
        onChange={(v) => setParams({ view: v === 'grid' ? 'grid' : null })}
      />
      {filter || (!sole && companyId !== ALL_COMPANIES) ? (
        <Button size="sm" variant="ghost" onClick={() => setParams({ state: null, company: null })}>
          Clear
        </Button>
      ) : null}
    </span>
  );

  return (
    <PageTransition>
      {embedded ? null : <SEO title="Registrations — VCFO Suite" description="Statutory registrations across your clients." path={basePath} />}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {embedded ? null : <h1 className="sr-only">Registrations</h1>}
        <FilterStrip items={strip} value={filter} onChange={(k) => setParams({ state: k || null })} />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div ref={embedded ? undefined : listRef} className="min-w-0">
            {view === 'grid' ? (
              <HeadCard title="Registrations" count={inView.length} right={head}>
                <EFilingGrid
                  caption="Registrations by client"
                  columns={gridCols}
                  rows={inView}
                  rowKey={(e) => e.id}
                  pageSize={10}
                  minWidth={200 + types.length * 64}
                  empty="No clients"
                />
                <div className="hidden flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2 text-[12.5px] text-ink-muted md:flex">
                  {(Object.keys(CELL) as Array<keyof typeof CELL>).map((k) => {
                    const c = CELL[k];
                    return (
                      <span key={k} className="inline-flex items-center gap-1.5">
                        <span className={cn('grid h-4 w-5 place-items-center rounded-[3px]', c.cls)}>
                          {c.Icon ? <c.Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden /> : null}
                        </span>
                        {c.label}
                      </span>
                    );
                  })}
                </div>
              </HeadCard>
            ) : (
              <GroupedGrid
                title="Registrations"
                count={shown.length}
                right={head}
                columns={listCols}
                groups={groups}
                rowKey={(r) => r.key}
                rowHref={hrefOf}
                empty="No registrations in view"
                footer={
                  <>
                    {companyId === ALL_COMPANIES ? <span>{inView.length} clients</span> : null}
                    {embedded ? null : <KeyHint />}
                  </>
                }
              />
            )}
          </div>
          <div className="grid min-w-0 gap-3">
            <FlowCard
              title="Progress"
              steps={[
                { label: 'Documents', value: flow.documents },
                { label: 'Application', value: flow.application },
                { label: 'Authority review', value: flow.review },
                { label: 'Granted', value: flow.granted },
              ]}
            />
            <RailCard
              title="Renewals and expiry"
              items={renewals.map(({ r, renewal }) => ({
                key: r.key,
                title: r.name,
                sub: renewal!.word === 'Overdue' ? `${r.engagement.companyName} · Expired` : r.engagement.companyName,
                right: plainDate(renewal!.renewBy, now),
                rightClass:
                  renewal!.word === 'Overdue' ? 'font-medium text-danger' : renewal!.word === 'Due soon' ? 'font-medium text-warning' : undefined,
                href: hrefOf(r),
              }))}
            />
            <RailCard
              title="Waiting on client"
              items={waiting.map((r) => ({
                key: r.key,
                title: r.name,
                sub: r.engagement.companyName,
                right: regDateLabel(r, now).text,
                rightClass: 'font-medium text-waiting',
                href: hrefOf(r),
              }))}
            />
            <RailCard
              title="Recently granted"
              items={done.map((r) => ({
                key: r.key,
                title: r.name,
                sub: numberOf(r) ? `${r.engagement.companyName} · ${numberOf(r)}` : r.engagement.companyName,
                right: plainDate(r.registrationDate ?? r.completedOn, now),
                href: hrefOf(r),
              }))}
            />
            <RailCard
              title="Next to start"
              items={nextToStart.map((r) => ({
                key: r.key,
                title: r.name,
                sub: r.engagement.companyName,
                right: regDateLabel(r, now).text,
                href: hrefOf(r),
              }))}
            />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
