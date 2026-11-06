"use client";

import { sep } from '@/lib/date-format';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { Bell, ChevronLeft, ChevronRight, ListChecks, Maximize2 } from 'lucide-react';
import type { Engagement } from '@/data/engagements';
import { useApp } from '@/context/AppContext';
import { isFirmWideAdmin } from '@/lib/auth';
import {
  ACT_META,
  ACT_SWATCH,
  FY_END,
  FY_LABEL,
  FY_START,
  STATUTORY_DEADLINES,
  deadlineAppliesTo,
  type StatutoryAct,
  type StatutoryDeadline,
} from '@/data/statutory-calendar-fy2627';
import { CompanyPicker } from '@/components/admin/CompanyPicker';
import {
  PreIncorporationNotice,
  PreIncorporationPortfolioNote,
  type PreIncorporationScope,
} from '@/components/compliances/PreIncorporationNotice';
import { useCalendarChanges } from '@/hooks/use-watch';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { withMovedDeadlines } from '@/lib/watch/calendar-proposal';
import { PageBackCluster } from '@/components/shell/PageBackButton';
import {
  buildStatutoryMonthGrid,
  isoFromDate,
  isoInStatutoryFy,
  nextInMonthCellIndex,
  statutoryAgendaId,
  statutoryCellActs,
  statutoryFilingName,
  statutoryReturnPeriod,
  statutoryStatus,
  statutoryStatusLabel,
  readCalendarViewPrefs,
  toggleMutedAct,
  writeCalendarViewPrefs,
  type StatutoryCalendarMode,
  type StatutoryMonthCell,
  type StatutoryStatus,
} from '@/components/admin/statutory-calendar-utils';
import { StatutoryMaxiCalendar } from '@/components/admin/StatutoryMaxiCalendar';
import { monthPaneMotion } from '@/lib/shell/motion';
import { useShellAppearance } from '@/hooks/use-shell-appearance';
import { cn } from '@/lib/utils';
import { SegmentedPicker } from '@/components/admin/SegmentedPicker';

const ACTS = Object.keys(ACT_META) as StatutoryAct[];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const FY_FIRST_MONTH = new Date(2026, 3, 1);
const FY_LAST_MONTH = new Date(2027, 2, 1);
const FLASH_MS = 1400;
const EMPTY_ITEMS: StatutoryDeadline[] = [];
/** Fixed dot slots per cell so every calendar cell keeps the same height. */
const DOT_SLOTS = [0, 1, 2] as const;

type Scope = 'all' | 'overdue';

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
];

/** Status lane — reuses the app's existing status meanings, never category colour. */
const STATUS_PILL: Record<StatutoryStatus, string> = {
  overdue: 'bg-danger-soft text-danger',
  'due-soon': 'bg-surface-sunken text-ink-muted',
  upcoming: 'bg-brand-soft text-brand-strong',
};

