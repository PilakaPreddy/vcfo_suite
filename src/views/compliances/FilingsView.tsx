'use client';

import { GlossaryText } from '@/components/ask/GlossaryTerm';
import { WhatsThisButton } from '@/components/ask/WhatsThisButton';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, BellRing, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock, Download, ListChecks, Search, ShieldCheck } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { DashDonut, DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AreaPill } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { SkeletonRows } from '@/components/ui/empty-state';
import { FilterChip, FilterChipRow, type FilterRowChip } from '@/components/ui/filter-chip';
import { Term } from '@/components/ui/term';
import { initialsOf } from '@/components/ui/avatar-stack';
import type { BulkAction } from '@/components/ui/bulk-bar';
import { toastUndo } from '@/components/ui/undo-toast';
import { useQueryClient } from '@tanstack/react-query';
import { OnTimeColumns } from '@/components/compliances/OnTimeColumns';
import {
  PreIncorporationNotice,
} from '@/components/compliances/PreIncorporationNotice';
import { useApp } from '@/context/AppContext';
import { isFirmWideAdmin } from '@/lib/auth';
import { useFilings } from '@/hooks/use-filings';
import { useCompFilings } from '@/components/client-portal/pages/compliances/api';
import { errorMessage, toastError, toastInfo, toastSuccess } from '@/lib/toast-errors';
import type { PortalFiling } from '@/lib/client-portal/compliances';
import {
  buildMatrix,
  filingStatus,
  financialYearForDate,
  financialYearLabel,
  financialYearMonths,
  financialYearQuarters,
  monthKeyOf,
  parseFyParam,
  parseMonthParam,
  quarterForMonthKey,
  rowsInFinancialYear,
  sortByDueDate,
  todayIST,
  type FilingRow,
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
  CHART_STATUSES,
  FILING_WORD,
  STATUS_FILL,
  STATUS_STROKE,
  areaLabel,
  downloadCsv,
  emptyCounts,
  filingWord,
  plainDate,
  toCsv,
} from '@/lib/compliance/spectrum-status';
import {
  CompactChip,
  DateTile,
  FiledBar,
  FilingBand,
  FilterStrip,
  Swatch,
  WordChip,
  type StripItem,
} from '@/views/compliances/spectrum-parts';
import { areaSwatch } from '@/views/compliances/area-swatch';
import { FilingProofCell, FilingWindowCell } from '@/views/compliances/filing-actions';
import { useMayWriteFilings, useRegister } from '@/views/compliances/use-register';
import { CatFilterTabs } from '@/components/compliances/CategoryTabs';
import { FileBadge, fileType } from '@/components/ui/file-badge';
import { openTaskAttachment, useTasks, type TaskRowDto } from '@/views/compliances/tasks/api';
import { INTERNAL_AREA, fyRange, taskAsFilingRow, taskIdOfRow } from '@/views/compliances/tasks/task-calendar';
import { statHref, taskHref } from '@/views/compliances/tasks/task-list';
import { showStat, showTasks, type CatFilter } from '@/views/compliances/tasks/task-model';
import { GroupedGrid, HeadCard, KeyHint, useListKeys, type GridColumn, type GridGroup } from '@/views/compliances/grouped-grid';
import { ClientTile } from '@/views/compliances/identity';
import {
  BOARD_STATUS_OPTIONS,
  REGULATORS,
  boardWord,
  groupByClient,
  groupByFiling,
  isBoardPeriod,
  isBoardTile,
  matchesStatus,
  matchesTile,
  noteFor,
  onTimeByMonth,
  parseBoardStatus,
  parseRegulator,
  periodWindow,
  regulatorCounts,
  regulatorOf,
  stepAnchor,
  tileCounts,
  tileSubs,
  windowLabel,
  type BoardGroup,
  type BoardPeriod,
  type BoardTile,
} from '@/views/compliances/filings-board';

/** The register shows a Client column only while more than one company is on the sheet. */
type RegisterColumnsMode = { company: boolean };
const ONE_COMPANY: RegisterColumnsMode = { company: false };

/** The three views of the list (C-05): grouped by filing (default), grouped by client, or the flat register. */
type BoardTab = 'filing' | 'client' | 'all';

const TILE_LABEL: Record<Exclude<BoardTile, ''>, string> = {
  month: 'Due this month',
  filed: 'Filed this month',
  week: 'Due in 7 days',
  late: 'Overdue',
};

/** Staff roles that may send a client reminder (`POST /api/engagements/:id/remind`). */
const REMIND_ROLES = new Set(['super_admin', 'admin', 'manager', 'intern']);
const MAY_REOPEN_ROLES = new Set(['super_admin', 'admin', 'manager']);

/** Months in the "On time vs late" columns. */
const ON_TIME_MONTHS = 6;

/**
 * FILINGS — the compliance register, one view for every role (VCFO Spectrum
 * C-05 to C-07, C-0118, C-0121).
 *
 * The caller passes its shell's base path (so links stay inside that role's
 * routes) and the `scope` it already holds. WHAT it shows is decided by
 * `getFilings`, which scopes by `AuthContext` — the client's register and the
 * super admin's are this component reading the same rows.
 *
 * Layout (prototype FilingsScreen): a plain page head with the window as the
 * 28px title ("Sep to Oct 2026"), the FY, filing and client counts, and the
 * period controls (previous and next window, the FY stepper, Monthly /
 * Quarterly / Annual, Full year, Export, Calendar); underline tabs By filing
 * (default), By client and All filings; four KPI tiles with a line under each
 * that toggle their filter; a search box and filter chips for regulator,
 * status, lead and client; then the list. Monthly shows two months, Quarterly
 * the quarter and Annual the year, with filings of every cadence. "By filing"
 * bands each filing (one obligation and due date) with its client rows, "By
 * client" bands each company, and "All filings" is the flat register (with
 * row selection and the bulk bar), or, for a quarter or the year, the period
 * matrix. The rail has "On time vs late" (C4), "By area" for all six
 * regulators, and "Filings by status".
 *
 * URL state: `?tab=`, `?kpi=`, `?area=` (a regulator), `?status=`, `?lead=`,
 * `?company=`, `?cadence=` (the window), `?period=` (the anchor month),
 * `?fy=`, `?matrix=1`; the old `?view=year` opens the year matrix.
 *
 * The pre-COI notice appears for a company in `scope.preIncorporationIds`
 * (derived by the caller from `isIncorporated`); on "All companies" the
 * portfolio keeps its real rows and prints at most the one-line count.
 */
