'use client';

/**
 * Compliances · Obligations (VCFO Spectrum ObligationsScreen, owner decision D-06): the
 * client's register grouped by filing. Each row is one obligation: a date tile (the next due
 * date, or the last filed date), the name, the area pill, "n of m filed" for the current FY
 * and the status. The right rail keeps three cards: Due in the next 15 days, Waiting on
 * client, Progress flow. Data: GET /api/client/compliances (every year, client-compliances
 * repository), the same rows the Calendar and Filings pages read.
 *
 * K-1, K-2 (COMPLIANCE-MODEL.md 4.6): after the certificate a Statutory / Non-statutory / All
 * switch sits under the card head. Non-statutory lists the tasks SBC shares with the client
 * (visibility "client" or "both", from GET /api/client/compliances/tasks) grouped by end week;
 * the rail follows the switch. There is no New task button and no reviewer on this page.
 */
import { useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip as SChip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { SkeletonRows } from '@/components/ui/empty-state';
import { usePortal } from '../../PortalProvider';
import { portalHref } from '../../routes';
import {
  AREA_LABEL,
  AREA_ORDER,
  daysBetween,
  fmtDM,
  fyLabelOf,
  fyStartOfMonth,
  slugOf,
  todayIso,
  type CompStatus,
  type PortalFiling,
} from '@/lib/client-portal/compliances';
import { DUE_SOON_DAYS } from '@/lib/compliance/filings';
import { useAllFilings } from './api';
import { usePageTips } from './bits';
import { CompProvider } from './ctx';
import { FREQ_ORDER, freqKey, groupCompanyObligations, periodsDueSoon, periodsWaitingOnClient, type Obligation } from '@/lib/compliance/obligation-groups';
import { useComplianceStarts, type StartedObligation } from '@/components/compliances/use-compliance-records';
import {
  AreaTag,
  DateTile,
  Empty,
  FILL,
  GoLink,
  GroupHead,
  HeadSearch,
  Island,
  ListRow,
  SCard,
  STATUS_ORDER,
  StackedBar,
  StatusChip,
  WORD,
  relativeDue,
  urgencyTint,
  DueWords,
} from './spectrum';
import { buttonVariants } from '@/components/ui/button-variants';
import { CategoryTabs } from './task-marks';
import { TaskList } from './TaskList';
import { taskHref, useClientTasks } from './task-api';
import { STATUS_WORDS, showStat, showTasks, taskWord, type Category, type ClientTask } from './tasks';
import '../../css/compliances-board.css';

export const OBLIGATIONS_BASE = portalHref('obligations');

/** The record page of one obligation; `filing` opens that period's side panel. */
export function obligationHref(id: string, filing?: string): string {
  return `${OBLIGATIONS_BASE}/${encodeURIComponent(id)}${filing ? `?filing=${encodeURIComponent(filing)}` : ''}`;
}

const FREQ_LABEL: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-yearly',
  annual: 'Annual',
  'one-time': 'One-time',
  other: 'Other',
};

export function CompliancesObligations() {
  const today = todayIso();
  const { go } = usePortal();
  const filingsOf = (f: PortalFiling) => `${portalHref('filings')}?fy=${fyStartOfMonth(f.dueDate.slice(0, 7))}&filing=${f.id}`;
  return (
    <div className="cp-compliances">
      <CompProvider today={today} onDrillRow={(f) => go(filingsOf(f))} drillLink={{ text: 'Open filings', onClick: () => go(portalHref('filings')) }}>
        <ObligationsBody today={today} />
      </CompProvider>
    </div>
  );
}

