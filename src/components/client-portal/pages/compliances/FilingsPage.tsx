'use client';

/**
 * Compliances · Filings (VCFO Spectrum FilingsScreen): "Filings by month" and "Progress by area"
 * for the whole financial year (every column and bar drills down), then the T1 grid with every
 * filter in its head bar (R-08): the two-month window with Full year, the frequency switch with
 * counts, the Area and Status filter chips, the FY stepper, Export (CSV) and the calendar link.
 * A row opens the side panel at the right edge (F-10); that row keeps a soft blurple fill.
 *
 * URL state: ?fy= · ?cadence=all|monthly|quarterly|annual · ?area= · ?status=
 * all|over|due|up|ok · ?period=YYYY-MM (window end month) · ?view=year · ?filing=<id>
 * · ?cat=statutory|non-statutory (All when absent).
 *
 * F-1 to F-3 (COMPLIANCE-MODEL.md 4.5): the All · Statutory · Non-statutory switch in the head
 * bar. Non-statutory rows are the completed tasks SBC shared with the client
 * (GET /api/compliances/tasks), with their deliverable file; a row opens the task page. The
 * counts, "Filings by month" and "Progress by area" (a "Tasks" bar) follow the switch. An area
 * pick hides the tasks, which have no regulator; Export stays the statutory register.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Term } from '@/components/ui/term';
import { SkeletonRows } from '@/components/ui/empty-state';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { AssistChip } from '@/components/compliances/AssistParts';
import { useAssistRuns } from '@/components/compliances/use-compliance-records';
import { latestBySubject } from '@/lib/assist-runs/runs';
import { usePortal } from '../../PortalProvider';
import { portalHref } from '../../routes';
import {
  AREAS,
  AREA_LABEL,
  AREA_ORDER,
  MON,
  filterArea,
  fyLabelOf,
  fyMonths,
  fyStartOfMonth,
  sortByDue,
  statusOf,
  stepMonth,
  todayIso,
  type AreaCode,
  type AreaFilter,
  type CompStatus,
  type PortalFiling,
} from '@/lib/client-portal/compliances';
import { fetchProofs, proofHref, useCompFilings, useDownload } from './api';
import { usePageTips } from './bits';
import { CompProvider, useComp } from './ctx';
import { MonthChart } from './MonthChart';
import { SidePanel } from './Detail';
import { DateTile, Empty, FILL, FilterMenu, Island, SCard, STATUS_ORDER, StatusChip, WORD } from './spectrum';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { FiledCell, ProofCell } from './cells';
import { CategoryTabs, RowArea, RowPortalLink } from './task-marks';
import { taskHref, useClientTasks } from './task-api';
import { doneTaskRows, fyOfIso, isTaskRow, showStat, showTasks, type Category } from './tasks';
import '../../css/compliances-board.css';

const CADENCES = ['all', 'monthly', 'quarterly', 'annual'] as const;
type Cadence = (typeof CADENCES)[number];
const CAD_FREQ: Record<Exclude<Cadence, 'all'>, string[]> = { monthly: ['monthly'], quarterly: ['quarterly', 'half-yearly'], annual: ['annual', 'one-time'] };
/** A task has no filing cadence: it shows under All only. */
const inCadence = (r: PortalFiling, c: Cadence) => c === 'all' || (!isTaskRow(r) && CAD_FREQ[c].includes(r.frequency.toLowerCase()));
const STATUS_KEYS: ('all' | CompStatus)[] = ['all', 'over', 'due', 'up', 'ok'];

function useFilingsState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = todayIso();
  const nowKey = today.slice(0, 7);
  const curFy = fyStartOfMonth(nowKey);
  const fyP = Number.parseInt(params.get('fy') ?? '', 10);
  const fy = Number.isInteger(fyP) && fyP >= 2000 && fyP <= curFy + 2 ? fyP : curFy;
  const cadP = params.get('cadence');
  const cadence: Cadence = (CADENCES as readonly string[]).includes(cadP ?? '') ? (cadP as Cadence) : 'all';
  const areaP = (params.get('area') ?? 'all').toUpperCase();
  const area: AreaFilter = areaP === 'ALL' ? 'all' : AREAS.some((a) => a.id === areaP) ? (areaP as AreaFilter) : 'all';
  const stP = params.get('status');
  const status = (STATUS_KEYS.includes(stP as 'all' | CompStatus) ? stP : 'all') as 'all' | CompStatus;
  const months = fyMonths(fy);
  const perP = params.get('period');
  // window end month: ?period, else today's month (inside the FY), else the FY's first month + 1
  const end = perP && months.includes(perP) && months.indexOf(perP) > 0 ? perP : months.includes(nowKey) && months.indexOf(nowKey) > 0 ? nowKey : months[1]!;
  const fullYear = params.get('view') === 'year';
  const filing = params.get('filing') ?? params.get('open');
  const catP = params.get('cat');
  const cat: Category = catP === 'statutory' || catP === 'non-statutory' ? catP : 'all';
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'filing') next.delete('open');
        if (v == null || v === '' || (k === 'area' && v === 'all') || (k === 'status' && v === 'all') || (k === 'cat' && v === 'all')) next.delete(k);
        else next.set(k, k === 'area' ? v.toLowerCase() : v);
      }
      const q = next.toString();
      router.replace(`${pathname}${q ? `?${q}` : ''}`, { scroll: false });
    },
    [params, router, pathname],
  );
  return { today, nowKey, curFy, fy, cadence, area, status, end, months, fullYear, filing, cat, set };
}