export function FilingsView({
  basePath,
  scope,
  hrefs,
}: {
  basePath: string;
  scope: ComplianceScope;
  /** Where a filing or a task opens when the shell has no obligation pages (super admin Practice). */
  hrefs?: { record?: (row: FilingRow) => string; task?: (t: TaskRowDto) => string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const now = useMemo(() => new Date(), []);
  const { user, internOptions, teamMembers } = useApp();
  const { engagements } = scope;
  const sole = soleCompany(engagements);

  const legacyYear = params.get('view') === 'year';
  const cadenceParam = params.get('cadence');
  const period: BoardPeriod = legacyYear ? 'annual' : isBoardPeriod(cadenceParam) ? cadenceParam : 'monthly';
  const matrixOn = legacyYear || params.get('matrix') === '1';
  const fyFromUrl = parseFyParam(params.get('fy'));
  const periodParam = parseMonthParam(params.get('period'));
  const companyId = sole ? sole.id : normaliseCompanyParam(params.get('company'), engagements);
  const tabParam = params.get('tab');
  const tab: BoardTab = tabParam === 'client' || tabParam === 'all' ? tabParam : 'filing';
  const tileParam = params.get('kpi');
  const tile: BoardTile = isBoardTile(tileParam) ? tileParam : '';
  const regulator = parseRegulator(params.get('area'));
  const status = parseBoardStatus(params.get('status'));
  const leadParam = params.get('lead')?.trim() ?? '';
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const currentFy = financialYearForDate(now);
  // A `?period=` month decides the FY it belongs to, so a calendar cross-link
  // lands on the right sheet without needing both params.
  const fyStartYear =
    fyFromUrl ?? (periodParam ? financialYearForDate(new Date(`${periodParam}-01T00:00:00Z`)).startYear : currentFy.startYear);
  const nowMonthKey = monthKeyOf(todayIST(now))!;
  const anchorKey = periodParam ?? nowMonthKey;

  const query_ = useFilings({ fyStartYear });
  // F-1: All, Statutory, Non-statutory (`?cat=`). F-2: a non-statutory row is a completed task with its deliverable.
  const catParam = params.get('cat');
  const cat: CatFilter = catParam === 'statutory' || catParam === 'non-statutory' ? catParam : 'all';
  const doneTasks = useTasks({ done: true, ...fyRange(fyStartYear) });
  const taskById = useMemo(() => new Map((doneTasks.data?.tasks ?? []).filter((t) => !t.hidden).map((t) => [t.id, t])), [doneTasks.data?.tasks]);
  const statRows = useMemo(() => query_.data?.rows ?? [], [query_.data?.rows]);
  const taskRows = useMemo(() => [...taskById.values()].map(taskAsFilingRow), [taskById]);
  // F-3: everything below (tiles, groups, donut, regulator bars) reads these rows, so it follows the filter.
  const allRows = useMemo(
    () => [...(showStat(cat) ? statRows : []), ...(showTasks(cat) ? taskRows : [])],
    [cat, statRows, taskRows],
  );
  // The side-table facts (ARN, data received, preparing, proofs) for the Note, Status and Proof columns.
  const facts = useCompFilings(fyStartYear);
  const details = useMemo(() => {
    const map = new Map<string, PortalFiling>();
    for (const f of facts.data?.rows ?? []) map.set(f.id, f);
    return map;
  }, [facts.data?.rows]);
  // This FY and the last, for the "On time vs late" months (the cache Obligations shares).
  const history = useRegister(now);

  const months = useMemo(() => financialYearMonths(fyStartYear), [fyStartYear]);
  const monthKeys = useMemo(() => months.map((m) => m.key), [months]);
  const quarters = useMemo(() => financialYearQuarters(fyStartYear), [fyStartYear]);
  const fyRows = useMemo(() => rowsInFinancialYear(allRows, fyStartYear), [allRows, fyStartYear]);
  const companyRows = useMemo(() => rowsForCompany(fyRows, companyId), [fyRows, companyId]);
  // The window in view: two months, the quarter, or the year, with filings of every cadence.
  const win = useMemo(() => periodWindow(monthKeys, period, anchorKey), [monthKeys, period, anchorKey]);
  const windowRows = useMemo(() => {
    const keys = new Set(win.keys);
    return companyRows.filter((row) => keys.has(monthKeyOf(row.dueDate) ?? ''));
  }, [companyRows, win]);
  // A KPI tile counts the company's whole sheet, so a picked tile replaces the period window.
  const baseRows = useMemo(
    () => (tile ? companyRows.filter((row) => matchesTile(row, tile, now)) : windowRows),
    [tile, companyRows, windowRows, now],
  );

  // Lead of each row: the engagement's lead, named from the team list.
  const leadIdOf = useMemo(() => new Map(engagements.map((e) => [e.id, e.internId ?? ''])), [engagements]);
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of [...internOptions, ...teamMembers]) if (p?.id && !map.has(p.id)) map.set(p.id, p.name);
    return map;
  }, [internOptions, teamMembers]);
  const leadName = (row: FilingRow) => people.get(leadIdOf.get(row.engagementId) ?? '') ?? '';
  const showLead = scope.audience === 'staff';
  const leadChip = showLead && user?.role !== 'intern';
  const leadOptions = useMemo(() => {
    const ids = new Set(baseRows.map((row) => leadIdOf.get(row.engagementId) ?? '').filter(Boolean));
    return [...ids]
      .map((id) => ({ value: id, label: people.get(id) ?? '' }))
      .filter((o) => o.label)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [baseRows, leadIdOf, people]);
  const lead = leadChip && leadOptions.some((o) => o.value === leadParam) ? leadParam : '';

  const chipMatch = (row: FilingRow, withRegulator = true) =>
    (!withRegulator || !regulator || regulatorOf(row) === regulator) &&
    matchesStatus(row, status, now, details.get(row.id)) &&
    (!lead || leadIdOf.get(row.engagementId) === lead) &&
    (!q || row.particular.toLowerCase().includes(q) || row.companyName.toLowerCase().includes(q));
  const shownRows = baseRows.filter((row) => chipMatch(row));
  // The matrices plot every period of the year, so they take the year's rows through the same filters.
  const matrixRows = companyRows.filter((row) => chipMatch(row));
  const mayMatrix = !tile && period !== 'monthly';
  const useMatrix = tab === 'all' && mayMatrix && matrixOn;

  const picked = pickedCompany(engagements, companyId);
  const pickedPreIncorporation = picked && scope.preIncorporationIds.has(picked.id) ? picked : null;
  const columnsMode: RegisterColumnsMode = { company: companyId === ALL_COMPANIES };

  const setParams = (next: Record<string, string | null>) => {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') search.delete(key);
      else search.set(key, value);
    }
    router.replace(`${basePath}/filings?${search.toString()}`, { scroll: false });
  };

  const prevAnchor = stepAnchor(monthKeys, period, win, -1);
  const nextAnchor = stepAnchor(monthKeys, period, win, 1);
  const step = (key: string | null) => {
    if (key) setParams({ period: key, fy: String(fyStartYear), view: null });
  };
  const pickPeriod = (next: BoardPeriod) =>
    setParams({ cadence: next === 'monthly' ? null : next, view: null, kpi: null, period: next === 'annual' ? null : win.keys[next === 'monthly' ? win.keys.length - 1 : 0] ?? null });

  const fyLabel = financialYearLabel(fyStartYear);
  const label = windowLabel(win, period, fyLabel);
  const listTitle = tile ? TILE_LABEL[tile] : tab === 'client' ? 'Clients' : 'Filings';
  const periodShort = tile ? TILE_LABEL[tile] : label;
  const calendarQuery = picked && !sole ? `?company=${picked.id}` : '';
  const exportRows = useMatrix ? matrixRows : shownRows;
  const windowFilings = new Set(windowRows.map((row) => `${row.obligationId}|${row.dueDate.slice(0, 10)}`)).size;
  const windowClients = new Set(windowRows.map((row) => row.engagementId)).size;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const counts = useMemo(() => {
    const c = emptyCounts();
    for (const row of baseRows) c[filingStatus(row, now)] += 1;
    return c;
  }, [baseRows, now]);

  // C-06: the four tiles count the company's sheet for this financial year.
  const kpi = useMemo(() => tileCounts(companyRows, now), [companyRows, now]);
  const subs = useMemo(() => tileSubs(companyRows, now), [companyRows, now]);
  const strip: StripItem[] = [
    { key: 'month', label: 'Due this month', value: kpi.month, Icon: CalendarDays, sub: subs.month },
    { key: 'filed', label: 'Filed', value: kpi.filed, Icon: CircleCheck, valueClass: 'text-positive', sub: subs.filed },
    { key: 'week', label: 'Due in 7 days', value: kpi.week, Icon: Clock, valueClass: 'text-warning', sub: subs.week },
    { key: 'late', label: 'Overdue', value: kpi.late, Icon: AlertTriangle, valueClass: 'text-danger', sub: subs.late },
  ];

  const byFiling = groupByFiling(baseRows, shownRows, now);
  const byClient = groupByClient(baseRows, shownRows, now);
  // The regulator bars ignore the regulator chip, so every bar stays a way to switch to it.
  const regulators = regulatorCounts(baseRows.filter((row) => chipMatch(row, false)), now);
  const historyRows = useMemo(() => rowsForCompany(history.rows, companyId), [history.rows, companyId]);
  const onTime = useMemo(() => onTimeByMonth(historyRows, now, ON_TIME_MONTHS), [historyRows, now]);
  const onTimeFiled = onTime.reduce((n, m) => n + m.onTime + m.late, 0);
  const onTimePct = onTimeFiled ? Math.round((onTime.reduce((n, m) => n + m.onTime, 0) / onTimeFiled) * 100) : null;

  const companySet = !sole && companyId !== ALL_COMPANIES;
  const anyFilter = !!(regulator || status || lead || tile || q || companySet);
  const clearAll = () => {
    setQuery('');
    setParams({ area: null, status: null, lead: null, kpi: null, company: null });
  };

  // A filing opens the statutory detail page of that client's period; a task row opens its task page.
  const recordHref = (row: FilingRow) => {
    const taskId = taskIdOfRow(row);
    const task = taskId ? taskById.get(taskId) : undefined;
    if (task) return hrefs?.task?.(task) ?? taskHref(basePath, task.id, task.boardMeetingId);
    return hrefs?.record?.(row) ?? statHref(basePath, row.obligationId, row.id);
  };
  // Category counts of the window in view (F-1).
  const inWindow = (row: FilingRow) => win.keys.includes(monthKeyOf(row.dueDate) ?? '') && (companyId === ALL_COMPANIES || row.engagementId === companyId);
  const catStat = statRows.filter(inWindow).length;
  const catTasks = taskRows.filter(inWindow).length;
  const internalRows = baseRows.filter((row) => row.compliance === INTERNAL_AREA && chipMatch(row, false));

  // E-01: Remind through the one-click reminder route, one filing at a time, then one toast.
  const mayRemind = scope.audience === 'staff' && REMIND_ROLES.has(user?.role ?? '');
  const [reminding, setReminding] = useState(false);
  const remindRows = async (rows: FilingRow[]) => {
    const open = rows.filter((row) => !row.filedOn);
    if (open.length === 0) {
      toastInfo(rows.length === 1 ? 'Already filed' : 'These filings are already filed');
      return;
    }
    setReminding(true);
    let sent = 0;
    let limited = 0;
    let failed = 0;
    for (const row of open) {
      try {
        const res = await fetch(`/api/engagements/${encodeURIComponent(row.engagementId)}/remind`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemKey: `filing:${row.id}` }),
        });
        if (res.ok) sent += 1;
        else if (res.status === 429) limited += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setReminding(false);
    const many = (n: number) => `${n} ${n === 1 ? 'filing' : 'filings'}`;
    const rest = [limited ? `${many(limited)} already reminded today` : '', failed ? `${many(failed)} could not be sent` : '']
      .filter(Boolean)
      .join(' · ');
    if (sent) toastSuccess(sent === 1 && open.length === 1 ? `Reminder sent · ${open[0]!.particular}` : `Reminders sent · ${many(sent)}`, rest || undefined);
    else if (failed) toastError('Could not send the reminders', rest);
    else toastInfo('Already reminded today', rest);
  };
  // E-01: Mark filed through PATCH /api/filings/:id/status (today's date). A manager or
  // admin may undo it, which reopens the same filings.
  const queryClient = useQueryClient();
  const [filing, setFiling] = useState(false);
  const setFiled = async (ids: string[], action: 'file' | 'reopen') => {
    let done = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/filings/${encodeURIComponent(id)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (res.ok) done += 1;
      } catch {
        /* counted as not done */
      }
    }
    await queryClient.invalidateQueries();
    return done;
  };
  const markFiledRows = async (rows: FilingRow[]) => {
    const open = rows.filter((row) => !row.filedOn);
    if (open.length === 0) {
      toastInfo(rows.length === 1 ? 'Already filed' : 'These filings are already filed');
      return;
    }
    setFiling(true);
    const ids = open.map((row) => row.id);
    const done = await setFiled(ids, 'file');
    setFiling(false);
    if (!done) {
      toastError('Could not mark the filings filed');
      return;
    }
    const text = done === 1 && open.length === 1 ? `Marked filed · ${open[0]!.particular}` : `Marked filed · ${done} filings`;
    if (MAY_REOPEN_ROLES.has(user?.role ?? '')) toastUndo(text, () => void setFiled(ids, 'reopen'));
    else toastSuccess(text);
  };
  const bulkActions = (picked: FilingRow[]): BulkAction[] => {
    // Task rows are done tasks: Remind and Mark filed act on filings only.
    const rows = picked.filter((row) => !taskIdOfRow(row));
    return bulkFor(rows, picked);
  };
  const bulkFor = (rows: FilingRow[], picked: FilingRow[]): BulkAction[] => [
    ...(mayRemind ? [{ key: 'remind', label: 'Remind', icon: BellRing, disabled: reminding, onClick: () => void remindRows(rows) }] : []),
    ...(mayRemind
      ? [{ key: 'filed', label: 'Mark filed', icon: CircleCheck, disabled: filing, onClick: () => void markFiledRows(rows) }]
      : []),
    {
      key: 'export',
      label: 'Export',
      icon: Download,
      onClick: () => downloadCsv(`filings-selected-${picked.length}.csv`, filingsCsv(picked, now, details)),
    },
  ];

  // The period controls of the page head (prototype Filings head).
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex gap-1.5">
        {/* The arrows run past the year's ends into the next or previous financial year. */}
        <Button
          size="icon"
          variant="outline"
          disabled={!!tile}
          onClick={() => (prevAnchor ? step(prevAnchor) : setParams({ fy: String(fyStartYear - 1), period: null }))}
          aria-label="Previous period"
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="outline"
          disabled={!!tile || (!nextAnchor && fyStartYear >= currentFy.startYear + 2)}
          onClick={() => (nextAnchor ? step(nextAnchor) : setParams({ fy: String(fyStartYear + 1), period: null }))}
          aria-label="Next period"
        >
          <ChevronRight aria-hidden />
        </Button>
      </span>
      <SpectrumTabs
        label="Filing period"
        items={[
          { key: 'monthly', label: 'Monthly' },
          { key: 'quarterly', label: 'Quarterly' },
          { key: 'annual', label: 'Annual' },
        ]}
        value={period}
        onChange={(next) => pickPeriod(next as BoardPeriod)}
      />
      <Button variant="outline" disabled={period === 'annual'} onClick={() => pickPeriod('annual')}>
        Full year
      </Button>
      <Button
        variant="outline"
        disabled={exportRows.length === 0}
        onClick={() => downloadCsv(`filings-${tile || (period === 'annual' ? fyStartYear : win.keys.join('_'))}.csv`, filingsCsv(exportRows, now, details))}
      >
        <Download aria-hidden />
        Export
      </Button>
      <Button variant="outline" asChild>
        <Link href={`${basePath}/calendar${calendarQuery}`}>
          <CalendarDays aria-hidden />
          Calendar
        </Link>
      </Button>
      {/* X-23: the activity master edit screen, for admin and super admin. */}
      {scope.audience === 'staff' && isFirmWideAdmin(user?.role) ? (
        <Button variant="outline" asChild>
          <Link href={`${basePath}/activities`}>
            <ListChecks aria-hidden />
            Activities
          </Link>
        </Button>
      ) : null}
    </div>
  );

  /* ---------- Client rows under a band ---------- */

  const actionCol: GridColumn<FilingRow> = {
    key: 'action',
    label: '',
    width: 104,
    align: 'right',
    className: 'hidden md:table-cell',
    render: (row) => <FilingAction row={row} now={now} href={recordHref(row)} />,
  };
  const statusCol: GridColumn<FilingRow> = { key: 'status', label: 'Status', width: 128, render: (row) => <WordChip filing word={boardWord(row, details.get(row.id), now)} /> };
  const noteCol: GridColumn<FilingRow> = {
    key: 'note',
    label: 'Note',
    width: 160,
    className: 'hidden md:table-cell',
    render: (row) => {
      const note = noteFor(row, details.get(row.id), now);
      const st = filingStatus(row, now);
      return note ? (
        <span className={cn('block max-w-[150px] truncate', st === 'overdue' ? 'font-medium text-danger' : st === 'due-soon' ? 'text-warning' : 'text-ink-2')} title={note}>
          {note}
        </span>
      ) : (
        <span className="text-ink-faint">—</span>
      );
    },
  };
  const leadCol: GridColumn<FilingRow> = {
    key: 'lead',
    label: 'Lead',
    width: 160,
    className: 'hidden md:table-cell',
    render: (row) => {
      const name = leadName(row);
      return name ? (
        <span className="inline-flex min-w-0 max-w-[150px] items-center gap-2">
          <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand-soft text-[11px] font-medium text-brand-text" aria-hidden>
            {initialsOf(name)}
          </span>
          <span className="min-w-0 truncate">{name}</span>
        </span>
      ) : (
        <span className="text-ink-faint">—</span>
      );
    },
  };
  const filingCols: GridColumn<FilingRow>[] = [
    {
      key: 'client',
      label: 'Filing · client',
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2.5 md:pl-[56px]">
          <ClientTile id={row.engagementId} name={row.companyName} />
          <span className="min-w-0 truncate font-medium text-ink">{row.companyName}</span>
        </span>
      ),
    },
    ...(showLead ? [leadCol] : []),
    noteCol,
    statusCol,
    actionCol,
  ];
  const clientCols: GridColumn<FilingRow>[] = [
    {
      key: 'filing',
      label: 'Client · filing',
      render: (row) => (
        <span className="block min-w-0 md:pl-[42px]">
          <b className="block truncate text-[14px] font-medium text-ink">{row.particular}</b>
          <span className="block truncate text-[12.5px] text-ink-muted">
            {[row.periodLabel, `due ${plainDate(row.dueDate, now)}`].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    { key: 'area', label: 'Area', width: 124, className: 'hidden md:table-cell', render: (row) => <AreaPill area={areaLabel(row.compliance)} /> },
    noteCol,
    statusCol,
    actionCol,
  ];

  const filingGroups: GridGroup<FilingRow>[] = byFiling.map((g: BoardGroup) => ({
    id: g.key,
    label: g.label,
    rows: g.rows,
    head: (
      <FilingBand
        iso={g.first.dueDate}
        status={g.status}
        name={<Term>{g.first.particular}</Term>}
        sub={[g.first.periodLabel, `due ${plainDate(g.first.dueDate, now)}`].filter(Boolean).join(' · ')}
        area={areaLabel(g.first.compliance)}
        filed={g.filed}
        total={g.total}
      />
    ),
  }));
  const clientGroups: GridGroup<FilingRow>[] = byClient.map((g: BoardGroup) => {
    const name = leadName(g.first);
    return {
      id: g.key,
      label: g.label,
      rows: g.rows,
      head: (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-2">
          <ClientTile id={g.first.engagementId} name={g.label} size={30} />
          <span className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
            <span className="truncate text-[14.5px] font-medium text-ink">{g.label}</span>
            {name ? <span className="text-[12.5px] text-ink-muted">Lead {name}</span> : null}
          </span>
          <FiledBar filed={g.filed} total={g.total} />
        </span>
      ),
    };
  });
  const groupCount = (groups: BoardGroup[]) => groups.filter((g) => g.rows.length > 0).length;

  const chips: FilterRowChip[] = [
    {
      key: 'area',
      set: !!regulator,
      node: (
        <FilterChip
          label="Regulator"
          value={regulator}
          options={REGULATORS.map((r) => ({ value: r.key, label: r.label }))}
          onChange={(v) => setParams({ area: v || null })}
        />
      ),
    },
    {
      key: 'status',
      set: !!status,
      node: <FilterChip label="Status" value={status} options={BOARD_STATUS_OPTIONS} onChange={(v) => setParams({ status: v || null })} />,
    },
    ...(leadChip && leadOptions.length > 0
      ? [
          {
            key: 'lead',
            set: !!lead,
            node: <FilterChip label="Lead" value={lead} options={leadOptions} onChange={(v) => setParams({ lead: v || null })} />,
          },
        ]
      : []),
    ...(sole
      ? []
      : [
          {
            key: 'client',
            set: companySet,
            node: (
              <FilterChip
                label="Client"
                value={companySet ? companyId : ''}
                options={engagements.map((e) => ({ value: e.id, label: e.companyName }))}
                onChange={(v) => setParams({ company: v || null })}
              />
            ),
          },
        ]),
  ];

  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useListKeys(listRef, searchRef);

  const matrixSwitch = mayMatrix && tab === 'all' ? (
    <SpectrumTabs
      label="Register layout"
      items={[
        { key: 'list', label: 'List' },
        { key: 'matrix', label: 'Matrix' },
      ]}
      value={useMatrix ? 'matrix' : 'list'}
      onChange={(v) => setParams({ matrix: v === 'matrix' ? '1' : null, view: null })}
    />
  ) : null;

  const loadingCard = (
    <HeadCard title={listTitle}>
      <div className="p-4" aria-busy="true" aria-label="Loading filings">
        <SkeletonRows rows={6} />
      </div>
    </HeadCard>
  );
  const errorCard = (
    <HeadCard title={listTitle}>
      <p className="px-4 py-6 text-center text-[13px] text-ink-muted">Could not load the register. Try again in a moment.</p>
    </HeadCard>
  );

  let list: ReactNode;
  if (query_.isPending) list = loadingCard;
  else if (query_.isError) list = errorCard;
  else if (tab === 'filing' || tab === 'client')
    list = (
      <GroupedGrid
        title={listTitle}
        columns={tab === 'filing' ? filingCols : clientCols}
        groups={tab === 'filing' ? filingGroups : clientGroups}
        rowKey={(row) => row.id}
        rowHref={recordHref}
        pageSize={60}
        empty={anyFilter ? 'No filings match' : EMPTY_REGISTER}
        footer={<KeyHint />}
      />
    );
  else
    list = (
      <HeadCard title={listTitle} count={exportRows.length} right={matrixSwitch}>
        {useMatrix && period === 'annual' ? (
          <PeriodMatrix
            rows={matrixRows}
            now={now}
            perCompany={columnsMode.company}
            columns={months.map((month) => ({
              key: month.key,
              label: month.shortLabel,
              emphasis: month.key === nowMonthKey,
            }))}
            periodOf={(row) => monthKeyOf(row.dueDate)}
          />
        ) : useMatrix && period === 'quarterly' ? (
          <PeriodMatrix
            rows={matrixRows}
            now={now}
            perCompany={columnsMode.company}
            showFiledRow
            columns={quarters.map((quarter) => ({
              key: quarter.key,
              label: quarter.label,
              sublabel: quarter.rangeLabel,
              emphasis: quarter.key === quarterForMonthKey(nowMonthKey, fyStartYear)?.key,
            }))}
            periodOf={(row) => {
              const key = monthKeyOf(row.dueDate);
              return key ? (quarterForMonthKey(key, fyStartYear)?.key ?? null) : null;
            }}
          />
        ) : (
          <RegisterTable
            rows={shownRows}
            now={now}
            basePath={basePath}
            details={details}
            tasks={taskById}
            recordHref={recordHref}
            numbered={period === 'annual' && !tile}
            mode={columnsMode}
            bulkActions={bulkActions}
            onClearFilters={anyFilter ? clearAll : undefined}
          />
        )}
      </HeadCard>
    );

  const donutTotal = CHART_STATUSES.reduce((n, s) => n + counts[s], 0);

  return (
    <PageTransition>
      <SEO
        title="Filings — VCFO Suite"
        description="The statutory filing register: monthly, quarterly and annual compliance sheets."
        path={`${basePath}/filings`}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {/* Plain page head: the window as a 28px title, a muted meta line, the period controls on the right. */}
        <header className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-[1_1_240px]">
            <h1 className="text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">{label}</h1>
            <p className="text-[13.5px] text-ink-muted">
              {fyLabel} · {plural(windowFilings, 'filing')} · {plural(windowClients, 'client')}
            </p>
          </div>
          {controls}
        </header>

        <SpectrumTabs
          variant="underline"
          label="Filings view"
          items={[
            { key: 'filing', label: 'By filing', count: query_.isPending ? undefined : groupCount(byFiling) },
            { key: 'client', label: 'By client', count: query_.isPending ? undefined : groupCount(byClient) },
            { key: 'all', label: 'All filings', count: query_.isPending ? undefined : exportRows.length },
          ]}
          value={tab}
          onChange={(next) => setParams({ tab: next === 'filing' ? null : next })}
        />

        <FilterStrip items={strip} value={tile} onChange={(k) => setParams({ kpi: k || null })} />

        {pickedPreIncorporation ? (
          <PreIncorporationNotice
            scope={{ audience: scope.audience, companyName: pickedPreIncorporation.companyName }}
          />
        ) : null}

        {/* The rail is narrower than the default 360 px, so the grouped grid keeps its five columns at 1440. */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid min-w-0 gap-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <CatFilterTabs value={cat} onChange={(c) => setParams({ cat: c === 'all' ? null : c })} stat={catStat} ns={catTasks} />
              <span className="relative w-full sm:w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" strokeWidth={1.6} aria-hidden />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search filings or clients"
                  aria-label="Search filings or clients"
                  className="h-9 pl-9"
                />
              </span>
              <FilterChipRow chips={chips} onClear={anyFilter ? clearAll : undefined} />
            </div>
            <div ref={listRef} className="min-w-0">
              {list}
            </div>
          </div>

          <div className="grid min-w-0 gap-5">
            <DashSection
              title="On time vs late"
              headIcon={{ icon: ShieldCheck, tone: 'green' }}
              meta={onTimePct === null ? undefined : `${onTimePct}% on time`}
              loading={history.isPending}
              loadingVariant="block"
            >
              {onTimeFiled ? (
                <OnTimeColumns data={onTime} />
              ) : (
                <p className="text-[13px] text-ink-faint">No filing recorded in the last {ON_TIME_MONTHS} months</p>
              )}
            </DashSection>
            <DashSection title="By area" meta={periodShort} loading={query_.isPending}>
              <div className="grid gap-1">
                {regulators.map((r) => {
                  const pct = r.total ? Math.round((r.filed / r.total) * 100) : 0;
                  const on = regulator === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setParams({ area: on ? null : r.key })}
                      aria-pressed={on}
                      aria-label={`${r.label}: ${r.filed} of ${r.total} filed. Filter by ${r.label}`}
                      className={cn(
                        '-mx-1.5 flex items-center gap-2.5 rounded-sm px-1.5 py-1 text-left hover:bg-surface-sunken',
                        on && 'bg-brand-soft',
                      )}
                    >
                      <Swatch className={areaSwatch(r.label)} />
                      <span className="flex-1 text-[13.5px] text-ink">{r.label}</span>
                      <span className={cn('text-[13px] tabular-nums', r.total ? 'text-ink-muted' : 'text-ink-faint')}>
                        {r.filed} / {r.total}
                      </span>
                      <span className="relative h-1.5 w-[90px] flex-none overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
                        <i className={cn('absolute inset-y-0 left-0 rounded-bar', areaSwatch(r.label))} style={{ width: `${pct}%` }} />
                      </span>
                    </button>
                  );
                })}
                {cat !== 'statutory' ? (
                  // Non-statutory work has no regulator; its row shows beside the six (F-3).
                  <span className="-mx-1.5 flex items-center gap-2.5 px-1.5 py-1" aria-label={`Internal: ${internalRows.length} done`}>
                    <i className="h-2 w-2 flex-none rounded-[2px] border-[1.5px] border-ink-2" aria-hidden />
                    <span className="flex-1 text-[13.5px] text-ink">Internal</span>
                    <span className="text-[13px] tabular-nums text-ink-muted">
                      {internalRows.length} / {internalRows.length}
                    </span>
                    <span className="relative h-1.5 w-[90px] flex-none overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
                      {internalRows.length ? <i className="absolute inset-y-0 left-0 w-full rounded-bar bg-ink-2" /> : null}
                    </span>
                  </span>
                ) : null}
              </div>
            </DashSection>
            <DashSection title="Filings by status" meta={periodShort} loading={query_.isPending}>
              <div className="flex items-center gap-4">
                <DashDonut
                  size={84}
                  centerLabel={donutTotal}
                  centerCaption="filings"
                  segments={
                    donutTotal
                      ? CHART_STATUSES.map((s) => ({ n: counts[s], color: STATUS_STROKE[s] }))
                      : [{ n: 1, color: 'oklch(var(--line-soft))' }]
                  }
                />
                <ul className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
                  {CHART_STATUSES.map((s) => (
                    <li key={s} className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
                      <Swatch className={STATUS_FILL[s]} />
                      <span className="flex-1">{s === 'filed' ? (cat === 'all' ? 'Filed or done' : cat === 'statutory' ? 'Filed' : 'Done') : s === 'upcoming' ? 'Upcoming' : FILING_WORD[s]}</span>
                      <b className="font-medium tabular-nums text-ink">{counts[s]}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </DashSection>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

/**
 * The row action of a client row (prototype `FilingAction`): "File now" on a
 * filing that is late, due soon or in progress, "Open" otherwise. Both open the
 * filing's record (the obligation page for that client), where the window,
 * proofs and ARN are set; there is no new write path here. A late row gets the
 * blurple main button, every other row the white one.
 */
function FilingAction({ row, now, href }: { row: FilingRow; now: Date; href: string }) {
  const st = filingStatus(row, now);
  const fileNow = st !== 'filed' && st !== 'upcoming';
  const label = fileNow ? 'File now' : 'Open';
  return (
    <Button size="sm" variant={st === 'overdue' ? 'default' : 'outline'} className="h-[30px]" asChild>
      <Link href={href} aria-label={`${label}: ${row.particular}${row.periodLabel ? ` ${row.periodLabel}` : ''}, ${row.companyName}`}>
        {label}
      </Link>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Register grid
// ---------------------------------------------------------------------------

const EMPTY_REGISTER = 'No filings in this period';

function filingsCsv(rows: FilingRow[], now: Date, details?: Map<string, PortalFiling>): string {
  return toCsv(
    ['Due', 'Client', 'Area', 'Filing', 'Period', 'Frequency', 'Filed on', 'Reference', 'Status', 'Proof files'],
    sortByDueDate(rows).map((row) => {
      const detail = details?.get(row.id);
      return [
        row.dueDate,
        row.companyName,
        areaLabel(row.compliance),
        row.particular,
        row.periodLabel,
        row.frequency,
        row.filedOn,
        detail?.acknowledgementNo?.trim() || '',
        details ? boardWord(row, detail, now) : filingWord(row, now),
        String(detail?.proofCount ?? 0),
      ];
    }),
  );
}

function RegisterTable({
  rows,
  now,
  basePath,
  details,
  tasks,
  recordHref,
  numbered,
  mode = ONE_COMPANY,
  bulkActions,
  onClearFilters,
}: {
  rows: FilingRow[];
  now: Date;
  basePath: string;
  /** The side-table facts (ARN, proofs) keyed by filing id. */
  details: Map<string, PortalFiling>;
  /** Done tasks by id (F-2): their rows show the deliverable instead of the window and proof. */
  tasks?: Map<string, TaskRowDto>;
  recordHref?: (row: FilingRow) => string;
  numbered?: boolean;
  mode?: RegisterColumnsMode;
  /** E-01: row selection and the bulk bar. */
  bulkActions?: (picked: FilingRow[]) => BulkAction[];
  onClearFilters?: () => void;
}) {
  const mayWrite = useMayWriteFilings();
  const ordered = useMemo(() => sortByDueDate(rows), [rows]);
  const slNo = new Map(ordered.map((row, index) => [row.id, index + 1]));

  const columns: EFilingColumn<FilingRow>[] = [];
  if (numbered) {
    columns.push({ key: 'sl', header: 'No.', width: '52px', render: (row) => <span className="tabular-nums text-ink-muted">{slNo.get(row.id)}</span> });
  }
  columns.push(
    {
      key: 'due',
      header: 'Due',
      width: '68px',
      render: (row) => (
        <Link href={`${basePath}/calendar?date=${row.dueDate}`} aria-label={`Open ${plainDate(row.dueDate, now)} in the calendar`} className="inline-flex py-1">
          <DateTile iso={row.dueDate} status={filingStatus(row, now)} />
        </Link>
      ),
    },
    { key: 'area', header: 'Area', width: '124px', render: (row) => <AreaPill area={areaLabel(row.compliance)} /> },
    {
      key: 'filing',
      header: 'Filing',
      width: '30%',
      render: (row) => (
        <span className="block min-w-0" data-ask-focus={row.id}>
          {taskIdOfRow(row) ? (
            <span className="flex min-w-0 items-center gap-1">
              {recordHref ? (
                <Link href={recordHref(row)} className="truncate text-[14px] font-medium text-ink hover:text-brand-text">
                  {row.particular}
                </Link>
              ) : (
                <span className="truncate text-[14px] font-medium text-ink">{row.particular}</span>
              )}
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1">
              <GlossaryText text={row.particular} className="truncate text-[14px] font-medium text-ink" />
              <WhatsThisButton compact kind="compliance" refId={row.obligationId} label={row.particular} />
            </span>
          )}
          <span className="block truncate text-[12.5px] text-ink-muted">
            {[row.periodLabel, row.authority].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
  );
  if (mode.company) {
    columns.push({ key: 'company', header: 'Client', width: '16%', render: (row) => <span className="text-ink">{row.companyName}</span> });
  }
  columns.push(
    { key: 'frequency', header: 'Frequency', width: '108px', render: (row) => <span className="capitalize">{row.frequency}</span> },
    {
      key: 'filed',
      header: 'Filed on',
      width: '104px',
      render: (row) => {
        const status = filingStatus(row, now);
        return (
          <span className={status === 'overdue' ? 'font-medium text-danger' : row.filedOn ? 'text-ink' : 'text-ink-muted'}>
            {status === 'overdue' && !row.filedOn ? 'Not filed' : plainDate(row.filedOn, now)}
          </span>
        );
      },
    },
    {
      key: 'window',
      header: 'Window',
      width: '176px',
      render: (row) =>
        taskIdOfRow(row) ? (
          <span className="text-[13px] text-ink-muted">
            {plainDate(row.windowFrom, now)} to {plainDate(row.windowTo, now)}
          </span>
        ) : (
          <FilingWindowCell row={row} mayWrite={mayWrite} />
        ),
    },
    { key: 'status', header: 'Status', width: '128px', render: (row) => <WordChip filing word={boardWord(row, details.get(row.id), now)} /> },
    {
      key: 'proof',
      header: 'Proof',
      width: '120px',
      align: 'right',
      render: (row) => {
        const taskId = taskIdOfRow(row);
        if (!taskId) return <FilingProofCell row={row} detail={details.get(row.id)} mayWrite={mayWrite} now={now} />;
        return <TaskDeliverable taskId={taskId} file={tasks?.get(taskId)?.deliverable ?? null} />;
      },
    },
  );

  return (
    <EFilingGrid
      caption="Filings"
      columns={columns}
      rows={ordered}
      rowKey={(row) => row.id}
      pageSize={25}
      minWidth={mode.company ? 1160 : 1020}
      empty={EMPTY_REGISTER}
      selectable={!!bulkActions}
      bulkActions={bulkActions}
      bulkNoun={['filing', 'filings']}
      onClearFilters={onClearFilters}
    />
  );
}

/** F-2: the file a done task delivers, opened through its short-lived link. */
function TaskDeliverable({ taskId, file }: { taskId: string; file: { id: string; fileName: string } | null }) {
  if (!file) return <span className="text-ink-faint">—</span>;
  return (
    <button
      type="button"
      title={file.fileName}
      aria-label={`Open ${file.fileName}`}
      onClick={() => void openTaskAttachment(taskId, file.id).catch((e: unknown) => toastError('Could not open the file', errorMessage(e)))}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md hover:text-brand-text"
    >
      <FileBadge type={fileType(file.fileName)} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// The deck matrix — rows = compliance, columns = period
// ---------------------------------------------------------------------------

function PeriodMatrix({
  rows,
  now,
  perCompany,
  columns,
  periodOf,
  showFiledRow = false,
}: {
  rows: FilingRow[];
  now: Date;
  perCompany: boolean;
  columns: { key: string; label: string; sublabel?: string; emphasis?: boolean }[];
  periodOf: (row: FilingRow) => string | null;
  /** Quarterly deck splits each row into Due date / Filing date sub-rows. */
  showFiledRow?: boolean;
}) {
  const matrix = buildMatrix(rows, columns.map((c) => c.key), periodOf, now, { perCompany });

  if (matrix.length === 0) {
    return <p className="px-4 py-6 text-center text-[13px] text-ink-muted">{EMPTY_REGISTER}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="grid-table min-w-[44rem]">
        <thead>
          <tr>
            <th scope="col">Compliance</th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn('!text-center', column.emphasis && '!text-brand-text')}>
                {column.label}
                {column.sublabel ? (
                  <span className="block text-[10px] font-medium normal-case tracking-normal text-ink-faint">{column.sublabel}</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="!h-auto !border-b-line-soft !py-2.5 !text-[14px] !font-medium !normal-case !tracking-normal !text-ink">
                <span className="block">{row.particular}</span>
                <span className="mt-0.5 block text-[12px] font-normal text-ink-muted">
                  {row.companyName ? `${row.companyName} · ` : ''}
                  {areaLabel(row.compliance)}
                </span>
              </th>
              {row.cells.map((cell, index) => (
                <td key={columns[index]?.key ?? index} className={cn('!h-auto py-2.5 text-center', columns[index]?.emphasis && 'bg-brand-soft/40')}>
                  {cell.status ? (
                    <span className="flex flex-col items-center gap-1">
                      <span className="text-[12px] tabular-nums text-ink">{plainDate(cell.dueDate, now)}</span>
                      {showFiledRow ? (
                        <span className={cn('text-[12px] tabular-nums', cell.filedOn ? 'text-positive' : 'text-ink-muted')}>
                          {cell.filedOn ? plainDate(cell.filedOn, now) : '—'}
                        </span>
                      ) : (
                        <CompactChip word={FILING_WORD[cell.status]} />
                      )}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
