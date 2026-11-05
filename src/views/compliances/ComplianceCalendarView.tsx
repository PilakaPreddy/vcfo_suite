'use client';

import { WhatsThisButton } from '@/components/ask/WhatsThisButton';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { StatutoryCalendar } from '@/components/admin/StatutoryCalendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AreaPill, Chip, REG_WORD, type ChipTone } from '@/components/ui/spectrum-chip';
import { regOf } from '@/lib/ui/regulator';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { SkeletonRows } from '@/components/ui/empty-state';
import {
  PreIncorporationNotice,
} from '@/components/compliances/PreIncorporationNotice';
import { useFilings } from '@/hooks/use-filings';
import { useCompFilings, useReminder } from '@/components/client-portal/pages/compliances/api';
import { areaOf, portalFor } from '@/lib/client-portal/compliances';
import {
  filingStatus,
  financialYearForDate,
  financialYearLabel,
  financialYearMonths,
  monthKeyForDate,
  monthKeyOf,
  monthLabelOf,
  parseIsoDate,
  rowsInMonth,
  sortByDueDate,
  todayIST,
  type FilingRow,
  type FilingStatus,
} from '@/lib/compliance/filings';
import { cn } from '@/lib/utils';
import {
  ALL_COMPANIES,
  normaliseCompanyParam,
  pickedCompany,
  rowsForCompany,
  soleCompany,
  type ComplianceScope,
} from '@/views/compliances/compliance-scope';
import {
  areaLabel,
  daysUntil,
  emptyCounts,
  FILING_WORD,
  filingWord,
  plainDate,
  SIX_TONE,
  STATUS_TILE,
  worstStatus,
  type SixWord,
} from '@/lib/compliance/spectrum-status';
import { DateTile, StatusDonutCard, WordChip } from '@/views/compliances/spectrum-parts';
import { MonthGrid, YearGrid, type CalendarMark } from '@/components/compliances/calendar-grids';
import { AreaShort, ClientDot, ClientTag } from '@/views/compliances/identity';
import { FilingWindows } from '@/views/compliances/filing-windows';
import { MonthNav } from '@/components/compliances/month-nav';
import { useMayWriteFilings } from '@/views/compliances/use-register';
import { CatFilterTabs } from '@/components/compliances/CategoryTabs';
import { UrgencyPill } from '@/components/compliances/TaskMarks';
import { useTasks, type TaskRowDto } from '@/views/compliances/tasks/api';
import { fyRange, taskAsFilingRow, taskHintOf, taskIdOfRow, taskStatus } from '@/views/compliances/tasks/task-calendar';
import { statHref, taskHref } from '@/views/compliances/tasks/task-list';
import { showStat, showTasks, type CatFilter } from '@/views/compliances/tasks/task-model';