export function CompliancesFilings() {
  const st = useFilingsState();
  const tableRef = useRef<HTMLDivElement>(null);
  return (
    <div className="cp-compliances">
      <CompProvider
        today={st.today}
        onDrillRow={(f) => st.set({ filing: f.id })}
        drillLink={{ text: 'Show in the list', onClick: () => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
      >
        <FilingsBody st={st} tableRef={tableRef} />
      </CompProvider>
    </div>
  );
}

function FilingsBody({ st, tableRef }: { st: ReturnType<typeof useFilingsState>; tableRef: React.RefObject<HTMLDivElement | null> }) {
  const { after, go, toast, openChat } = usePortal();
  const { today, openProof, openDrill } = useComp();
  const download = useDownload();
  const root = useRef<HTMLDivElement>(null);
  usePageTips(root);
  const { fy, area, status, end, months, fullYear, cat, set } = st;
  const q = useCompFilings(fy, after);
  const tq = useClientTasks(after);
  const statAll = useMemo(() => (after ? q.data?.rows ?? [] : []), [after, q.data]);
  // F-2: the completed tasks of this financial year, by their end date.
  const taskAll = useMemo(() => doneTaskRows(tq.data ?? []).filter((r) => fyOfIso(r.dueDate) === fy), [tq.data, fy]);
  const all = useMemo(
    () => [...(showStat(cat) ? statAll : []), ...(showTasks(cat) && area === 'all' ? taskAll : [])],
    [cat, area, statAll, taskAll],
  );
  const start = stepMonth(end, -1);
  // no ?cadence opens on All, so the page never opens on an empty frequency (CP-05)
  const cadence = st.cadence;
  const winLabel = fullYear
    ? fyLabelOf(fy)
    : start.slice(0, 4) === end.slice(0, 4)
      ? `${MON[Number(start.slice(5)) - 1]} to ${MON[Number(end.slice(5)) - 1]} ${end.slice(0, 4)}`
      : `${MON[Number(start.slice(5)) - 1]} ${start.slice(0, 4)} to ${MON[Number(end.slice(5)) - 1]} ${end.slice(0, 4)}`;

  const inWindow = useMemo(
    () => (fullYear ? all : all.filter((r) => r.dueDate >= `${start}-01` && r.dueDate <= `${end}-31`)),
    [all, fullYear, start, end],
  );
  const inView = useMemo(() => inWindow.filter((r) => inCadence(r, cadence)), [inWindow, cadence]);
  const table = useMemo(
    () => sortByDue(filterArea(inView, area).filter((r) => status === 'all' || statusOf(r, today) === status)),
    [inView, area, status, today],
  );
  const detail = st.filing ? statAll.find((r) => r.id === st.filing) ?? null : null;
  // deep link to a filing outside the FY in view (?filing= / ?open=): look it up and jump to its FY
  const missing = Boolean(st.filing) && after && q.isSuccess && !detail;
  const lookup = useQuery({
    queryKey: ['client-compliances', 'one', st.filing],
    enabled: missing,
    queryFn: async () => {
      const res = await fetch(`/api/client/compliances?id=${encodeURIComponent(st.filing!)}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return ((await res.json()) as { rows: PortalFiling[] }).rows[0] ?? null;
    },
  });
  useEffect(() => {
    if (!missing || lookup.isLoading) return;
    const f = lookup.data;
    if (f) {
      const ffy = fyStartOfMonth(f.dueDate.slice(0, 7));
      if (ffy !== fy) set({ fy: String(ffy), period: null, filing: f.id });
    } else if (lookup.isFetched) {
      set({ filing: null });
      toast('That filing is not in your register');
    }
  }, [missing, lookup.isLoading, lookup.data, lookup.isFetched, fy, set, toast]);
  const onDrill = (title: string, list: PortalFiling[]) => openDrill({ kind: 'status', k: 'all', title, rows: list });

  const exportHref = `/api/client/compliances/export?fy=${fy}&cadence=${cadence}&area=${area}&status=${status}`;
  const canPrev = !fullYear && months.indexOf(start) > 0;
  const canNext = !fullYear && months.indexOf(end) < 11;
  const calHref = `${portalHref('compliances')}${fullYear ? '' : `?date=${end}`}`;

  const downloadPrimary = (f: PortalFiling) => {
    if (isTaskRow(f)) return openProof(f);
    fetchProofs(f.id)
      .then((p) => {
        if (!p.length) return toast('Proof pending · SBC will upload it');
        download(proofHref(f.id, p[0]!.id));
        toast(`Download started · ${p[0]!.fileName}`);
      })
      .catch(() => toast('Could not download the proof'));
  };
  const open = (f: PortalFiling) => (isTaskRow(f) ? go(taskHref(f.task.id, f.task.boardMeetingId)) : set({ filing: f.id }));
  const inWin = (r: PortalFiling) => fullYear || (r.dueDate >= `${start}-01` && r.dueDate <= `${end}-31`);
  const statusWord = status === 'all' ? '' : WORD[status].toLowerCase();

  // C-363: the VCFO Assist state per filing, from the stored runs of the client's engagement.
  const assist = useAssistRuns({ kind: 'filing', enabled: after });
  const assistBy = useMemo(() => latestBySubject(assist.data?.runs ?? []), [assist.data]);
  const assistSetUp = assist.data?.setUp ?? true;

  const columns: EFilingColumn<PortalFiling>[] = [
    { key: 'due', header: 'Due', width: '56px', render: (r) => <DateTile iso={r.dueDate} s={statusOf(r, today)} size="sm" /> },
    { key: 'area', header: 'Area', width: '124px', render: (r) => <RowArea r={r} /> },
    {
      key: 'name',
      header: 'Filing',
      width: '30%',
      render: (r) => (
        <span className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="min-w-0 text-left"
            aria-label={`${r.name} · ${r.period} · open the details`}
            onClick={(e) => {
              e.stopPropagation();
              open(r);
            }}
          >
            <span className="block truncate font-medium leading-tight text-ink">{isTaskRow(r) ? r.name : <Term>{r.name}</Term>}</span>
            <span className="block truncate text-[12.5px] leading-tight text-ink-muted">{isTaskRow(r) ? r.task.deliverable?.fileName ?? r.period : r.period}</span>
          </button>
          <RowPortalLink r={r} />
        </span>
      ),
    },
    { key: 'freq', header: 'Frequency', width: '112px', render: (r) => <span className="text-ink-muted">{r.freqLabel}</span> },
    { key: 'filed', header: 'Filed on', width: '120px', render: (r) => <FiledCell r={r} today={today} /> },
    { key: 'status', header: 'Status', width: '124px', render: (r) => <StatusChip s={statusOf(r, today)} /> },
    {
      key: 'ref',
      header: 'Reference',
      width: '190px',
      render: (r) => (r.acknowledgementNo ? <span className="whitespace-nowrap font-mono text-[12.5px]">{r.acknowledgementNo}</span> : <span className="text-ink-faint">-</span>),
    },
    { key: 'assist', header: 'VCFO Assist', width: '140px', render: (r) => (assist.isLoading || isTaskRow(r) ? <span className="text-ink-faint">-</span> : <AssistChip run={assistBy.get(r.id)} setUp={assistSetUp} />) },
    { key: 'proof', header: 'Proof', width: '136px', align: 'right', render: (r) => <ProofCell r={r} onProof={openProof} onDownload={downloadPrimary} /> },
  ];

  const headBar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-2.5 md:px-5">
      <CardHeadTile title="Filings" />
      <h2 className="text-[15px] font-medium text-ink">Filings</h2>
      {after && all.length ? <span className="hidden text-[13px] tabular-nums text-ink-muted sm:inline">{table.length}</span> : null}
      {after ? (
        <CategoryTabs
          allFirst
          value={cat}
          onChange={(c) => set({ cat: c, area: c === 'non-statutory' ? 'all' : area })}
          stat={statAll.filter(inWin).length}
          ns={taskAll.filter(inWin).length}
        />
      ) : null}
      <span className="inline-flex h-[30px] items-center overflow-hidden rounded-md border-1.5 border-line-strong bg-surface-raised">
        <button type="button" className="grid h-7 w-7 place-items-center text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-40" aria-label="Earlier months" disabled={!canPrev} onClick={() => set({ period: stepMonth(end, -1) })}>
          <ChevronLeft size={15} strokeWidth={1.6} aria-hidden />
        </button>
        <b className="whitespace-nowrap px-1 text-center text-[13px] font-medium text-ink" aria-live="polite">
          {winLabel}
        </b>
        <button type="button" className="grid h-7 w-7 place-items-center text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-40" aria-label="Later months" disabled={!canNext} onClick={() => set({ period: stepMonth(end, 1) })}>
          <ChevronRight size={15} strokeWidth={1.6} aria-hidden />
        </button>
        <button
          type="button"
          aria-pressed={fullYear}
          onClick={() => set({ view: fullYear ? null : 'year' })}
          className={cn('h-full whitespace-nowrap border-l-1.5 border-line-strong px-2.5 text-[13px] font-medium', fullYear ? 'bg-brand-soft text-brand-text' : 'text-ink-2 hover:bg-surface-sunken')}
        >
          Full year
        </button>
      </span>
      <SpectrumTabs
        label="Frequency"
        value={cadence}
        onChange={(k) => set({ cadence: k === 'all' ? null : k })}
        items={CADENCES.map((c) => ({ key: c, label: c[0]!.toUpperCase() + c.slice(1), count: inWindow.filter((r) => inCadence(r, c)).length }))}
      />
      {cat === 'non-statutory' ? null : (
        <FilterMenu
          label="Area"
          value={area === 'all' ? null : area}
          onChange={(v) => set({ area: v ?? 'all' })}
          options={AREAS.filter((a) => a.id !== 'all').map((a) => ({ value: a.id as AreaCode, label: a.label, count: inView.filter((r) => !isTaskRow(r) && r.area === a.id).length }))}
        />
      )}
      <FilterMenu
        label="Status"
        value={status === 'all' ? null : status}
        onChange={(v) => set({ status: v ?? 'all' })}
        options={STATUS_ORDER.map((s) => ({ value: s, label: WORD[s], count: filterArea(inView, area).filter((r) => statusOf(r, today) === s).length }))}
      />
      {area !== 'all' || status !== 'all' ? (
        <button type="button" className="text-[13px] font-medium text-brand-text hover:underline" onClick={() => set({ area: 'all', status: 'all' })}>
          Clear filters
        </button>
      ) : null}
      <span className="ml-auto flex items-center gap-2">
        <span className="inline-flex h-[30px] items-center overflow-hidden rounded-md border-1.5 border-line-strong bg-surface-raised">
          <button type="button" className="grid h-7 w-7 place-items-center text-ink-muted hover:bg-surface-sunken hover:text-ink" aria-label="Previous financial year" onClick={() => set({ fy: String(fy - 1), period: null, filing: null })}>
            <ChevronLeft size={15} strokeWidth={1.6} aria-hidden />
          </button>
          <b className="min-w-[84px] text-center text-[13px] font-medium tabular-nums text-ink">{fyLabelOf(fy)}</b>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-40"
            aria-label="Next financial year"
            disabled={fy >= st.curFy + 2}
            onClick={() => set({ fy: String(fy + 1), period: null, filing: null })}
          >
            <ChevronRight size={15} strokeWidth={1.6} aria-hidden />
          </button>
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-[30px] min-w-0 px-0"
          disabled={!after}
          aria-label={`Export ${fyLabelOf(fy)} filings (CSV)`}
          title="Export"
          onClick={() => {
            download(exportHref);
            toast(`Download started · ${fyLabelOf(fy)} filings (CSV)`);
          }}
        >
          <Download size={16} strokeWidth={1.6} aria-hidden />
        </Button>
        <Button type="button" size="sm" variant="secondary" className="w-[30px] min-w-0 px-0" aria-label="Open the calendar" title="Calendar" onClick={() => go(calHref)}>
          <CalendarDays size={16} strokeWidth={1.6} aria-hidden />
        </Button>
      </span>
    </div>
  );

  const body = !after ? (
    <Empty>Starts after incorporation</Empty>
  ) : q.isError ? (
    <Empty action={<Button size="sm" variant="secondary" onClick={() => void q.refetch()}>Try again</Button>}>Could not load the register</Empty>
  ) : q.isLoading ? (
    <div className="px-4 py-4 md:px-5" aria-busy="true" aria-label="Loading filings">
      <SkeletonRows rows={5} />
    </div>
  ) : !all.length ? (
    <Empty>{cat === 'non-statutory' ? `No completed tasks in ${fyLabelOf(fy)}` : `No filings for ${fyLabelOf(fy)}`}</Empty>
  ) : (
    <div className="px-2 pb-3 pt-1 md:px-3">
      <EFilingGrid
        caption={`Filings · ${winLabel}`}
        columns={columns}
        rows={table}
        rowKey={(r) => r.id}
        onRowClick={open}
        pageSize={10}
        minWidth={900}
        stickyFirstColumn
        rowClassName={(r) =>
          cn(
            r.id === st.filing && 'bg-brand-soft',
            (statusOf(r, today) === 'over' || (r.filedOn && r.filedOn > r.dueDate)) && 'text-danger',
          ) || undefined
        }
        empty={
          <span className="inline-flex flex-wrap items-center justify-center gap-3">
            {status === 'over' ? 'Nothing overdue' : `No ${statusWord ? `${statusWord} ` : ''}filings in ${winLabel}`}
            {status !== 'over' ? (
              <button type="button" className="text-[13px] font-medium text-brand-text hover:underline" onClick={() => openChat(`Why are there no ${statusWord ? `${statusWord} ` : ''}filings in ${winLabel}?`)}>
                Ask VCFO why
              </button>
            ) : null}
          </span>
        }
      />
    </div>
  );

  return (
    <div className="cp-comp-root page" ref={root}>
      <Island className="grid gap-5">
        {after && all.length ? (
          <div className="grid gap-5 md:grid-cols-2">
            <MonthChart rows={all} fy={fy} today={today} onDrill={onDrill} />
            <AreaCard rows={all} onDrill={onDrill} />
          </div>
        ) : null}
        <section ref={tableRef} className="min-w-0 overflow-visible rounded-md border-1.5 border-line bg-surface-raised">
          {headBar}
          {body}
        </section>
      </Island>
      {detail ? <SidePanel f={detail} onClose={() => set({ filing: null })} /> : null}
    </div>
  );
}

/**
 * Progress by area (prototype AreaCard, R-25): one 6px stacked bar per area for the whole financial
 * year, "GST · 3 of 5 filed" over it and a legend row per status with its count. A bar opens the
 * drill-down with that area's filings on the status tabs.
 */
function AreaCard({ rows, onDrill }: { rows: PortalFiling[]; onDrill: (title: string, list: PortalFiling[]) => void }) {
  const { today } = useComp();
  const stat = rows.filter((r) => !isTaskRow(r));
  const tasks = rows.filter(isTaskRow);
  const areas: Array<AreaCode | 'TASK'> = [...AREA_ORDER.filter((a) => stat.some((r) => r.area === a)), ...(tasks.length ? (['TASK'] as const) : [])];
  return (
    <SCard title="Progress by area">
      <ul className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        {areas.map((a) => {
          const rs = a === 'TASK' ? tasks : stat.filter((r) => r.area === a);
          const filed = rs.filter((r) => r.filedOn).length;
          const L = a === 'TASK' ? 'Tasks' : AREA_LABEL[a];
          const parts = STATUS_ORDER.map((s) => ({ s, n: rs.filter((r) => statusOf(r, today) === s).length })).filter((p) => p.n > 0);
          return (
            <li key={a}>
              <button
                type="button"
                onClick={() => onDrill(`${L} filings`, rs)}
                aria-label={`${L}: ${filed} of ${rs.length} filed. Show the rows`}
                className="-m-1.5 grid w-[calc(100%+12px)] gap-2 rounded-md p-1.5 text-left hover:bg-surface-sunken"
              >
                <span className="text-[13px] text-ink-muted">
                  {L} · {filed} of {rs.length} filed
                </span>
                <span className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-bar" aria-hidden>
                  {parts.map((p) => (
                    <i key={p.s} className={cn('block h-full rounded-[2px]', FILL[p.s])} style={{ width: `${(p.n / Math.max(1, rs.length)) * 100}%` }} />
                  ))}
                </span>
                <span className="grid gap-1">
                  {parts.map((p) => (
                    <span key={p.s} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                      <i className={cn('h-2 w-2 flex-none rounded-[2px]', FILL[p.s])} aria-hidden />
                      <span className="flex-1">{WORD[p.s]}</span>
                      <span className="tabular-nums text-ink-muted">{p.n}</span>
                    </span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </SCard>
  );
}
