'use client';

/**
 * Compliances · Calendar — prototype s/comp/index.html #cal-redesign (desktop /
 * tablet) with cal-views.js (Month · Year · Timeline, month/year picker) and
 * #cal-mobile under 700 px (CalendarMobile). Real data: /api/client/compliances.
 *
 * URL state: ?date=YYYY-MM · ?view=month|year|timeline · ?area=all|mca|gst|it|pay|fema
 * · ?filing=<id> (the detail pop-up) · ?cat=statutory|non-statutory (C-1; All when absent).
 *
 * C-1 to C-4 (COMPLIANCE-MODEL.md 4.4): the All · Statutory · Non-statutory switch with counts.
 * Statutory events keep their solid stripe; the tasks SBC shares with the client
 * (GET /api/compliances/tasks) show on their end date with a hollow square, and their hover gives
 * the start date and the urgency. The switch applies to the month, year and timeline views and
 * to the rail. Tasks have no area, so an area pick hides them.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePortal } from '../../PortalProvider';
import { InfoPopover } from '../../shared';
import { portalHref } from '../../routes';
import {
  AREAS,
  AREA_LABEL,
  MONTHS,
  byDate,
  comingUp,
  daysBetween,
  tileSub,
  filterArea,
  fmtDM,
  fmtLong,
  fmtLongComma,
  fmtWDM,
  fyLabelOf,
  fyMonths,
  fyStartOfMonth,
  mondayMonthGrid,
  monthLabel,
  nextDeadline,
  overdueRows,
  plural,
  portalFor,
  sortByDue,
  statusOf,
  stepMonth,
  todayIso,
  worstStatus,
  type AreaFilter,
  type PortalFiling,
} from '@/lib/client-portal/compliances';
import { ArrowRight, ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip as SChip } from '@/components/ui/spectrum-chip';
import { SkeletonRows } from '@/components/ui/empty-state';
import { useCompFilings } from './api';
import { ProofChip, Seg, usePageTips } from './bits';
import { Empty, Island, PortalLink, STROKE, StatusChip, TINT } from './spectrum';
import { CompProvider, useComp } from './ctx';
import { DetailModal } from './Detail';
import { DonutCard } from './DonutCard';
import { MonthNav } from './MonthNav';
import { TimelineView } from './TimelineView';
import { YearView } from './YearView';
import { CalendarMobile } from './CalendarMobile';
import { CategoryTabs, RowArea } from './task-marks';
import { taskHref, useTaskRows } from './task-api';
import { dayWords, fyOfIso, isTaskRow, showStat, showTasks, taskHint, taskWord, type Category } from './tasks';
import '../../css/compliances-board.css';

const VIEWS = ['month', 'year', 'timeline'] as const;
type View = (typeof VIEWS)[number];
const AREA_IDS = AREAS.map((a) => a.id);

function useNarrow(px = 700): boolean {
  const [n, setN] = useState(false);
  useEffect(() => {
    const on = () => setN(window.innerWidth < px);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [px]);
  return n;
}

export function useCalendarState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = todayIso();
  const nowKey = today.slice(0, 7);
  const dateP = params.get('date');
  const month = dateP && /^\d{4}-(0[1-9]|1[0-2])$/.test(dateP.slice(0, 7)) ? dateP.slice(0, 7) : nowKey;
  const viewP = params.get('view');
  const view: View = (VIEWS as readonly string[]).includes(viewP ?? '') ? (viewP as View) : 'month';
  const areaP = (params.get('area') ?? 'all').toUpperCase();
  const area: AreaFilter = areaP === 'ALL' ? 'all' : AREA_IDS.includes(areaP as AreaFilter) ? (areaP as AreaFilter) : 'all';
  const filing = params.get('filing') ?? params.get('open');
  const catP = params.get('cat');
  const cat: Category = catP === 'statutory' || catP === 'non-statutory' ? catP : 'all';
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'filing') next.delete('open');
        if (v == null || v === '' || (k === 'view' && v === 'month') || (k === 'area' && v === 'all') || (k === 'cat' && v === 'all') || (k === 'date' && v === nowKey)) next.delete(k);
        else next.set(k, k === 'area' ? v.toLowerCase() : v);
      }
      const q = next.toString();
      router.replace(`${pathname}${q ? `?${q}` : ''}`, { scroll: false });
    },
    [params, router, pathname, nowKey],
  );
  return { today, nowKey, month, view, area, filing, cat, set };
}


export function CompliancesCalendar() {
  const narrow = useNarrow(700);
  const st = useCalendarState();
  const { go } = usePortal();
  const openInFilings = useCallback(
    (f: PortalFiling) => go(`${portalHref('filings')}?fy=${fyStartOfMonth(f.dueDate.slice(0, 7))}&filing=${f.id}`),
    [go],
  );
  return (
    <div className="cp-compliances">
      <CompProvider
        today={st.today}
        onDrillRow={openInFilings}
        drillLink={{ text: 'Open filings', onClick: () => go(`${portalHref('filings')}?fy=${fyStartOfMonth(st.month)}`) }}
      >
        {narrow ? <CalendarMobile state={st} onOpenFilings={openInFilings} /> : <CalendarDesktop st={st} onOpenFilings={openInFilings} />}
      </CompProvider>
    </div>
  );
}

/* =================================================================== */