type CalendarView = 'month' | 'year' | 'timeline' | 'statutory';
const ALL_AREAS = 'all';
const LONG_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * COMPLIANCE CALENDAR — the radar, one view for every role (VCFO Spectrum).
 *
 * A calendar bar (company, month picker, FY chip, area, view, a link to
 * Filings) sits above the register month grid, with the status donut, the
 * next deadline and the coming-up list in the right rail. A day opens a
 * popover with its filings. The year view shows the twelve months of the FY,
 * the timeline view draws the filing windows as bars that managers move
 * (`FilingWindows`), and the "Statutory" view keeps the firm's statutory month grid
 * (`StatutoryCalendar`: act legend, All / Overdue scope, keyboard grid,
 * full-screen mode). One company selection narrows all of them. Every shell
 * renders this exact layout; WHAT it shows is decided by `getFilings` through
 * `AuthContext` and by the roster in `scope`. Nothing is keyed off the role.
 *
 * `?date=` opens the month of that date with the day picked; `?company=`
 * starts on that company.
 *
 * Pre-incorporation is read off `scope` (derived by the caller from
 * `isIncorporated`, never a rule of this view's own). The grid stays in its
 * genuine empty state under the notice; nothing is invented to fill it.
 */
export function ComplianceCalendarView({
  basePath,
  scope,
  hrefs,
}: {
  basePath: string;
  scope: ComplianceScope;
  /** Where a filing or a task opens when the shell has no obligation pages (super admin Practice). */
  hrefs?: { record?: (row: FilingRow) => string; task?: (t: TaskRowDto) => string };
}) {
  const params = useSearchParams();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const todayIso = todayIST(now);
  const { engagements } = scope;
  const sole = soleCompany(engagements);

  const dateParam = parseIsoDate(params.get('date'));
  const [month, setMonth] = useState<Date>(() => firstOfMonth(dateParam ?? now));
  const [pickedDay, setPickedDay] = useState<string | null>(() => (dateParam ? dateParam.toISOString().slice(0, 10) : null));
  const [view, setView] = useState<CalendarView>('month');
  const [area, setArea] = useState<string>(ALL_AREAS);
  // C-1: All, Statutory, Non-statutory. The filter applies to every view and the rail (C-4).
  const [cat, setCat] = useState<CatFilter>('all');
  const [pickedId, setPickedId] = useState<string>(() => normaliseCompanyParam(params.get('company'), engagements));
  const companyId = sole ? sole.id : pickedId;
  const picked = pickedCompany(engagements, companyId);
  const pickedPreIncorporation = picked && scope.preIncorporationIds.has(picked.id) ? picked : null;

  const mayWrite = useMayWriteFilings();
  const fyStartYear = financialYearForDate(month).startYear;
  const query = useFilings({ fyStartYear });
  const scopedRows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const allRows = useMemo(() => rowsForCompany(scopedRows, companyId), [scopedRows, companyId]);
  const rows = useMemo(() => (showStat(cat) ? allRows : []), [allRows, cat]);

  // Non-statutory tasks of the financial year in view (C-3), by their end date.
  const range = fyRange(fyStartYear);
  const taskQuery = useTasks({ engagementId: companyId !== ALL_COMPANIES ? companyId : undefined, from: range.from, to: range.to });
  const allTasks = useMemo(() => (taskQuery.data?.tasks ?? []).filter((t) => !t.hidden), [taskQuery.data?.tasks]);

  const monthKey = monthKeyForDate(month);
  const nowKey = monthKeyForDate(now);
  const months = useMemo(() => financialYearMonths(fyStartYear), [fyStartYear]);
  const monthRows = useMemo(() => sortByDueDate(rowsInMonth(rows, monthKey)), [rows, monthKey]);

  // Area chips count what the view shows: this month in month view, the year otherwise.
  const counted = view === 'month' ? monthRows : rows;
  const areas = useMemo(() => [...new Set(counted.map((row) => row.compliance))].sort((a, b) => a.localeCompare(b)), [counted]);
  const areaOn = area !== ALL_AREAS && areas.includes(area) ? area : ALL_AREAS;
  const inArea = (row: FilingRow) => areaOn === ALL_AREAS || row.compliance === areaOn;
  // Tasks have no regulator: they show under the All area only.
  const tasks = useMemo(() => (showTasks(cat) && areaOn === ALL_AREAS ? allTasks : []), [allTasks, cat, areaOn]);
  const monthTasks = useMemo(() => tasks.filter((t) => t.dueDate.startsWith(monthKey)), [tasks, monthKey]);
  const statCount = (view === 'month' ? sortByDueDate(rowsInMonth(allRows, monthKey)) : allRows).length;
  const taskCount = (view === 'month' ? allTasks.filter((t) => t.dueDate.startsWith(monthKey)) : allTasks).length;
  const recordHref = (row: FilingRow) => hrefs?.record?.(row) ?? statHref(basePath, row.obligationId, row.id);
  const taskLink = (t: TaskRowDto) => hrefs?.task?.(t) ?? taskHref(basePath, t.id, t.boardMeetingId);

  const marks: CalendarMark[] = useMemo(
    () =>
      rows
        .filter((row) => areaOn === ALL_AREAS || row.compliance === areaOn)
        .map((row) => ({
        id: row.id,
        date: row.dueDate.slice(0, 10),
        label: row.particular,
        status: filingStatus(row, now),
      }))
        .concat(
          tasks.map((t) => ({
            id: `task-${t.id}`,
            date: t.dueDate.slice(0, 10),
            label: t.title,
            status: taskStatus(t, now),
            hollow: true,
            hint: taskHintOf(t, now),
          })),
        ),
    [rows, tasks, areaOn, now],
  );

  // The rail always reads this calendar month (the donut is "this month", R-25).
  const nowMonthCounts = useMemo(() => {
    const c = emptyCounts();
    for (const row of rowsInMonth(rows, nowKey)) c[filingStatus(row, now)] += 1;
    // A done task counts as filed, as in the prototype's donut.
    for (const t of tasks) if (t.dueDate.startsWith(nowKey)) c[taskStatus(t, now)] += 1;
    return c;
  }, [rows, tasks, nowKey, now]);
  const upcoming = useMemo(
    () => sortByDueDate(rows.filter((row) => !row.filedOn && row.dueDate.slice(0, 10) >= todayIso)),
    [rows, todayIso],
  );
  const upcomingTasks = useMemo(
    () => tasks.filter((t) => t.stage !== 'completed' && t.dueDate.slice(0, 10) >= todayIso).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks, todayIso],
  );
  const next = upcoming[0];
  const nextTask = upcomingTasks[0];
  // C-4: the next deadline is the earlier of the next filing and the next task.
  const nextIsTask = Boolean(nextTask && (!next || nextTask.dueDate.slice(0, 10) < next.dueDate.slice(0, 10)));
  // "Remind me": the caller's own reminder on the next deadline (existing route, scoped in the repository).
  const facts = useCompFilings(fyStartYear);
  const reminder = useReminder();
  const nextReminder = next ? (facts.data?.rows.find((f) => f.id === next.id)?.reminderOn ?? null) : null;
  const late = useMemo(() => sortByDueDate(rows.filter((row) => filingStatus(row, now) === 'overdue'))[0], [rows, now]);

  const companyQuery = !sole && companyId !== ALL_COMPANIES ? `&company=${companyId}` : '';
  const showCompany = companyId === ALL_COMPANIES;
  const filingsHref = (row?: FilingRow) =>
    row
      ? `${basePath}/filings?cadence=monthly&period=${monthKeyOf(row.dueDate)}${companyQuery}`
      : `${basePath}/filings${companyQuery ? `?${companyQuery.slice(1)}` : ''}`;

  // A filing opens its record: the statutory detail page of that client's period (S-2).
  const factOf = (row: FilingRow) => facts.data?.rows.find((f) => f.id === row.id);

  const listRows = monthRows.filter(inArea);
  const dayRows = (day: string) => listRows.filter((row) => row.dueDate.slice(0, 10) === day);
  const dayTasks = (day: string) => monthTasks.filter((t) => t.dueDate.slice(0, 10) === day);

  return (
    <PageTransition>
      <SEO
        title="Compliance calendar — VCFO Suite"
        description="Statutory filing obligations plotted by due date."
        path={`${basePath}/calendar`}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <h1 className="sr-only">Compliance calendar</h1>

        {/* Calendar bar: company, month, FY, area, view and the way to Filings. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {sole ? null : (
            <Select value={companyId} onValueChange={setPickedId}>
              <SelectTrigger aria-label="Company" className="h-8 w-auto min-w-[150px] max-w-[220px] flex-none gap-2 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_COMPANIES}>All companies</SelectItem>
                {engagements.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <CatFilterTabs value={cat} onChange={setCat} stat={statCount} ns={taskCount} className="flex-none" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn(view !== 'month' && 'invisible')} aria-hidden={view !== 'month' || undefined}>
            <MonthNav
              value={monthKey}
              now={nowKey}
              onChange={(key) => {
                setMonth(new Date(`${key}-01T00:00:00Z`));
                setPickedDay(null);
              }}
            />
          </span>
          <span className="inline-flex h-8 flex-none items-center rounded-md bg-warning-soft px-2 text-[12px] font-medium text-warning">
            {financialYearLabel(fyStartYear)}
          </span>
          {cat === 'non-statutory' ? null : (
            <SpectrumTabs
              label="Filter by area"
              className="min-w-0"
              items={[
                { key: ALL_AREAS, label: 'All', count: counted.length },
                ...areas.map((a) => ({ key: a, label: regOf(a) ? REG_WORD[regOf(a)!] : areaLabel(a), count: counted.filter((row) => row.compliance === a).length })),
              ]}
              value={areaOn}
              onChange={setArea}
            />
          )}
          <span className="ml-auto flex flex-none flex-wrap items-center gap-1.5">
            <SpectrumTabs
              label="Calendar view"
              items={[
                { key: 'month', label: 'Month' },
                { key: 'year', label: 'Year' },
                { key: 'timeline', label: 'Timeline' },
                // The firm's act grid; named "By act" so it does not read like the Statutory filter (C-1).
                { key: 'statutory', label: 'By act' },
              ]}
              value={view}
              onChange={(v) => setView(v as CalendarView)}
            />
            <Button size="sm" variant="secondary" className="h-8" asChild>
              <Link href={filingsHref()}>
                <FileText aria-hidden />
                Filings
              </Link>
            </Button>
          </span>
        </div>

        {view !== 'statutory' ? (
          pickedPreIncorporation ? (
            <PreIncorporationNotice scope={{ audience: scope.audience, companyName: pickedPreIncorporation.companyName }} />
          ) : null
        ) : null}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-4">
            {view === 'statutory' ? (
              <StatutoryCalendar
                engagements={engagements}
                companyId={companyId}
                onCompanyChange={setPickedId}
                audience={scope.audience}
              />
            ) : query.isPending ? (
              <div className="surface p-4" aria-busy="true" aria-label="Loading calendar">
                <SkeletonRows rows={6} />
              </div>
            ) : view === 'timeline' ? (
              <>
                {showStat(cat) ? (
                  <div className="surface min-w-0 p-3">
                    <FilingWindows
                      rows={rows.filter(inArea)}
                      fyStartYear={fyStartYear}
                      todayIso={todayIso}
                      now={now}
                      mayWrite={mayWrite}
                      hrefOf={recordHref}
                    />
                  </div>
                ) : null}
                {tasks.length ? (
                  <section className="surface min-w-0 p-3" aria-label="Non-statutory tasks">
                    {/* Tasks run from the start date to the end date; read-only here, the task page edits them. */}
                    <FilingWindows
                      rows={tasks.map(taskAsFilingRow)}
                      fyStartYear={fyStartYear}
                      todayIso={todayIso}
                      now={now}
                      mayWrite={false}
                      hrefOf={(row) => {
                        const t = tasks.find((x) => x.id === taskIdOfRow(row));
                        return t ? taskLink(t) : basePath;
                      }}
                    />
                  </section>
                ) : null}
              </>
            ) : view === 'year' ? (
              <div className="surface min-w-0 p-3">
                <YearGrid
                  months={months}
                  marks={marks}
                  todayIso={todayIso}
                  onPick={(key) => {
                    setMonth(new Date(`${key}-01T00:00:00Z`));
                    setPickedDay(null);
                    setView('month');
                  }}
                />
              </div>
            ) : (
              <div className="surface min-w-0 p-3">
                <MonthGrid
                  year={month.getUTCFullYear()}
                  month={month.getUTCMonth()}
                  todayIso={todayIso}
                  marks={marks}
                  picked={pickedDay}
                  onPick={setPickedDay}
                  dayTitle={(day) => <DayHead day={day} rows={dayRows(day)} tasks={dayTasks(day)} now={now} />}
                  dayBody={(day) => (
                    <ul>
                      {dayRows(day).map((row) => (
                        <PopRow key={row.id} row={row} now={now} href={recordHref(row)} />
                      ))}
                      {dayTasks(day).map((t) => (
                        <TaskPopRow key={`task-${t.id}`} task={t} now={now} href={taskLink(t)} />
                      ))}
                    </ul>
                  )}
                />
              </div>
            )}
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1">
            <StatusDonutCard counts={nowMonthCounts} caption={LONG_MON[now.getUTCMonth()]!.slice(0, 3)} label="This month by status" />
            {nextIsTask && nextTask ? (
              <NextTaskCard task={nextTask} now={now} showCompany={showCompany} href={taskLink(nextTask)} />
            ) : next ? (
              <NextDeadlineCard
                row={next}
                now={now}
                showCompany={showCompany}
                onOpen={() => router.push(recordHref(next))}
                dataReceivedOn={factOf(next)?.dataReceivedOn ?? null}
                factsLoaded={Boolean(facts.data)}
                late={late}
                lateHref={late ? recordHref(late) : undefined}
                reminderOn={nextReminder}
                reminderBusy={reminder.set.isPending || reminder.clear.isPending}
                onRemind={() => reminder.set.mutate(next.id)}
                onClearReminder={() => reminder.clear.mutate(next.id)}
              />
            ) : null}
            <div className="md:col-span-2 lg:col-span-1">
              <ComingUpCard rows={upcoming} tasks={upcomingTasks} now={now} showCompany={showCompany} hrefOf={recordHref} taskHrefOf={taskLink} />
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function DayRow({ row, now, href, showCompany }: { row: FilingRow; now: Date; href: string; showCompany: boolean }) {
  return (
    <li className="flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-2 first:border-t-0" data-ask-focus={row.id}>
      <DateTile iso={row.dueDate} status={filingStatus(row, now)} />
      <AreaPill area={areaLabel(row.compliance)} className="hidden sm:inline-flex" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1">
          <Link href={href} className="block truncate text-[14px] font-medium text-ink hover:text-brand-text">
            {row.particular}
          </Link>
          <WhatsThisButton compact kind="compliance" refId={row.obligationId} label={row.particular} />
        </span>
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-ink-muted">
          {showCompany ? (
            <>
              <ClientDot id={row.engagementId} />
              <span className="truncate">{row.companyName} · </span>
            </>
          ) : null}
          <span className="truncate">
            {row.periodLabel ? `${row.periodLabel} · ` : ''}
            due {plainDate(row.dueDate, now)}
          </span>
        </span>
      </span>
      <WordChip filing word={filingWord(row, now)} />
    </li>
  );
}