function ObligationsBody({ today }: { today: string }) {
  const { after, shell, go } = usePortal();
  const root = useRef<HTMLDivElement>(null);
  usePageTips(root);
  const q = useAllFilings(after);
  const obligations = useMemo(() => groupCompanyObligations(after ? q.data?.rows ?? [] : [], today), [after, q.data, today]);
  const [view, setView] = useState<'freq' | 'area'>('freq');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CompStatus | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const companyShort = shell?.companyShort || 'Your company';
  // C-395: before the certificate, the obligations to come (static library, legal form, questionnaire).
  const starts = useComplianceStarts(undefined, !after);
  const [catPicked, setCat] = useState<Category>('statutory');
  const cat: Category = after ? catPicked : 'statutory';
  const tq = useClientTasks(after);
  const tasks = useMemo(() => (after ? tq.data ?? [] : []), [after, tq.data]);
  const hasStat = showStat(cat);
  const hasNs = showTasks(cat);

  const needle = search.trim().toLowerCase();
  const shown = obligations.filter(
    (o) => (!status || o.status === status) && (!needle || `${o.name} ${AREA_LABEL[o.area]} ${o.authorityName}`.toLowerCase().includes(needle)),
  );
  const sections =
    view === 'freq'
      ? [...FREQ_ORDER, 'other'].map((k) => ({ id: k, label: FREQ_LABEL[k]!, rows: shown.filter((o) => freqKey(o) === k) }))
      : AREA_ORDER.map((a) => ({ id: a, label: AREA_LABEL[a], rows: shown.filter((o) => o.area === a) }));
  const groups = sections.filter((s) => s.rows.length);
  const fy = fyLabelOf(fyStartOfMonth(today.slice(0, 7)));

  const due = hasStat ? periodsDueSoon(obligations, today) : [];
  const waiting = hasStat ? periodsWaitingOnClient(obligations, today, companyShort) : [];
  const openTasks = hasNs ? tasks.filter((t) => t.stage !== 'completed') : [];
  const dueTasks = openTasks.filter((t) => daysBetween(today, t.endDate) <= DUE_SOON_DAYS).sort((a, b) => a.endDate.localeCompare(b.endDate));
  const waitTasks = openTasks.filter((t) => taskWord(t, today) === 'Waiting');
  const dueAll: Array<{ date: string; node: React.ReactNode }> = [
    ...due.map(({ o, f }) => ({ date: f.dueDate, node: <DueRow key={f.id} o={o} f={f} today={today} /> })),
    ...dueTasks.map((t) => ({ date: t.endDate, node: <TaskDueRow key={t.id} t={t} today={today} /> })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const count = (s: CompStatus) => obligations.filter((o) => o.status === s).length;

  const head = (
    <span className="flex flex-wrap items-center gap-2">
      <HeadSearch value={search} onChange={setSearch} label="Search obligations" onEnter={() => shown[0] && go(obligationHref(shown[0].id))} />
      <SpectrumTabs
        label="Group obligations"
        value={view}
        onChange={(k) => setView(k as 'freq' | 'area')}
        items={[
          { key: 'freq', label: 'By frequency' },
          { key: 'area', label: 'By law' },
        ]}
      />
    </span>
  );

  const before = (starts.data?.upcoming ?? []).filter((o) => !needle || `${o.name} ${AREA_LABEL[o.area]} ${o.authorityName}`.toLowerCase().includes(needle));
  const beforeGroups = (
    view === 'freq'
      ? [...FREQ_ORDER, 'other'].map((k) => ({ id: k, label: FREQ_LABEL[k]!, rows: before.filter((o) => freqKey(o) === k) }))
      : AREA_ORDER.map((a) => ({ id: a, label: AREA_LABEL[a], rows: before.filter((o) => o.area === a) }))
  ).filter((g) => g.rows.length);

  const list = !after ? (
    starts.isLoading ? (
      <div className="px-4 py-4 md:px-5" aria-busy="true" aria-label="Loading obligations">
        <SkeletonRows rows={5} />
      </div>
    ) : starts.isError ? (
      <Empty action={<Button size="sm" variant="secondary" onClick={() => void starts.refetch()}>Try again</Button>}>Could not load the obligations</Empty>
    ) : !beforeGroups.length ? (
      <Empty>Starts after incorporation</Empty>
    ) : (
      <div>
        {beforeGroups.map((g) => {
          const open = needle ? true : !closed[g.id];
          return (
            <div key={g.id}>
              <GroupHead label={g.label} count={g.rows.length} open={Boolean(open)} onToggle={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))} />
              {open ? (
                <ul className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 md:px-5 2xl:grid-cols-3">
                  {g.rows.map((o) => (
                    <li key={o.id} className="min-w-0">
                      <BeforeTile o={o} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    )
  ) : q.isError ? (
    <Empty action={<Button size="sm" variant="secondary" onClick={() => void q.refetch()}>Try again</Button>}>Could not load the register</Empty>
  ) : q.isLoading ? (
    <div className="px-4 py-4 md:px-5" aria-busy="true" aria-label="Loading obligations">
      <SkeletonRows rows={5} />
    </div>
  ) : !obligations.length ? (
    <Empty>No obligations on the register yet</Empty>
  ) : !groups.length ? (
    <Empty
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setSearch('');
            setStatus(null);
          }}
        >
          Clear
        </Button>
      }
    >
      None
    </Empty>
  ) : (
    <div>
      {status ? (
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2 md:px-5">
          <span className="inline-flex h-[30px] items-center gap-1.5 rounded-md border-1.5 border-brand-line bg-brand-soft pl-2.5 pr-1 text-[13px] font-medium text-brand-text">
            {WORD[status]}
            <button type="button" className="grid h-5 w-5 place-items-center rounded-sm hover:bg-surface-raised" aria-label="Clear the status filter" onClick={() => setStatus(null)}>
              ×
            </button>
          </span>
        </div>
      ) : null}
      {groups.map((g) => {
        const open = needle || status ? true : !closed[g.id];
        return (
          <div key={g.id}>
            <GroupHead label={g.label} count={g.rows.length} open={Boolean(open)} onToggle={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))} />
            {open ? (
              <ul className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 md:px-5 2xl:grid-cols-3">
                {g.rows.map((o) => (
                  <li key={o.id} className="min-w-0">
                    <ObligationTile o={o} fy={fy} today={today} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const bar = after ? (
    <div className="border-b border-line-soft px-4 py-2.5 md:px-5">
      <CategoryTabs value={cat} onChange={setCat} stat={obligations.length} ns={tasks.length} />
    </div>
  ) : null;
  const taskBody = tq.isError ? (
    <Empty action={<Button size="sm" variant="secondary" onClick={() => void tq.refetch()}>Try again</Button>}>Could not load the tasks</Empty>
  ) : tq.isLoading ? (
    <div className="px-4 py-4 md:px-5" aria-busy="true" aria-label="Loading tasks">
      <SkeletonRows rows={4} />
    </div>
  ) : !tasks.length ? (
    <Empty>No tasks shared with you</Empty>
  ) : (
    <TaskList tasks={tasks} today={today} />
  );

  return (
    <div className="cp-comp-root page" ref={root}>
      <Island className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-5">
          {hasStat ? (
            <SCard title="Obligations" meta={after ? (obligations.length ? shown.length : undefined) : before.length || undefined} right={head} flush>
              {bar}
              {list}
            </SCard>
          ) : (
            <SCard title="Obligations" meta={tasks.length || undefined} flush>
              {bar}
              {taskBody}
            </SCard>
          )}
          {cat === 'all' ? (
            <SCard title="Non-statutory tasks" meta={tasks.length || undefined} flush>
              {taskBody}
            </SCard>
          ) : null}
        </div>
        <div className="grid min-w-0 gap-5">
          <SCard title="Due in the next 15 days" flush>
            {!after ? (
              <Empty>After the certificate</Empty>
            ) : q.isLoading ? (
              <div className="p-4">
                <SkeletonRows rows={2} />
              </div>
            ) : dueAll.length ? (
              dueAll.slice(0, 8).map((d) => d.node)
            ) : (
              <Empty />
            )}
          </SCard>
          <SCard title="Waiting on client" meta={after ? waiting.length + waitTasks.length : undefined} flush>
            {waiting.length + waitTasks.length ? (
              [...waiting.slice(0, 8).map(({ o, f, step }) => (
                <ListRow key={f.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-muted">
                      {step} · {f.period}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => go(obligationHref(o.id, f.id))}>
                    {/approve/i.test(step) ? 'Approve' : 'Upload'}
                  </Button>
                </ListRow>
              )),
              ...waitTasks.slice(0, 8).map((t) => (
                <ListRow key={t.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-muted">Inputs for SBC · ends {fmtDM(t.endDate)}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => go(taskHref(t.id, t.boardMeetingId))}>
                    Upload
                  </Button>
                </ListRow>
              ))]
            ) : (
              <Empty />
            )}
          </SCard>
          <SCard title="Progress flow">
            {hasStat ? (
              <>
                {hasNs ? <h3 className="mb-2 text-[13px] font-medium text-ink-muted">Statutory</h3> : null}
                <StackedBar
                  onPick={(k) => setStatus((cur) => (cur === k ? null : (k as CompStatus)))}
                  segments={STATUS_ORDER.map((s) => ({ key: s, label: WORD[s], value: after ? count(s) : 0, fill: FILL[s] }))}
                />
              </>
            ) : null}
            {hasNs ? (
              <>
                {hasStat ? <h3 className="mb-2 mt-4 text-[13px] font-medium text-ink-muted">Tasks</h3> : null}
                <StackedBar segments={STATUS_WORDS.map((w) => ({ key: w, label: w, value: tasks.filter((t) => taskWord(t, today) === w).length, fill: WORD_FILL[w] }))} />
              </>
            ) : null}
          </SCard>
        </div>
      </Island>
    </div>
  );
}

/**
 * One obligation as a tile (prototype ObligationsScreen): a 1.5px card, the name with a chevron, the
 * area pill and the status chip, then "Due 20 Oct" (red when late) or "Filed 18 Oct" and the count
 * filed this financial year.
 */
function ObligationTile({ o, fy, today }: { o: Obligation; fy: string; today: string }) {
  const late = Boolean(o.next) && o.next!.dueDate < today;
  return (
    <GoLink
      href={obligationHref(o.id)}
      label={`${o.name} · ${WORD[o.status]} · ${o.filed} of ${o.total} filed`}
      className="grid h-full min-w-0 gap-2 rounded-md border-1.5 border-line bg-surface-raised px-3.5 py-3 text-ink hover:border-line-strong hover:bg-surface-sunken"
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{o.name}</span>
        <ChevronRight size={16} strokeWidth={1.6} className="flex-none text-ink-faint" aria-hidden />
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <AreaTag a={o.area} />
        <StatusChip s={o.status} />
      </span>
      <span className="truncate text-[12.5px] text-ink-muted">
        {o.next ? (
          <span className={late ? 'font-medium text-danger' : undefined}>Due {fmtDM(o.next.dueDate)}</span>
        ) : o.last?.filedOn ? (
          `Filed ${fmtDM(o.last.filedOn)}`
        ) : (
          '-'
        )}
        <span title={fy}>
          {' · '}
          {o.filed} of {o.total} filed
        </span>
      </span>
    </GoLink>
  );
}

/** The six task words as bar fills (R-13 tones). */
const WORD_FILL: Record<string, string> = {
  Overdue: 'bg-danger-mid',
  'Due soon': 'bg-warning-mid',
  Waiting: 'bg-waiting-mid',
  'In progress': 'bg-brand',
  'Not started': 'bg-upcoming-mid',
  Done: 'bg-positive-mid',
};

/** A task in "Due in the next 15 days": the end-date tile, the name, "Task" and the relative chip. */
function TaskDueRow({ t, today }: { t: ClientTask; today: string }) {
  const rel = relativeDue(today, t.endDate);
  const late = rel.tone === 'bad';
  return (
    <GoLink
      href={taskHref(t.id, t.boardMeetingId)}
      label={`${t.name} · ${rel.label}`}
      className={`flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-2.5 text-[14px] text-ink first:border-t-0 hover:bg-surface-sunken md:px-5${late ? ' bg-danger-soft' : ''}`}
    >
      <DateTile iso={t.endDate} s={urgencyTint(today, t.endDate)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{t.name}</span>
        <span className="block truncate text-[12.5px] text-ink-muted">
          <DueWords today={today} due={t.endDate} /> · Task
        </span>
      </span>
      {late ? <span className={buttonVariants({ variant: 'strong', size: 'sm', className: 'h-7 px-2 text-[12px]' })}>Open</span> : null}
      <SChip tone={rel.tone} fixed>
        {rel.label}
      </SChip>
    </GoLink>
  );
}

function DueRow({ o, f, today }: { o: Obligation; f: PortalFiling; today: string }) {
  const rel = relativeDue(today, f.dueDate);
  const late = rel.tone === 'bad';
  const tint = urgencyTint(today, f.dueDate);
  return (
    <GoLink
      href={obligationHref(o.id, f.id)}
      label={`${o.name} · ${f.period} · ${rel.label}`}
      className={`flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-2.5 text-[14px] text-ink first:border-t-0 hover:bg-surface-sunken md:px-5${late ? ' bg-danger-soft' : ''}`}
    >
      <DateTile iso={f.dueDate} s={tint} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">
          {o.name} · {f.period}
        </span>
        <span className="block truncate text-[12.5px] text-ink-muted">
          <DueWords today={today} due={f.dueDate} /> · {AREA_LABEL[o.area]}
        </span>
      </span>
      {late ? <span className={buttonVariants({ variant: 'strong', size: 'sm', className: 'h-7 px-2 text-[12px]' })}>Fix</span> : null}
      <SChip tone={rel.tone} fixed>
        {rel.label}
      </SChip>
    </GoLink>
  );
}

/**
 * One obligation to come, before the certificate (C-395): the same tile, dated "After the
 * certificate", with the registration that starts it when one does.
 */
function BeforeTile({ o }: { o: StartedObligation }) {
  return (
    <GoLink
      href={obligationHref(slugOf(o.particular))}
      label={`${o.name} · after the certificate`}
      className="grid h-full min-w-0 gap-2 rounded-md border-1.5 border-line bg-surface-raised px-3.5 py-3 text-ink hover:border-line-strong hover:bg-surface-sunken"
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{o.name}</span>
        <ChevronRight size={16} strokeWidth={1.6} className="flex-none text-ink-faint" aria-hidden />
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <AreaTag a={o.area} />
        <StatusChip s="up" />
      </span>
      <span className="truncate text-[12.5px] text-ink-muted">
        After the certificate
        {o.startedBy ? ` · after ${o.startedBy.name}` : ''}
      </span>
    </GoLink>
  );
}