function CalendarDesktop({ st, onOpenFilings }: { st: ReturnType<typeof useCalendarState>; onOpenFilings: (f: PortalFiling) => void }) {
  const { after, go, toast, openChat } = usePortal();
  const { today, openDrill } = useComp();
  const { month, view, area, nowKey, cat, set } = st;
  const statOn = showStat(cat);
  const tasksOn = showTasks(cat) && area === 'all';
  const allTasks = useTaskRows(after);
  const root = useRef<HTMLDivElement>(null);
  usePageTips(root);

  const fy = fyStartOfMonth(month);
  const todayFy = fyStartOfMonth(nowKey);
  const q = useCompFilings(fy, after);
  const qToday = useCompFilings(todayFy, after);
  const nearFyEnd = Number(nowKey.slice(5)) <= 3;
  const qNext = useCompFilings(todayFy + 1, after && nearFyEnd);

  const statFy = useMemo(() => (after ? q.data?.rows ?? [] : []), [after, q.data]);
  const fyRows = useMemo(() => (statOn ? statFy : []), [statOn, statFy]);
  const taskFy = useMemo(() => allTasks.filter((r) => fyOfIso(r.dueDate) === fy), [allTasks, fy]);
  const fyTasks = useMemo(() => (tasksOn ? taskFy : []), [tasksOn, taskFy]);
  const railRows = useMemo(
    () => [
      ...(after && statOn ? [...(qToday.data?.rows ?? []), ...(nearFyEnd ? qNext.data?.rows ?? [] : [])] : []),
      ...(tasksOn ? allTasks.filter((r) => fyOfIso(r.dueDate) === todayFy || (nearFyEnd && fyOfIso(r.dueDate) === todayFy + 1)) : []),
    ],
    [after, statOn, tasksOn, allTasks, todayFy, qToday.data, qNext.data, nearFyEnd],
  );
  const monthAll = useMemo(() => fyRows.filter((r) => r.dueDate.startsWith(month)), [fyRows, month]);
  const monthTasks = useMemo(() => fyTasks.filter((r) => r.dueDate.startsWith(month)), [fyTasks, month]);
  const monthRows = useMemo(() => [...filterArea(monthAll, area), ...monthTasks], [monthAll, area, monthTasks]);
  const countBase = view === 'month' ? monthAll : fyRows;
  // C-1 counts: the month on screen in Month view, the whole year in Year and Timeline.
  const scope = (list: PortalFiling[]) => (view === 'month' ? list.filter((r) => r.dueDate.startsWith(month)) : list).length;
  const catCounts = { stat: scope(statFy), ns: scope(taskFy) };
  const areaCounts = AREAS.map((a) => (a.id === 'all' ? countBase.length : countBase.filter((r) => r.area === a.id).length));
  const loading = after && (q.isLoading || qToday.isLoading);

  const byId = useMemo(() => {
    const m = new Map<string, PortalFiling>();
    for (const r of [...statFy, ...railRows]) if (!isTaskRow(r)) m.set(r.id, r);
    return m;
  }, [statFy, railRows]);
  const detail = st.filing ? byId.get(st.filing) ?? null : null;
  const openDetail = (f: PortalFiling) => (isTaskRow(f) ? go(taskHref(f.task.id, f.task.boardMeetingId)) : set({ filing: f.id }));

  /* day pop-over */
  const [sel, setSel] = useState<{ iso: string; style: React.CSSProperties; cls: string } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const closePop = useCallback(() => setSel(null), []);
  useEffect(() => {
    if (!sel) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        const iso = sel.iso;
        setSel(null);
        root.current?.querySelector<HTMLElement>(`.day[data-iso="${iso}"]`)?.focus();
      }
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (popRef.current?.contains(t) || t.closest?.('.day[data-iso]')) return;
      setSel(null);
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', down, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', down, true);
    };
  }, [sel]);
  useEffect(() => setSel(null), [month, view, area, cat]);

  const openDay = (iso: string, cell: HTMLElement) => {
    const ab = root.current!;
    const a = ab.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const PW = Math.min(340, window.innerWidth - 24);
    const VW = Math.min(a.right, window.innerWidth) - a.left;
    const right = c.right - a.left + 12 + PW <= VW - 12;
    const left = c.left - a.left - PW - 12 >= 12;
    if (right) setSel({ iso, cls: '', style: { left: c.right - a.left + 12, top: c.top - a.top - 8 } });
    else if (left) setSel({ iso, cls: ' flip', style: { left: c.left - a.left - PW - 12, top: c.top - a.top - 8 } });
    else setSel({ iso, cls: ' below', style: { left: Math.max(12, Math.min(VW - PW - 12, c.left - a.left + c.width / 2 - PW / 2)), top: c.bottom - a.top + 8 } });
  };

  const monthName = MONTHS[Number(month.slice(5)) - 1]!;
  const viewIdx = VIEWS.indexOf(view);
  const areaIdx = Math.max(0, AREAS.findIndex((a) => a.id === area));

  /* empty month copy (E-01) */
  const emptyOverlay = (() => {
    if (!after) return { lines: ['Starts after incorporation'], showAll: false, q: 'Why is my compliance calendar empty before incorporation?' };
    if (loading || q.isError || view !== 'month' || monthRows.length) return null;
    const pool = sortByDue([...filterArea([...fyRows, ...railRows].filter((r) => !isTaskRow(r)), area), ...fyTasks]).filter((r) => r.dueDate > `${month}-31`);
    const next = pool[0];
    const head = area !== 'all' ? `No ${AREA_LABEL[area]} deadlines in ${monthName}` : cat === 'non-statutory' ? `No tasks end in ${monthName}` : `Nothing due in ${monthName}`;
    const tail = next ? `Next: ${next.name} on ${fmtDM(next.dueDate)}` : `None due in ${fyLabelOf(fy)}`;
    return { lines: [head, tail], showAll: area !== 'all', q: `Why is nothing due in ${monthName}?` };
  })();

  return (
    <div className="cp-comp-root page" ref={root}>
      {/* header (C-01) */}
      {after ? (
        <Island inline>
          <CategoryTabs
            allFirst
            value={cat}
            onChange={(c) => set({ cat: c, area: 'all' })}
            stat={catCounts.stat}
            ns={catCounts.ns}
            className="max-w-full justify-self-start"
          />
        </Island>
      ) : null}
      <div className="row-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div data-calnav="" className="calbar">
          <MonthNav month={month} nowKey={nowKey} hidden={view !== 'month'} onMonth={(k) => set({ date: k })} onStep={(k) => set({ date: stepMonth(month, k) })} />
          <span className="mono fy-tag" data-tip={`Financial year ${fyLabelOf(fy).slice(3)}`}>
            {fyLabelOf(fy)}
          </span>
          {cat === 'non-statutory' ? null : (
            <div className="seg-scroll">
              <Seg
                opts={AREAS.map((a) => a.label)}
                on={areaIdx}
                counts={areaCounts}
                label="Area"
                onPick={(i) => set({ area: AREAS[i]!.id })}
                same={(i) => toast(`Already showing ${AREAS[i]!.label === 'All' ? 'all areas' : AREAS[i]!.label}`)}
              />
            </div>
          )}
        </div>
        <div className="end" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span data-calview="" style={{ display: 'contents' }}>
            <Seg
              opts={['Month', 'Year', 'Timeline']}
              on={viewIdx}
              label="Calendar view"
              onPick={(i) => set({ view: VIEWS[i]! })}
              same={(i) => toast(`Already showing the ${['month', 'year', 'timeline'][i]} view`)}
            />
          </span>
          <Island inline>
            <Button asChild variant="secondary" className="h-8 font-semibold text-ink">
              <a
                href={`${portalHref('filings')}?fy=${fy}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(`${portalHref('filings')}?fy=${fy}`);
                }}
              >
                <FileText size={16} strokeWidth={1.6} aria-hidden /> Filings
              </a>
            </Button>
          </Island>
        </div>
      </div>

      <div className="cal-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="card t" data-calbody="" data-view={view} style={{ padding: 12, position: 'relative' }}>
            {q.isError && after ? (
              <div role="alert" style={{ padding: '24px 12px', color: 'var(--over-text)', fontWeight: 500 }}>
                Could not load the register.{' '}
                <button type="button" className="btn btn-o btn-s" onClick={() => void q.refetch()}>
                  Try again
                </button>
              </div>
            ) : view === 'month' || !after ? (
              <MonthGrid
                month={month}
                rows={loading ? [] : monthRows}
                today={today}
                selIso={sel?.iso ?? null}
                onDay={(iso, el) => (sel?.iso === iso ? setSel(null) : openDay(iso, el))}
              />
            ) : loading ? (
              <GridSkeleton />
            ) : view === 'year' ? (
              <YearView months={fyMonths(fy)} rows={[...filterArea(fyRows, area), ...fyTasks]} today={today} onMonth={(k) => set({ date: k, view: 'month' })} />
            ) : (
              <TimelineView fyStart={fy} rows={[...filterArea(fyRows, area), ...fyTasks]} today={today} onOpen={openDetail} />
            )}
            {emptyOverlay ? (
              <div
                style={{
                  position: 'absolute',
                  inset: '44px 14px 14px',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'oklch(var(--surface-raised) / .72)',
                  borderRadius: 6,
                  backdropFilter: 'blur(1px)',
                }}
              >
                <Island className="w-full max-w-[420px]">
                  <Empty
                    className="m-0 bg-surface-raised md:mx-0"
                    action={
                      <span className="flex flex-wrap items-center justify-center gap-2">
                        {emptyOverlay.showAll ? (
                          <Button size="sm" onClick={() => set({ area: 'all' })}>
                            Show all areas
                          </Button>
                        ) : null}
                        <Button size="sm" variant="secondary" onClick={() => openChat(emptyOverlay.q)}>
                          Ask VCFO why
                        </Button>
                      </span>
                    }
                  >
                    <span className="block font-medium text-ink">{emptyOverlay.lines[0]}</span>
                    {emptyOverlay.lines[1] ? <span className="block">{emptyOverlay.lines[1]}</span> : null}
                  </Empty>
                </Island>
              </div>
            ) : null}
            {loading && view === 'month' ? (
              <Island className="absolute inset-x-3.5 bottom-3.5 top-11">
                <div aria-busy="true" aria-label="Loading calendar" className="h-full animate-pulse rounded-md bg-surface-sunken" />
              </Island>
            ) : null}
          </div>
        </div>
        <Rail
          after={after}
          loading={loading}
          monthAll={[...monthAll, ...monthTasks]}
          month={month}
          railRows={railRows}
          nowKey={nowKey}
          onOpen={openDetail}
          openDrill={openDrill}
        />
      </div>

      {sel ? (
        <DayPopover
          ref={popRef}
          iso={sel.iso}
          cls={sel.cls}
          style={sel.style}
          rows={byDate(monthRows).get(sel.iso) ?? []}
          onClose={closePop}
          onOpen={(f) => {
            setSel(null);
            openDetail(f);
          }}
        />
      ) : null}
      {detail ? <DetailModal f={detail} onClose={() => set({ filing: null })} onOpenFilings={onOpenFilings} /> : null}
    </div>
  );
}

/* ------------------------------------------------------- month grid */

function MonthGrid({ month, rows, today, selIso, onDay }: { month: string; rows: PortalFiling[]; today: string; selIso: string | null; onDay: (iso: string, el: HTMLElement) => void }) {
  const dates = byDate(rows);
  const cells = mondayMonthGrid(month);
  return (
    <div className="cal-scroll">
      <div className="cal" role="grid" aria-label={`${monthLabel(month)} deadlines`}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
          <div key={d} className={`dow${i > 4 ? ' we' : ''}`} role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((c, idx) => {
          if (c.out)
            return (
              <div key={c.iso} className="day out" aria-hidden="true">
                <div className="dn">
                  <span className="dt">{c.day}</span>
                </div>
              </div>
            );
          const it = sortByDue(dates.get(c.iso) ?? []);
          const s = it.length ? worstStatus(it, today) : '';
          const isToday = c.iso === today;
          const we = idx % 7 > 4;
          // C-278: a day with no filings is not a button
          if (!it.length)
            return (
              <div
                key={c.iso}
                role="gridcell"
                className={`day${we ? ' we' : ''}${isToday ? ' today' : ''}`}
                aria-label={`${fmtLongComma(c.iso)}, nothing due${isToday ? ', today' : ''}`}
                aria-current={isToday ? 'date' : undefined}
              >
                <div className="dn">
                  <span className="dt">{c.day}</span>
                </div>
              </div>
            );
          return (
            <button
              key={c.iso}
              type="button"
              className={`day${we ? ' we' : ''}${s ? ` s-${s}` : ''}${isToday ? ' today' : ''}${selIso === c.iso ? ' sel' : ''}`}
              data-iso={c.iso}
              data-tip={it.length ? `${fmtWDM(c.iso)} · ${dayWords(it)}` : undefined}
              aria-label={`${fmtLongComma(c.iso)}, ${dayWords(it)}${isToday ? ', today' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              aria-expanded={selIso === c.iso}
              data-notip=""
              onClick={(e) => onDay(c.iso, e.currentTarget)}
            >
              <div className="dn">
                <span className="dt">{c.day}</span>
                {isToday ? (
                  <span className="tlabel">
                    <span className="pulse" />
                    <span className="tl-t">Today</span>
                  </span>
                ) : null}
                {it.length > 1 ? (
                  <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                    {it.length}
                  </span>
                ) : null}
              </div>
              {it.slice(0, 2).map((r) => {
                const rs = statusOf(r, today);
                if (isTaskRow(r))
                  return (
                    <span key={r.id} className="ev task" data-s={rs} title={`${r.name} · ${taskHint(r.task)}`}>
                      <i />
                      <span className="a">Task</span>
                      <span className="t">{r.name}</span>
                    </span>
                  );
                return (
                  <span key={r.id} className="ev" data-s={rs}>
                    <i style={{ background: STROKE[rs] }} />
                    <span className="a">{r.area}</span>
                    <span className="t">{r.name}</span>
                  </span>
                );
              })}
              {it.length > 2 ? <span className="more">+{it.length - 2} more</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,196px),1fr))', gap: 12 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="sk-row" style={{ height: 170, borderRadius: 8 }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------- day pop-over */


/**
 * Day pop-over (prototype CalendarScreen DayPopover): 340px, a 1px edge and the float shadow, a head
 * band with a hairline under it, then full-width rows with hairlines: the short area tag, the name
 * with the portal ↗, the period, the Proof chip and the status chip. Esc and a click outside close it.
 */
const DayPopover = forwardRef<
  HTMLDivElement,
  { iso: string; cls: string; style: React.CSSProperties; rows: PortalFiling[]; onClose: () => void; onOpen: (f: PortalFiling) => void }
>(function DayPopover({ iso, style, rows, onClose, onOpen }, ref) {
  const { today, openProof } = useComp();
  const { openChat } = usePortal();
  const list = sortByDue(rows);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, [iso]);
  return (
      <div ref={ref} style={style} role="dialog" aria-label={fmtLong(iso)} className="cp-tw absolute z-[45] w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-md border border-line bg-surface-raised shadow-float">
        <div className="flex items-center gap-2 border-b border-line-soft bg-surface-sunken px-4 py-2.5">
          <b className="flex-1 text-[13.5px] font-medium text-ink">{fmtLong(iso)}</b>
          <span className="text-[12px] tabular-nums text-ink-muted">{dayWords(list)}</span>
        </div>
        <ul>
          {list.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 border-t border-line-soft px-4 py-2.5 first:border-t-0 hover:bg-surface-sunken">
              <RowArea r={r} compact />
              <button
                ref={i === 0 ? first : undefined}
                type="button"
                className="min-w-0 flex-1 text-left"
                title={isTaskRow(r) ? taskHint(r.task) : undefined}
                aria-label={`${r.name} · ${isTaskRow(r) ? taskHint(r.task) : r.period} · open the details`}
                onClick={() => onOpen(r)}
              >
                <span className="block truncate text-[13px] font-medium text-ink">{r.name}</span>
                <span className="block truncate text-[12px] text-ink-muted">{isTaskRow(r) ? taskHint(r.task) : r.period}</span>
              </button>
              {isTaskRow(r) ? (
                <SChip fixed>{taskWord(r.task, today)}</SChip>
              ) : (
                <>
                  <PortalLink f={r} />
                  <ProofChip f={r} onOpen={(x) => openProof(x)} />
                  <StatusChip s={statusOf(r, today)} />
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-line-soft px-4 py-2">
          <button
            type="button"
            className="text-[13px] font-medium text-brand-text hover:underline"
            onClick={() => {
              onClose();
              openChat(`What is due on ${fmtLong(iso)}?`);
            }}
          >
            Ask VCFO
          </button>
        </div>
      </div>
  );
});

/* ------------------------------------------------------------- rail */

const railCard = 'min-w-0 rounded-md border-1.5 border-line bg-surface-raised';

/** The right rail (donut, Next deadline, Coming up); the phone page stacks it under the agenda. */
export function Rail({
  after,
  loading,
  monthAll,
  month,
  railRows,
  nowKey,
  onOpen,
  openDrill,
}: {
  after: boolean;
  loading: boolean;
  monthAll: PortalFiling[];
  month: string;
  railRows: PortalFiling[];
  nowKey: string;
  onOpen: (f: PortalFiling) => void;
  openDrill: ReturnType<typeof useComp>['openDrill'];
}) {
  const { today } = useComp();
  if (!after)
    return (
      <Island className="cal-rail">
        <div className={railCard}>
          <Empty>Starts after incorporation</Empty>
        </div>
      </Island>
    );
  if (loading)
    return (
      <Island className="cal-rail">
        <div className={cn(railCard, 'p-4')} aria-busy="true" aria-label="Loading">
          <SkeletonRows rows={3} />
        </div>
      </Island>
    );
  const next = nextDeadline(railRows, today);
  const over = overdueRows(railRows, today);
  const todayMonthRows = railRows.filter((r) => r.dueDate.startsWith(nowKey));
  const allClear = !next && !over.length;
  return (
    <Island className="cal-rail">
      {monthAll.length ? <DonutCard rows={monthAll} label={MONTHS[Number(month.slice(5)) - 1]!} drillTitle={`Compliances · ${monthLabel(month)}`} /> : null}
      {allClear ? (
        <div className={railCard}>
          <Empty>Nothing due and nothing overdue</Empty>
        </div>
      ) : (
        <NextDeadlineCard next={next} over={over} todayMonthRows={todayMonthRows} railRows={railRows} onOpen={onOpen} openDrill={openDrill} nowKey={nowKey} />
      )}
      <ComingUp rows={comingUp(railRows, today, 7)} onOpen={onOpen} />
    </Island>
  );
}

/* Next deadline card · option A (C-23): days tile, the filing, its area and state, Open filing and Remind me. */
function NextDeadlineCard({
  next,
  over,
  todayMonthRows,
  railRows,
  onOpen,
  openDrill,
  nowKey,
}: {
  next: PortalFiling | null;
  over: PortalFiling[];
  todayMonthRows: PortalFiling[];
  railRows: PortalFiling[];
  onOpen: (f: PortalFiling) => void;
  openDrill: ReturnType<typeof useComp>['openDrill'];
  nowKey: string;
}) {
  const { today, remind } = useComp();
  const { toast } = usePortal();
  const days = next ? daysBetween(today, next.dueDate) : 0;
  const firstOver = over[0];
  const fyTitle = `Compliances · ${fyLabelOf(fyStartOfMonth(nowKey))}`;
  const drillNext = () =>
    next && openDrill({ kind: 'status', k: 'due', title: `Compliances · ${monthLabel(nowKey)}`, rows: todayMonthRows.length ? todayMonthRows : railRows });
  return (
    <div className={cn(railCard, 'nd-card overflow-visible')}>
      {next ? (
        <div className="px-4 pb-3.5 pt-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
            <i className="h-1.5 w-1.5 rounded-[2px] bg-highlight-bright" aria-hidden />
            Next deadline
          </div>
          <div className="mt-2.5 flex items-center gap-3.5">
            <button
              type="button"
              onClick={drillNext}
              data-tip={`${next.name} · due ${fmtWDM(next.dueDate)}`}
              aria-label={`${plural(days, 'day')} left · ${next.name} · show the list`}
              className="grid h-[62px] w-[58px] flex-none place-content-center rounded-lg bg-upcoming-soft text-center leading-none text-ink hover:bg-surface-sunken"
            >
              <b className="text-[28px] font-bold tabular-nums">{days}</b>
              <small className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">{days === 1 ? 'day' : 'days'}</small>
            </button>
            <div className="min-w-0 flex-1">
              {isTaskRow(next) ? (
                <div className="nd-title flex min-w-0 flex-wrap items-center gap-1 text-[18px] font-bold leading-tight tracking-tight text-ink" title={taskHint(next.task)}>
                  {next.name}
                </div>
              ) : (
                <div className="nd-title flex min-w-0 flex-wrap items-center gap-1 text-[18px] font-bold leading-tight tracking-tight text-ink">
                  {next.name} · {next.period} <PortalLink f={next} />
                  <InfoPopover askAbout={`${next.name} · ${next.period}`} label="About this">
                    {next.name} for {next.period} · due {fmtWDM(next.dueDate)} · filed on the {portalFor(next)[0]}.
                    {next.dataReceivedOn ? ` Data received ${fmtDM(next.dataReceivedOn)}.` : ''}
                  </InfoPopover>
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <RowArea r={next} compact />
                {isTaskRow(next) && next.task.stage === 'waiting' ? <SChip tone="warn">Your inputs needed</SChip> : null}
                {next.dataReceivedOn ? (
                  <SChip tone="ok" data-tip={`Data received ${fmtDM(next.dataReceivedOn)}`}>
                    Data received
                  </SChip>
                ) : null}
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => onOpen(next)}>
              {isTaskRow(next) ? 'Open task' : 'Open filing'} <ArrowRight size={13} strokeWidth={1.6} aria-hidden />
            </Button>
            {isTaskRow(next) ? null : next.reminderOn ? (
              <button type="button" className="self-center" onClick={() => toast(`Reminder set · email on ${fmtDM(next.reminderOn!)}`)} aria-label={`Reminder set · email on ${fmtDM(next.reminderOn)}`}>
                <SChip tone="ok">Reminder set</SChip>
              </button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => remind(next)}>
                Remind me
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Empty>Nothing else due this year</Empty>
      )}
      {firstOver ? (
        <button
          type="button"
          data-tip={`Overdue · ${over.length}`}
          aria-label={`Overdue · ${over.length} · show the list`}
          onClick={() => openDrill({ kind: 'status', k: 'over', title: fyTitle, rows: railRows })}
          className="flex w-full items-center gap-2 border-t border-line-soft px-4 py-2.5 text-left text-[13px] hover:bg-surface-sunken"
        >
          <i className="h-2 w-2 flex-none rounded-[2px] bg-danger-mid" aria-hidden />
          <b className="truncate font-semibold text-ink">{firstOver.name}</b>
          <span className="flex-none font-semibold text-danger">
            {plural(-daysBetween(today, firstOver.dueDate), 'day')} late{over.length > 1 ? ` · +${over.length - 1} more` : ''}
          </span>
          <ChevronRight size={14} strokeWidth={1.6} className="ml-auto flex-none text-ink-muted" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/* Coming up (C-24): one date tile per day, each filing with its short area tag and a compact status chip. */
function ComingUp({ rows, onOpen }: { rows: PortalFiling[]; onOpen: (f: PortalFiling) => void }) {
  const { today } = useComp();
  const dates = [...byDate(rows).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className={cn(railCard, 'px-4 pb-1.5 pt-3.5')}>
      <div className="mb-1 flex items-center gap-2 border-b border-line-soft pb-2">
        <h2 className="flex-1 text-[13px] font-medium text-ink">Coming up</h2>
        <span className="text-[11px] tabular-nums text-ink-muted">{rows.length}</span>
      </div>
      {dates.length ? (
        dates.map(([d, list]) => (
          <div key={d} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 first:border-t-0">
            <span className={cn('grid h-12 w-11 flex-none place-content-center rounded-md text-center leading-none', TINT[worstStatus(list, today)])} aria-hidden>
              <b className="text-[18px] font-bold">{Number(d.slice(8))}</b>
              <small className="mt-1 text-[11px] font-semibold opacity-85">{tileSub(d, today.slice(0, 7))}</small>
            </span>
            <ul className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
              {list.map((r) => (
                <li key={r.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpen(r)}
                    aria-label={`${r.name} · ${isTaskRow(r) ? taskHint(r.task) : r.period} · open the details`}
                    title={isTaskRow(r) ? taskHint(r.task) : undefined}
                    className="flex w-full min-w-0 items-center gap-2 text-left hover:text-brand-text"
                  >
                    <RowArea r={r} compact />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.name}</span>
                    <StatusChip s={statusOf(r, today)} compact />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="py-3 text-[13px] text-ink-faint">None</p>
      )}
    </div>
  );
}