/** 44 x 48 px date tile of the calendar rail and popover: the day over the weekday. */
function CalDateTile({ iso, status, className }: { iso: string; status: FilingStatus; className?: string }) {
  const d = parseIsoDate(iso);
  return (
    <span className={cn('grid h-12 w-11 flex-none place-content-center rounded-md text-center leading-none', STATUS_TILE[status], className)} aria-hidden>
      <b className="text-[18px] font-medium tabular-nums">{d ? d.getUTCDate() : '—'}</b>
      <small className="mt-1 text-[11px] font-medium opacity-85">{d ? SHORT_DOW[d.getUTCDay()] : ''}</small>
    </span>
  );
}

/** The dot-only status chip for narrow rails; the word stays for screen readers. */
function DotChip({ word }: { word: SixWord }) {
  const tone: ChipTone = SIX_TONE[word];
  return (
    <span title={word} className={cn('inline-flex h-6 w-6 flex-none items-center justify-center rounded-md', DOT_SOFT[tone])}>
      <i className={cn('h-[7px] w-[7px] rounded-[2px]', DOT_MID[tone])} aria-hidden />
      <span className="sr-only">{word}</span>
    </span>
  );
}

const DOT_SOFT: Partial<Record<ChipTone, string>> = {
  ok: 'bg-positive-soft',
  warn: 'bg-warning-soft',
  bad: 'bg-danger-soft',
  idle: 'bg-surface-sunken',
  prog: 'bg-brand-soft',
  teal: 'bg-waiting-soft',
};
const DOT_MID: Partial<Record<ChipTone, string>> = {
  ok: 'bg-positive-mid',
  warn: 'bg-warning-mid',
  bad: 'bg-danger-mid',
  idle: 'bg-upcoming-mid',
  prog: 'bg-brand',
  teal: 'bg-waiting-mid',
};