function monthKey(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

function clampToFy(d: Date): Date {
  const k = monthKey(d);
  if (k < monthKey(FY_FIRST_MONTH)) return FY_FIRST_MONTH;
  if (k > monthKey(FY_LAST_MONTH)) return FY_LAST_MONTH;
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function parseLocalIso(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function deadlineLabel(n: number): string {
  return n === 1 ? '1 deadline' : `${n} deadlines`;
}

function prefixFromMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function StatutoryDayTile({
  cell,
  items,
  todayIso,
  selected,
  focused,
  monthLabel,
  onSelect,
}: {
  cell: StatutoryMonthCell;
  items: readonly StatutoryDeadline[];
  todayIso: string;
  selected: boolean;
  focused: boolean;
  monthLabel: string;
  onSelect: (iso: string) => void;
}) {
  const inFy = isoInStatutoryFy(cell.iso, FY_START, FY_END);
  const isToday = cell.iso === todayIso;
  const local = parseLocalIso(cell.iso);
  const weekday = sep(local.toLocaleDateString('en-IN', { weekday: 'long' }));
  const { acts } = statutoryCellActs(items);

  if (!inFy || !cell.inMonth) {
    return (
      <div role="gridcell" className="stat-cal-cell is-outside" aria-hidden>
        <span className="stat-cal-cell-num">{cell.day}</span>
        <span className="stat-cal-dots" />
      </div>
    );
  }

  return (
    <button
      type="button"
      role="gridcell"
      data-cal-iso={cell.iso}
      tabIndex={focused ? 0 : -1}
      aria-current={isToday ? 'date' : undefined}
      aria-selected={selected}
      aria-label={`${weekday} ${cell.day} ${monthLabel}${items.length ? `, ${deadlineLabel(items.length)}` : ''}`}
      onClick={() => onSelect(cell.iso)}
      className="stat-cal-cell"
      data-today={isToday ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
    >
      <span className="stat-cal-cell-num">{cell.day}</span>
      <span className="stat-cal-dots" aria-hidden>
        {DOT_SLOTS.map((slot) => {
          const act = acts[slot];
          return (
            <span
              key={slot}
              className={cn('stat-cal-dot', act ? ACT_SWATCH[act].solid : 'is-empty')}
            />
          );
        })}
      </span>
    </button>
  );
}

function StatutoryListRow({ item, todayIso }: { item: StatutoryDeadline; todayIso: string }) {
  const meta = ACT_META[item.act];
  const status = statutoryStatus(item.date, todayIso);
  const period = statutoryReturnPeriod(item.title);
  const d = parseLocalIso(item.date);

  return (
    <li className="stat-cal-row">
      <span className="stat-cal-row-date" aria-hidden>
        <span className="stat-cal-row-dow">{sep(d.toLocaleDateString('en-IN', { weekday: 'short' }))}</span>
        <span className="stat-cal-row-day">{d.getDate()}</span>
      </span>
      <span
        className={cn('stat-cal-tag mono', ACT_SWATCH[item.act].chip)}
        title={meta.full}
      >
        {meta.label}
      </span>
      <span className="stat-cal-row-main">
        <span className="stat-cal-row-title">{statutoryFilingName(item.title)}</span>
        {period ? (
          <span className="stat-cal-row-period">
            {period}
            <span className="stat-cal-row-period-cap">Return period</span>
          </span>
        ) : null}
      </span>
      <span className={cn('stat-cal-status', STATUS_PILL[status])}>
        {statutoryStatusLabel(item.date, todayIso)}
      </span>
      <button
        type="button"
        className="stat-cal-remind"
        disabled
        title="Reminders are not wired up yet"
      >
        <Bell className="h-3 w-3" strokeWidth={2} aria-hidden />
        Remind me
      </button>
    </li>
  );
}

function StatutoryAgendaGroup({
  dateIso,
  items,
  todayIso,
  selected,
  flashing,
  reduceMotion,
}: {
  dateIso: string;
  items: readonly StatutoryDeadline[];
  todayIso: string;
  selected: boolean;
  flashing: boolean;
  reduceMotion: boolean;
}) {
  const d = parseLocalIso(dateIso);
  const isPast = dateIso < todayIso;
  const isToday = dateIso === todayIso;
  return (
    <section
      id={statutoryAgendaId(dateIso)}
      className={cn(
        'stat-cal-group',
        selected && 'is-selected',
        flashing && 'is-flash',
        isPast && !selected && !flashing && 'is-past',
        !reduceMotion && 'stat-cal-group-motion',
      )}
    >
      <header className="stat-cal-group-head">
        <span className={cn('stat-cal-group-label', isToday && 'is-today')}>
          {isToday ? 'Today' : sep(d.toLocaleDateString('en-IN', { weekday: 'short' }))}{' '}
          <span className="tabular-nums">{d.getDate()}</span>
        </span>
        <span className="stat-cal-group-n">{items.length}</span>
      </header>
      <ul className="stat-cal-rows">
        {items.map((item) => (
          <StatutoryListRow key={item.id} item={item} todayIso={todayIso} />
        ))}
      </ul>
    </section>
  );
}

export function StatutoryCalendar({
  engagements,
  trackerHref,
  showBack,
  companyId: controlledCompanyId,
  onCompanyChange,
  audience = 'staff',
}: {
  engagements: Engagement[];
  /** Intern-only: filing tracker lives on its own route, not page tabs. */
  trackerHref?: string;
  /** Place the shell back chevron beside the section title (intern calendar). */
  showBack?: boolean;
  /**
   * Controlled company selection (`'all'` or an engagement id). When set, the
   * picker inside this grid drives the caller too — the shared compliance
   * views use it so one picker narrows the statutory grid and the register
   * together. Omit to keep the picker self-contained.
   */
  companyId?: string;
  onCompanyChange?: (id: string) => void;
  /** Wording of the pre-COI notice for a narrowed company. */
  audience?: PreIncorporationScope['audience'];
}) {
  const todayIso = isoFromDate(new Date());
  const monthHeadingId = useId();
  const gridHintId = useId();
  const osReduce = useReducedMotion();
  const { reduceMotion: prefReduce } = useShellAppearance();
  const reduceMotion = Boolean(osReduce) || prefReduce;
  const [viewMonth, setViewMonth] = useState(() => clampToFy(new Date()));
  const [mode, setMode] = useState<StatutoryCalendarMode>('minimized');
  const { sidebarMode, setSidebarMode, user, getStateForEngagement } = useApp();
  /** Admin and super see the full master calendar; leads and managers only the
      deadlines that apply to a client in their own scoped portfolio. */
  const firmWide = isFirmWideAdmin(user?.role);
  /** True when maximizing unpinned the sidebar — minimize must re-pin it. */
  const unpinnedForMax = useRef(false);

  const unpinSidebarForMax = () => {
    if (sidebarMode === 'open') {
      unpinnedForMax.current = true;
      setSidebarMode('auto');
    }
  };
  const restoreSidebarAfterMax = () => {
    if (unpinnedForMax.current) {
      unpinnedForMax.current = false;
      setSidebarMode('open');
    }
  };

  useEffect(() => {
    if (readCalendarViewPrefs().mode === 'maximized') {
      setMode('maximized');
      unpinSidebarForMax();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the page while maximized must not strand an unpinned sidebar.
  useEffect(
    () => () => {
      if (unpinnedForMax.current) setSidebarMode('open');
    },
    [setSidebarMode],
  );

  const applyMode = (nextMode: StatutoryCalendarMode) => {
    if (nextMode === 'maximized') unpinSidebarForMax();
    else restoreSidebarAfterMax();
    setMode(nextMode);
    writeCalendarViewPrefs({ mode: nextMode });
  };
  const [monthDir, setMonthDir] = useState<1 | -1>(1);
  const [ownCompanyId, setOwnCompanyId] = useState<string>('all');
  const companyId = controlledCompanyId ?? ownCompanyId;
  const setCompanyId = (id: string) => {
    if (controlledCompanyId === undefined) setOwnCompanyId(id);
    onCompanyChange?.(id);
  };
  const [scope, setScope] = useState<Scope>('all');
  const [mutedActs, setMutedActs] = useState<Set<StatutoryAct>>(() => new Set());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [flashDay, setFlashDay] = useState<string | null>(null);
  const [focusedIso, setFocusedIso] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRequest = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const company = companyId === 'all' ? null : engagements.find((e) => e.id === companyId) ?? null;
  /** A picker needs a choice; a single-company scope is simply that company. */
  const showPicker = engagements.length > 1;

  /** Pre-COI companies, read off the list in hand — the count needs no query. */
  const preIncorporationCount = useMemo(
    () => engagements.filter((e) => !isIncorporated(e, getStateForEngagement(e))).length,
    [engagements, getStateForEngagement],
  );
  const companyPreIncorporation = Boolean(
    company && !isIncorporated(company, getStateForEngagement(company)),
  );

  const calendarChanges = useCalendarChanges();

  /** Company + scope, but before category mutes — legend counts must not vanish. */
  const scoped = useMemo(() => {
    return withMovedDeadlines(STATUTORY_DEADLINES, calendarChanges).filter((d) => {
      if (company && !deadlineAppliesTo(d, company)) return false;
      if (!firmWide && !company && !engagements.some((e) => deadlineAppliesTo(d, e))) {
        return false;
      }
      if (scope === 'overdue' && statutoryStatus(d.date, todayIso) !== 'overdue') return false;
      return true;
    });
  }, [company, scope, todayIso, firmWide, engagements, calendarChanges]);

  const visible = useMemo(() => scoped.filter((d) => !mutedActs.has(d.act)), [scoped, mutedActs]);

  const monthPrefix = prefixFromMonth(viewMonth);

  const byDate = useMemo(() => {
    const map = new Map<string, StatutoryDeadline[]>();
    for (const item of visible) {
      if (!item.date.startsWith(monthPrefix)) continue;
      const list = map.get(item.date);
      if (list) list.push(item);
      else map.set(item.date, [item]);
    }
    return map;
  }, [visible, monthPrefix]);

  const agendaDates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const monthCount = useMemo(
    () => agendaDates.reduce((sum, iso) => sum + (byDate.get(iso)?.length ?? 0), 0),
    [agendaDates, byDate],
  );

  const actCounts = useMemo(() => {
    const counts = {} as Record<StatutoryAct, number>;
    for (const act of ACTS) counts[act] = 0;
    for (const d of scoped) {
      if (!d.date.startsWith(monthPrefix)) continue;
      counts[d.act] += 1;
    }
    return counts;
  }, [scoped, monthPrefix]);

  const cells = useMemo(() => buildStatutoryMonthGrid(viewMonth), [viewMonth]);

  const rovingIso =
    focusedIso && cells.some((c) => c.inMonth && c.iso === focusedIso)
      ? focusedIso
      : (cells.find((c) => c.inMonth && c.iso === todayIso)?.iso ??
        cells.find((c) => c.inMonth)?.iso ??
        null);

  const canPrev = monthKey(viewMonth) > monthKey(FY_FIRST_MONTH);
  const canNext = monthKey(viewMonth) < monthKey(FY_LAST_MONTH);
  const monthName = sep(viewMonth.toLocaleDateString('en-IN', { month: 'long' }));
  const monthYear = viewMonth.getFullYear();
  const monthLabel = `${monthName} ${monthYear}`;
  const pane = monthPaneMotion(monthDir, reduceMotion);

  function jumpToToday() {
    const next = clampToFy(new Date());
    const delta = monthKey(next) - monthKey(viewMonth);
    if (delta !== 0) {
      setMonthDir(delta < 0 ? -1 : 1);
      setViewMonth(next);
      setSelectedDay(null);
      setFlashDay(null);
      setFocusedIso(null);
      scrollRequest.current = null;
    }
  }

  function shiftMonth(delta: number) {
    setMonthDir(delta < 0 ? -1 : 1);
    setViewMonth((d) => clampToFy(new Date(d.getFullYear(), d.getMonth() + delta, 1)));
    setSelectedDay(null);
    setFlashDay(null);
    setFocusedIso(null);
    scrollRequest.current = null;
  }

  function jumpToDay(iso: string) {
    if (!isoInStatutoryFy(iso, FY_START, FY_END)) return;
    setSelectedDay(iso);
    setFocusedIso(iso);
    if (!byDate.has(iso)) {
      scrollRequest.current = null;
      setFlashDay(null);
      return;
    }
    setFlashDay(iso);
    scrollRequest.current = iso;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlashDay((d) => (d === iso ? null : d));
    }, FLASH_MS);
  }

  useEffect(() => {
    const iso = scrollRequest.current;
    if (!iso || iso !== selectedDay) return;
    if (!byDate.has(iso)) return;
    const el = document.getElementById(statutoryAgendaId(iso));
    if (!el) return;
    scrollRequest.current = null;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [selectedDay, byDate, reduceMotion]);

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const iso = (e.target as HTMLElement).dataset.calIso;
    if (!iso) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      jumpToDay(iso);
      return;
    }
    const from = cells.findIndex((c) => c.iso === iso);
    const next = nextInMonthCellIndex(cells, from, e.key);
    if (next == null || next === from) return;
    e.preventDefault();
    const nextIso = cells[next]?.iso;
    if (!nextIso) return;
    setFocusedIso(nextIso);
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLElement>(`[data-cal-iso="${nextIso}"]`)?.focus();
    });
  }

  const title = showBack ? (
    <PageBackCluster>
      <h1 className="text-[1.05rem] font-semibold leading-none tracking-tight text-ink">
        Statutory calendar
      </h1>
    </PageBackCluster>
  ) : (
    <h2 className="text-[1.05rem] font-semibold leading-none tracking-tight text-ink">
      Statutory calendar
    </h2>
  );

  return (
    <div className="stat-cal">
      <div className="flex flex-wrap items-center gap-3 px-1 pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {title}
          <span className="mono rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand">
            {FY_LABEL}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showPicker ? (
            <CompanyPicker
              engagements={engagements}
              value={companyId}
              onChange={(id) => {
                setCompanyId(id);
                setSelectedDay(null);
              }}
            />
          ) : null}
          {trackerHref ? (
            <Link
              href={trackerHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-brand transition-colors hover:bg-brand-soft"
            >
              <ListChecks className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Filing tracker
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => applyMode('maximized')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2.5 text-[12.5px] font-medium text-brand transition-colors hover:border-brand/35 hover:bg-brand-soft"
          >
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Full screen
          </button>
        </div>
      </div>

      {company && companyPreIncorporation ? (
        <PreIncorporationNotice
          scope={{ audience, companyName: company.companyName }}
          className="mb-3"
        />
      ) : !company ? (
        <PreIncorporationPortfolioNote count={preIncorporationCount} className="px-1 pb-3" />
      ) : null}

      <div className="stat-cal-stage">
        <section className="surface stat-cal-list overflow-hidden">
          <div className="stat-cal-list-head">
            <CardHeadTile title="Calendar" />
            <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">
              {monthName} · {deadlineLabel(monthCount)}
            </h3>
            <SegmentedPicker
              value={scope}
              options={SCOPES.map((s) => ({ value: s.id, label: s.label }))}
              onChange={(next) => {
                setScope(next);
                setSelectedDay(null);
              }}
              ariaLabel="Filter deadlines"
              size="sm"
              className="inline-grid shrink-0"
            />
          </div>

          <div className="stat-cal-list-body">
            {agendaDates.length === 0 ? (
              <p className="stat-cal-empty">No deadlines in {monthLabel} for these filters.</p>
            ) : (
              agendaDates.map((dateIso) => (
                <StatutoryAgendaGroup
                  key={dateIso}
                  dateIso={dateIso}
                  items={byDate.get(dateIso) ?? EMPTY_ITEMS}
                  todayIso={todayIso}
                  selected={dateIso === selectedDay}
                  flashing={flashDay === dateIso}
                  reduceMotion={reduceMotion}
                />
              ))
            )}
          </div>
        </section>

        <section className="surface stat-cal-nav overflow-hidden">
          <div className="stat-cal-nav-head">
            <p id={monthHeadingId} className="stat-cal-nav-month">
              {monthName}
              <span className="ml-1.5 font-medium text-ink-muted">{monthYear}</span>
            </p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                disabled={!canPrev}
                className="stat-cal-chevron"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={!canNext}
                className="stat-cal-chevron"
                aria-label="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => applyMode('maximized')}
                className="stat-cal-chevron"
                aria-label="Maximize calendar"
                title="Maximize"
              >
                <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          <div className="stat-cal-nav-body">
            <p id={gridHintId} className="sr-only">
              Use arrow keys to move between days. Choose a day to jump to it in the list.
            </p>
            <div className="stat-cal-dows" aria-hidden>
              {WEEKDAYS.map((w, i) => (
                <div key={`${w}-${i}`} className={cn('stat-cal-dow', (i === 0 || i === 6) && 'is-weekend')}>
                  {w}
                </div>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={monthPrefix}
                ref={gridRef}
                role="grid"
                aria-labelledby={monthHeadingId}
                aria-describedby={gridHintId}
                onKeyDown={onGridKeyDown}
                initial={pane.initial}
                animate={pane.animate}
                exit={pane.exit}
                transition={pane.transition}
                className="stat-cal-month"
              >
                {cells.map((cell) => (
                  <StatutoryDayTile
                    key={cell.iso}
                    cell={cell}
                    items={byDate.get(cell.iso) ?? EMPTY_ITEMS}
                    todayIso={todayIso}
                    selected={cell.iso === selectedDay}
                    focused={cell.iso === rovingIso}
                    monthLabel={monthLabel}
                    onSelect={jumpToDay}
                  />
                ))}
              </m.div>
            </AnimatePresence>

            <div className="stat-cal-legend" role="group" aria-label="Categories">
              <p className="stat-cal-legend-cap">Legend</p>
              {ACTS.map((act) => {
                const meta = ACT_META[act];
                const muted = mutedActs.has(act);
                return (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setMutedActs((prev) => toggleMutedAct(prev, act))}
                    title={meta.full}
                    aria-pressed={!muted}
                    className={cn('stat-cal-legend-row', muted && 'is-muted')}
                  >
                    <span
                      className={cn('stat-cal-legend-dot', muted ? 'bg-text-tertiary/40' : ACT_SWATCH[act].solid)}
                      aria-hidden
                    />
                    <span className="stat-cal-legend-name">{meta.label}</span>
                    <span className="stat-cal-legend-n">{actCounts[act]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {mode === 'maximized' ? (
        <StatutoryMaxiCalendar
          acts={ACTS}
          actCounts={actCounts}
          mutedActs={mutedActs}
          onToggleAct={(act) => setMutedActs((prev) => toggleMutedAct(prev, act))}
          onSetMutedActs={setMutedActs}
          scope={scope}
          scopes={SCOPES}
          onScopeChange={(next) => {
            setScope(next);
            setSelectedDay(null);
          }}
          viewMonth={viewMonth}
          monthLabel={monthLabel}
          canPrev={canPrev}
          canNext={canNext}
          onShiftMonth={shiftMonth}
          onJumpToday={jumpToToday}
          byDate={byDate}
          todayIso={todayIso}
          onMinimize={() => applyMode('minimized')}
        />
      ) : null}
    </div>
  );
}