/** The day popover head: a date tile, the long date and the count. */
function DayHead({ day, rows, tasks = [], now }: { day: string; rows: FilingRow[]; tasks?: TaskRowDto[]; now: Date }) {
  const d = parseIsoDate(day)!;
  const all = [...rows.map((row) => filingStatus(row, now)), ...tasks.map((t) => taskStatus(t, now))];
  const status = all.length ? worstStatus(all) : 'upcoming';
  const count = rows.length + tasks.length;
  return (
    <span className="flex items-center gap-2.5">
      <CalDateTile iso={day} status={status} className="h-11 w-10" />
      <span className="min-w-0">
        <b className="block text-[14px] font-medium">
          {LONG_DOW[d.getUTCDay()]} {d.getUTCDate()} {LONG_MON[d.getUTCMonth()]}
        </b>
        <span className="block text-[12px] font-normal text-ink-muted">
          {tasks.length === 0 ? (count === 1 ? '1 filing' : `${count} filings`) : count === 1 ? '1 item' : `${count} items`}
        </span>
      </span>
    </span>
  );
}

/** One filing of a day popover: area short tag, the filing, the client with its dot, and the status chip. */
function PopRow({ row, now, href }: { row: FilingRow; now: Date; href: string }) {
  return (
    <li className="border-t border-line-soft first:border-t-0">
      <Link href={href} className="flex items-center gap-2 px-4 py-2 hover:bg-surface-sunken">
        <AreaShort area={areaLabel(row.compliance)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">
            {row.particular}
            {row.periodLabel ? ` · ${row.periodLabel}` : ''}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
            <ClientDot id={row.engagementId} />
            <span className="truncate">{row.companyName}</span>
          </span>
        </span>
        <WordChip filing word={filingWord(row, now)} />
      </Link>
    </li>
  );
}

/** The hollow 8 px square of a non-statutory task (C-3). */
function TaskSquare() {
  return <i className="h-2 w-2 flex-none rounded-[2px] border-[1.5px] border-ink-2" aria-hidden />;
}

/** One task of a day popover: the hollow square, the task, its client, the start and urgency, and the status chip. */
function TaskPopRow({ task, now, href }: { task: TaskRowDto; now: Date; href: string }) {
  return (
    <li className="border-t border-line-soft first:border-t-0">
      <Link href={href} className="flex items-center gap-2 px-4 py-2 hover:bg-surface-sunken" title={taskHintOf(task, now)}>
        <span className="grid w-[34px] flex-none place-items-center">
          <TaskSquare />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{task.title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
            <ClientDot id={task.engagementId} />
            <span className="truncate">
              {task.companyName} · {taskHintOf(task, now)}
            </span>
          </span>
        </span>
        <WordChip word={task.word} />
      </Link>
    </li>
  );
}

/** One task of the month list, beside the filings. */
function TaskDayRow({ task, now, href, showCompany }: { task: TaskRowDto; now: Date; href: string; showCompany: boolean }) {
  return (
    <li className="flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-2 first:border-t-0" title={taskHintOf(task, now)}>
      <DateTile iso={task.dueDate} status={taskStatus(task, now)} />
      <UrgencyPill urgency={task.urgency} className="hidden sm:inline-flex" />
      <span className="min-w-0 flex-1">
        <Link href={href} className="flex min-w-0 items-center gap-1.5 truncate text-[14px] font-medium text-ink hover:text-brand-text">
          <TaskSquare />
          <span className="truncate">{task.title}</span>
        </Link>
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-ink-muted">
          {showCompany ? (
            <>
              <ClientDot id={task.engagementId} />
              <span className="truncate">{task.companyName} · </span>
            </>
          ) : null}
          <span className="truncate">
            starts {plainDate(task.startDate, now)} · ends {plainDate(task.dueDate, now)}
          </span>
        </span>
      </span>
      <WordChip word={task.word} />
    </li>
  );
}

/** The next deadline when it is a task: days left, the task, its client and a way in. */
function NextTaskCard({ task, now, showCompany, href }: { task: TaskRowDto; now: Date; showCompany: boolean; href: string }) {
  const days = daysUntil(task.dueDate, now) ?? 0;
  return (
    <section className="surface overflow-hidden" aria-label="Next deadline">
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
          <i className="h-1.5 w-1.5 rounded-[2px] bg-highlight-bright" aria-hidden />
          Next deadline
        </div>
        <div className="mt-2.5 flex items-center gap-3.5">
          <Link
            href={href}
            className="grid h-[62px] w-[58px] flex-none place-content-center rounded-md bg-surface-sunken text-center leading-none text-ink hover:bg-line-soft"
            aria-label={`${days} days left · open ${task.title}`}
          >
            <b className="text-[28px] font-medium tabular-nums">{days}</b>
            <small className="mt-1 text-[11px] font-medium tracking-wide text-ink-muted">{days === 1 ? 'DAY' : 'DAYS'}</small>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[18px] font-medium leading-tight tracking-tight text-ink" title={task.title}>
              {task.title}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <UrgencyPill urgency={task.urgency} />
              {showCompany ? <ClientTag id={task.engagementId} name={task.companyName} /> : null}
            </div>
          </div>
        </div>
        <div className="mt-3.5 flex gap-2">
          <Button size="sm" className="flex-1" asChild>
            <Link href={href}>
              Open task
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/** The government portal of a filing, opened in a new tab. */
function PortalLink({ row }: { row: FilingRow }) {
  const [label, href] = portalFor({ area: areaOf(row.authority, row.compliance), name: row.particular });
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-grid h-6 w-6 flex-none place-items-center rounded-sm text-ink-faint hover:bg-surface-sunken hover:text-brand-text"
      aria-label={`Open ${label}`}
      title={`Open ${label}`}
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
    </a>
  );
}

/** The next unfiled due date: a days tile, the filing with its portal, its area, data state and client, and a late line. */
function NextDeadlineCard({
  row,
  now,
  showCompany,
  onOpen,
  dataReceivedOn,
  factsLoaded,
  late,
  lateHref,
  reminderOn,
  reminderBusy,
  onRemind,
  onClearReminder,
}: {
  row: FilingRow;
  now: Date;
  showCompany: boolean;
  onOpen: () => void;
  /** The day the client's data came in (filing facts), or null. */
  dataReceivedOn: string | null;
  /** The state chip shows only once the facts have loaded. */
  factsLoaded: boolean;
  late?: FilingRow;
  lateHref?: string;
  reminderOn: string | null;
  reminderBusy: boolean;
  onRemind: () => void;
  onClearReminder: () => void;
}) {
  const days = daysUntil(row.dueDate, now) ?? 0;
  const lateDays = late ? -(daysUntil(late.dueDate, now) ?? 0) : 0;
  const received = Boolean(dataReceivedOn) || row.rawStatus === 'in-progress';
  return (
    <section className="surface overflow-hidden" aria-label="Next deadline">
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
          <i className="h-1.5 w-1.5 rounded-[2px] bg-highlight-bright" aria-hidden />
          Next deadline
        </div>
        <div className="mt-2.5 flex items-center gap-3.5">
          <button
            type="button"
            onClick={onOpen}
            className="grid h-[62px] w-[58px] flex-none place-content-center rounded-md bg-surface-sunken text-center leading-none text-ink hover:bg-line-soft"
            aria-label={`${days} days left · open ${row.particular}`}
          >
            <b className="text-[28px] font-medium tabular-nums">{days}</b>
            <small className="mt-1 text-[11px] font-medium tracking-wide text-ink-muted">{days === 1 ? 'DAY' : 'DAYS'}</small>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1 text-[18px] font-medium leading-tight tracking-tight text-ink" title={row.particular}>
              <span className="truncate">{row.particular}</span>
              <PortalLink row={row} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <AreaShort area={areaLabel(row.compliance)} />
              {factsLoaded ? (
                <Chip tone={received ? 'ok' : 'warn'} className="h-5 min-w-0 px-1.5 text-[11.5px]">
                  {received ? 'Data received' : `Data from ${shortName(row.companyName)}`}
                </Chip>
              ) : null}
              {showCompany ? <ClientTag id={row.engagementId} name={row.companyName} /> : null}
            </div>
          </div>
        </div>
        <div className="mt-3.5 flex gap-2">
          <Button size="sm" className="flex-1" onClick={onOpen}>
            Open filing
            <ArrowRight aria-hidden />
          </Button>
          {reminderOn ? (
            <button type="button" onClick={onClearReminder} disabled={reminderBusy} title="Turn the reminder off" className="disabled:opacity-50">
              <Chip tone="ok" className="h-[30px]">{`Reminder ${plainDate(reminderOn, now)}`}</Chip>
            </button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onRemind} disabled={reminderBusy}>
              Remind me
            </Button>
          )}
        </div>
      </div>
      {late && lateHref ? (
        <Link href={lateHref} className="flex w-full items-center gap-2 border-t border-line-soft px-4 py-2.5 text-left text-[12.5px] hover:bg-surface-sunken">
          <i className="h-2 w-2 flex-none rounded-[2px] bg-danger-mid" aria-hidden />
          <b className="truncate font-medium text-ink">
            {late.particular}
            {showCompany ? ` · ${late.companyName}` : ''}
          </b>
          <span className="flex-none font-medium text-danger">
            {lateDays} day{lateDays === 1 ? '' : 's'} late
          </span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 flex-none text-ink-muted" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}

/** "Northwind Pvt Ltd" reads "Northwind" in tight spots. */
function shortName(name: string): string {
  return name.replace(/\s+(India\s+)?(Private|Pvt\.?)\s+(Limited|Ltd\.?)$/i, '').replace(/\s+(LLP|Limited|Ltd\.?)$/i, '');
}

interface ComingItem {
  key: string;
  day: string;
  name: string;
  /** Text after the name: the client, or "n clients". */
  who: string | null;
  href: string;
  /** Null for a task: it has no regulator and shows the hollow square. */
  area: string | null;
  hint?: string;
  status: FilingStatus;
  word: SixWord;
}

/**
 * Coming up: up to seven filings, one date tile per day. One filing that falls
 * due for several clients on one day is one row, "Filing · n clients".
 */
function ComingUpCard({
  rows,
  tasks = [],
  now,
  showCompany,
  hrefOf,
  taskHrefOf,
}: {
  rows: FilingRow[];
  tasks?: TaskRowDto[];
  now: Date;
  showCompany: boolean;
  hrefOf: (row: FilingRow) => string;
  taskHrefOf?: (t: TaskRowDto) => string;
}) {
  const items: ComingItem[] = [];
  // Filings and tasks in one date order (C-4); a filing comes before a task on the same day.
  type Entry = { kind: 'row'; row: FilingRow; day: string } | { kind: 'task'; task: TaskRowDto; day: string };
  const entries: Entry[] = [
    ...rows.map((row) => ({ kind: 'row' as const, row, day: row.dueDate.slice(0, 10) })),
    ...tasks.map((task) => ({ kind: 'task' as const, task, day: task.dueDate.slice(0, 10) })),
  ].sort((a, b) => a.day.localeCompare(b.day) || (a.kind === b.kind ? 0 : a.kind === 'row' ? -1 : 1));
  for (const e of entries) {
    if (e.kind === 'task') {
      if (items.length >= 7) break;
      const t = e.task;
      items.push({
        key: `task-${t.id}`,
        day: e.day,
        name: t.title,
        who: showCompany ? shortName(t.companyName) : null,
        href: taskHrefOf?.(t) ?? '#',
        area: null,
        hint: taskHintOf(t, now),
        status: taskStatus(t, now),
        word: t.word,
      });
      continue;
    }
    const row = e.row;
    const day = row.dueDate.slice(0, 10);
    const status = filingStatus(row, now);
    const hit = items.find((x) => x.day === day && x.name === row.particular);
    if (hit) {
      const n = rows.filter((r) => r.dueDate.slice(0, 10) === day && r.particular === row.particular).length;
      hit.who = `${n} clients`;
      hit.status = worstStatus([hit.status, status]);
      hit.word = FILING_WORD[hit.status];
    } else {
      if (items.length >= 7) break;
      items.push({
        key: row.id,
        day,
        name: row.particular,
        who: showCompany ? shortName(row.companyName) : null,
        href: hrefOf(row),
        area: areaLabel(row.compliance),
        status,
        word: filingWord(row, now),
      });
    }
  }
  const days: Array<[string, ComingItem[]]> = [];
  for (const it of items) {
    const last = days[days.length - 1];
    if (last && last[0] === it.day) last[1].push(it);
    else days.push([it.day, [it]]);
  }
  return (
    <section className="surface px-4 pb-1.5 pt-3.5" aria-label="Coming up">
      <div className="mb-1 flex items-center gap-2 border-b border-line-soft pb-2">
        <h2 className="flex-1 text-[13px] font-medium text-ink">Coming up</h2>
        <span className="text-[11px] text-ink-muted">{items.length}</span>
      </div>
      {days.length === 0 ? (
        <p className="py-3 text-[13px] text-ink-faint">None</p>
      ) : (
        days.map(([d, list]) => (
          <div key={d} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 first:border-t-0">
            <CalDateTile iso={d} status={worstStatus(list.map((x) => x.status))} />
            <ul className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
              {list.map((x) => (
                <li key={x.key} className="min-w-0">
                  <Link href={x.href} title={x.hint} className="flex w-full min-w-0 items-center gap-2 text-left hover:text-brand-text">
                    {x.area ? (
                      <AreaShort area={x.area} />
                    ) : (
                      <span className="grid w-[34px] flex-none place-items-center">
                        <TaskSquare />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      <span>{x.name}</span>
                      {x.who ? <span className="font-normal text-ink-muted"> · {x.who}</span> : null}
                    </span>
                    <DotChip word={x.word} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
