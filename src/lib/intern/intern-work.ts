/**
 * Lead cockpit — classify intern steps, filings, and document requests
 * into action / overdue / waiting / due-this-week work items.
 */
import { sep } from '@/lib/date-format';
import { addDays, differenceInDays, differenceInHours } from 'date-fns';
import { checklist, getItem, type ChecklistItem } from '@/data/checklist';
import type { ComplianceFiling } from '@/data/compliance';
import { formatWindow, windowForStep } from '@/lib/projects/schedule-windows';
import type { DocRequest, Engagement, TaskInstance } from '@/data/engagements';
import {
  getReviewStatus,
  isReviewAccepted,
  isReviewRejected,
} from '@/lib/checklist/checklist-item-review';
import { computeDueDate } from '@/lib/projects/deadlines';
import { columnOfTaskStatus, orderColumn } from '@/lib/work/board-moves';
import {
  internOverviewCurrentItemInPhase,
  internOverviewPhases,
  internPhaseProgressPercent,
  internPhaseStepCounts,
} from '@/lib/intern/intern-overview-progress';
import {
  buildInternPortfolioQueue,
  type InternQueueItem,
} from '@/lib/intern/intern-dashboard';
import { internEngagementPath, internEngagementStepPath } from '@/lib/projects/project-step-path';
import { deriveStuckReason } from '@/lib/projects/project-stuck';
import { gateActiveCatalog } from '@/lib/checklist/checklist-step-gate';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { isDirectFlowStep, isDirectFlowStepComplete } from '@/lib/incorporation/pre-inc-direct-flow';

export type InternChipTone =
  | 'primary'
  | 'danger'
  | 'success'
  | 'info'
  | 'warning'
  | 'highlight'
  | 'neutral'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'teal'
  | 'sky'
  | 'violet'
  | 'pink'
  | 'cyan';

const IST = 'Asia/Kolkata';
export const INTERN_TASKS_PATH = '/app/intern/tasks';
const INTERN_FOCUS_STORAGE_PREFIX = 'vcfo.intern.focus.';
const INTERN_QUEUE_EXPANDED_STORAGE_PREFIX = 'vcfo.intern.queue.expanded.';
export const INTERN_WORK_VIEW_KEY = 'vcfo.intern.workView';

type InternWorkSource = 'step' | 'filing' | 'request' | 'task';
type InternWorkKind =
  | 'rejected'
  | 'review'
  | 'deliver'
  | 'overdue'
  | 'in-progress'
  | 'waiting-client'
  | 'waiting-manager'
  | 'waiting-request'
  | 'filing'
  /** A task a manager assigned (G-12), or a client question handed to the lead. */
  | 'task'
  | 'done';

export type InternWorkFocus = 'all' | 'action' | 'overdue' | 'waiting' | 'due' | 'progress' | 'done';
export type InternWorkTag =
  | 'rejected'
  | 'review'
  | 'deliver'
  | 'critical'
  | 'overdue'
  | 'client'
  | 'manager'
  | 'filings'
  | 'steps';
export type InternWorkKindFilter = 'all' | 'steps' | 'filings';
export type InternWorkView = 'list' | 'board' | 'tl';
export type InternWorkBoardColumn = 'action' | 'progress' | 'waiting' | 'done';
export type InternWorkCtaAction = 'open' | 'nudge-manager' | 'remind-client' | 'complete-task';

export interface InternWorkItem {
  id: string;
  source: InternWorkSource;
  engagementId: string;
  companyName: string;
  title: string;
  kind: InternWorkKind;
  href: string;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  ageLabel?: string;
  why: string;
  isOverdue: boolean;
  isCritical: boolean;
  catalogId?: string;
  filingId?: string;
  requestId?: string;
  /** `tasks.id` for a task item. */
  taskId?: string;
  catalogLabel?: string;
  /** Manager-set window, as quiet mono metadata (`formatWindow`). Absent when unset. */
  windowLabel?: string;
  /** The manager-set window itself (`YYYY-MM-DD` ends), for a date-change request from the calendar. */
  window?: { from: string; to: string };
  /** A task item's stored status, which picks its board column (M6 G1). */
  taskStatus?: TaskInstance['status'];
  /** A task item's place in its board column (`tasks.sort_order`). */
  sortOrder?: number | null;
}

export interface InternWorkKpis {
  action: { total: number; rejected: number; review: number; deliver: number };
  overdue: { total: number; critical: number; overdue: number };
  waiting: { total: number; client: number; manager: number };
  dueWeek: { total: number; filings: number; steps: number };
  doneToday: number;
  openCount: number;
  companyCount: number;
}

export interface InternWorkFilters {
  focus?: InternWorkFocus;
  tag?: InternWorkTag | null;
  companyId?: string | null;
  kind?: InternWorkKindFilter;
  /** IST calendar day `YYYY-MM-DD` — week-strip / timeline day filter. */
  day?: string | null;
}

const ACTIVE_IDS = new Set(checklist.map((item) => item.id));

export function internFirstName(name: string | null | undefined): string {
  const token = name?.trim().split(/\s+/)[0];
  return token || 'there';
}

/** Primary intern_id or engagement_leads membership. */
export function internAssignedToEngagement(
  engagement: Pick<Engagement, 'internId' | 'leadIds'>,
  internId: string,
): boolean {
  if (!internId) return false;
  if (engagement.internId === internId) return true;
  const leadIds = engagement.leadIds;
  return Array.isArray(leadIds) && leadIds.includes(internId);
}

export function internGreeting(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function internGreetingHour(now: Date): number {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: IST }).format(now),
  );
  return Number.isFinite(hour) ? hour : now.getHours();
}

export function internPaceLine(doneToday: number, actionRemaining: number): string {
  if (actionRemaining <= 0 && doneToday <= 0) return 'queue is clear — enjoy the quiet';
  if (actionRemaining <= 0) return 'that is the lot — well closed';
  if (doneToday === 0) return 'start with the reddest card';
  if (doneToday >= actionRemaining) return 'strong close if you keep this up';
  return 'nice pace, keep going';
}

export function ymdInIst(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST });
}

export function parseIstNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00+05:30`);
}

function istWeekdayMon0(date: Date): number {
  const wd = sep(date.toLocaleDateString('en-US', { weekday: 'short', timeZone: IST }));
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[wd] ?? 0;
}

/** Monday of the IST week containing `now`. */
function istMondayYmd(now: Date): string {
  const today = ymdInIst(now);
  const offset = istWeekdayMon0(now);
  return ymdInIst(addDays(parseIstNoon(today), -offset));
}

export function istWeekYmds(now: Date, days = 7): string[] {
  const monday = parseIstNoon(istMondayYmd(now));
  return Array.from({ length: days }, (_, i) => ymdInIst(addDays(monday, i)));
}

function isYmdThisIstWeek(ymd: string, now: Date): boolean {
  const day = ymdFromIsoInIst(ymd);
  return Boolean(day && istWeekYmds(now, 7).includes(day));
}

const IST_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Calendar date in Asia/Kolkata for an ISO timestamp or `YYYY-MM-DD`.
 * Date-only strings stay on that civil day (not UTC-midnight shifted).
 */
export function ymdFromIsoInIst(iso: string | undefined | null): string | undefined {
  if (!iso) return undefined;
  const trimmed = iso.trim();
  const dateOnly = IST_YMD_RE.exec(trimmed);
  const ymd = dateOnly ? `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}` : undefined;
  if (trimmed.length === 10 && ymd) return ymd;
  const tail = trimmed.length > 10 ? trimmed.slice(10) : '';
  if (ymd && tail.startsWith('T') && !/[zZ]|[+-]\d{2}/.test(tail)) return ymd;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return ymd;
  return ymdInIst(d);
}

export function formatIstWeekdayDay(ymd: string): { weekday: string; day: number; label: string } {
  const d = parseIstNoon(ymd);
  const weekday = sep(d.toLocaleDateString('en-US', { weekday: 'short', timeZone: IST }));
  const day = Number(ymd.slice(8, 10));
  return { weekday, day, label: `${weekday} ${day}` };
}

function formatIstDayMonth(ymd: string): string {
  return sep(parseIstNoon(ymd).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: IST,
  }));
}

export type WeekChipKind = 'filing' | 'step' | 'nudge' | 'done';

// A nudge due is the one orange moment on the week strip: it is the thing that needs the lead.
const WEEK_CHIP_TONE: Record<WeekChipKind, InternChipTone> = {
  filing: 'danger',
  step: 'primary',
  nudge: 'warning',
  done: 'success',
};

/** Which legend bucket an item belongs in on the week strip / timeline. */
function internWeekMarkKind(item: InternWorkItem): WeekChipKind | null {
  if (item.kind === 'done') return 'done';
  if (item.source === 'filing') return 'filing';
  if (
    item.kind === 'waiting-manager' ||
    item.kind === 'waiting-client' ||
    item.kind === 'waiting-request'
  ) {
    return 'nudge';
  }
  if (item.source === 'step') return 'step';
  return null;
}

/**
 * IST day this item should appear on a week/timeline grid.
 * Due/complete dates in the window stay on that day; overdue or undated open
 * work lands on today so the rail matches Waiting On / filings that already exist.
 */
export function internWeekAnchorYmd(
  item: InternWorkItem,
  todayYmd: string,
  weekYmds?: Iterable<string>,
): string | null {
  const week = weekYmds === undefined ? null : new Set(weekYmds);
  const allowed = (ymd: string | undefined): ymd is string =>
    Boolean(ymd) && (week === null || week.has(ymd));

  if (item.kind === 'done') {
    const done = ymdFromIsoInIst(item.completedAt);
    return allowed(done) ? done : null;
  }

  const due = ymdFromIsoInIst(item.dueAt);
  if (due && due > todayYmd) return allowed(due) ? due : null;
  if (allowed(todayYmd) && (!due || due <= todayYmd)) return todayYmd;
  return allowed(due) ? due : null;
}

export function internWorkItemsForDay(
  items: InternWorkItem[],
  ymd: string,
  todayYmd: string,
  weekYmds?: Iterable<string>,
): InternWorkItem[] {
  const week = weekYmds ?? istWeekYmds(parseIstNoon(todayYmd), 7);
  return sortInternWork(items.filter((item) => internWeekAnchorYmd(item, todayYmd, week) === ymd));
}

function catalogShortLabel(item: ChecklistItem): string {
  const m = /^(pre|post)-(\d+)$/i.exec(item.id);
  if (m?.[1] === 'pre') return `Pre-${m[2]}`;
  if (m?.[1] === 'post') return `Post-${m[2]}`;
  return item.title;
}

export function internWorkStepTitle(item: ChecklistItem): string {
  const short = catalogShortLabel(item);
  if (short === item.title) return item.title;
  return `${short} · ${item.title}`;
}

function ageLabelFrom(fromIso: string | undefined, now: Date, mode: 'age' | 'day'): string | undefined {
  if (!fromIso) return undefined;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return undefined;
  if (mode === 'day') {
    const days = Math.max(1, differenceInDays(now, from) + 1);
    return `Day ${days}`;
  }
  const hours = Math.max(0, differenceInHours(now, from));
  if (hours < 24) {
    const h = Math.max(1, hours);
    return `${h} hr${h === 1 ? '' : 's'}`;
  }
  const days = Math.max(1, differenceInDays(now, from));
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function formatDueLabel(dueAt: string | undefined, now: Date): string {
  if (!dueAt) return '—';
  const ymd = ymdFromIsoInIst(dueAt);
  if (!ymd) return '—';
  const today = ymdInIst(now);
  if (ymd === today) return 'today';
  const due = parseIstNoon(ymd);
  if (Number.isNaN(due.getTime())) return '—';
  return formatIstDayMonth(ymd);
}

function internWorkHref(opts: {
  source: InternWorkSource;
  engagement: Pick<Engagement, 'id' | 'slug'>;
  catalogId?: string;
}): string {
  if (opts.source === 'filing') return '/app/intern/compliances/calendar';
  if (opts.source === 'request' || opts.source === 'task') return internEngagementPath(opts.engagement);
  const item = opts.catalogId ? getItem(opts.catalogId) : undefined;
  if (item) return internEngagementStepPath(opts.engagement, item);
  return internEngagementPath(opts.engagement);
}

function daysLate(dueAt: string | undefined, now: Date): number {
  const ymd = ymdFromIsoInIst(dueAt);
  if (!ymd) return 0;
  return differenceInDays(parseIstNoon(ymdInIst(now)), parseIstNoon(ymd));
}

function isCriticalOverdue(opts: {
  isOverdue: boolean;
  urgent?: boolean;
  dueAt?: string;
  penaltyRisk?: ComplianceFiling['penaltyRisk'];
  now: Date;
}): boolean {
  if (!opts.isOverdue) return false;
  if (opts.urgent) return true;
  if (opts.penaltyRisk === 'high') return true;
  return daysLate(opts.dueAt, opts.now) >= 7;
}

function classifyStepKind(
  queueItem: InternQueueItem,
  slice: ChecklistItemStateSlice | undefined,
  item: ChecklistItem,
): InternWorkKind | null {
  if (queueItem.status === 'not-applicable') return null;
  if (queueItem.isLocked && queueItem.status !== 'completed') return null;
  // Direct flow: Submit completes the step; old review states read as done.
  if (isDirectFlowStep(item.id)) {
    if (isDirectFlowStepComplete(item.id, slice)) return 'done';
    if (queueItem.isOverdue) return 'overdue';
    return 'in-progress';
  }

  const formallyDelivered = Boolean(slice?.deliveredToClientAt?.trim());
  if (isReviewRejected(slice)) return 'rejected';
  if (formallyDelivered) return 'done';
  if (isReviewAccepted(slice)) return 'deliver';

  const review = getReviewStatus(slice);
  if (review === 'reviewing' && slice?.reviewSource !== 'lead_manager_request') return 'review';
  if (review === 'reviewing' && slice?.reviewSource === 'lead_manager_request') {
    return 'waiting-manager';
  }
  if (queueItem.status === 'completed') return 'done';
  if (queueItem.isOverdue) return 'overdue';
  if (queueItem.status === 'awaiting-client') return 'waiting-client';
  if (queueItem.status === 'in-progress') return 'in-progress';
  if (queueItem.status === 'not-started') {
    return item.responsibleRole === 'client' ? 'waiting-client' : 'in-progress';
  }
  return 'in-progress';
}

function whyForKind(kind: InternWorkKind, age?: string): string {
  switch (kind) {
    case 'rejected':
      return 'Rejected — fix';
    case 'review':
      return 'Client submitted — review';
    case 'deliver':
      return 'Accepted — deliver';
    case 'overdue':
      return age ? `${age} · overdue` : 'Overdue';
    case 'in-progress':
      return age ?? 'In progress';
    case 'waiting-client':
      return age ? `Waiting client · ${age}` : 'Waiting on the client';
    case 'waiting-manager':
      return age ? `Waiting manager · ${age}` : 'Waiting on manager';
    case 'waiting-request':
      return age ? `Client · ${age}` : 'Document request';
    case 'filing':
      return 'Filing';
    case 'task':
      return age ? `Assigned task · ${age}` : 'Assigned task';
    case 'done':
      return 'Done';
  }
}

function ctaForKind(kind: InternWorkKind): { label: string; variant: 'solid' | 'ghost'; action: InternWorkCtaAction } {
  switch (kind) {
    case 'rejected':
      return { label: 'Open step', variant: 'solid', action: 'open' };
    case 'review':
      return { label: 'Review', variant: 'ghost', action: 'open' };
    case 'deliver':
      return { label: 'Deliver', variant: 'ghost', action: 'open' };
    case 'overdue':
    case 'in-progress':
      return { label: 'Continue', variant: 'ghost', action: 'open' };
    case 'waiting-manager':
      return { label: 'Email manager again', variant: 'ghost', action: 'nudge-manager' };
    case 'waiting-client':
      return { label: 'Send reminder', variant: 'ghost', action: 'remind-client' };
    case 'waiting-request':
      return { label: 'Open company', variant: 'ghost', action: 'open' };
    case 'filing':
      return { label: 'Open filing', variant: 'ghost', action: 'open' };
    case 'task':
      return { label: 'Mark done', variant: 'ghost', action: 'complete-task' };
    case 'done':
      return { label: 'Open', variant: 'ghost', action: 'open' };
  }
}

export function internWorkCta(item: InternWorkItem) {
  return ctaForKind(item.kind);
}

function internWorkBoardColumn(item: InternWorkItem, now = new Date()): InternWorkBoardColumn {
  switch (item.kind) {
    case 'rejected':
    case 'review':
    case 'deliver':
      return 'action';
    case 'filing':
      return item.isOverdue || daysLate(item.dueAt, now) >= -2 ? 'action' : 'progress';
    case 'task':
      return columnOfTaskStatus(item.taskStatus);
    case 'overdue':
    case 'in-progress':
      return 'progress';
    case 'waiting-client':
    case 'waiting-manager':
    case 'waiting-request':
      return 'waiting';
    case 'done':
      return 'done';
  }
}

function filingKind(
  filing: ComplianceFiling,
  now: Date,
): InternWorkKind | null {
  const dueYmd = ymdFromIsoInIst(filing.nextDue) ?? filing.nextDue.slice(0, 10);
  const thisWeek = isYmdThisIstWeek(dueYmd, now);
  if (filing.status === 'filed') {
    return thisWeek ? 'done' : null;
  }
  if (filing.status === 'overdue') return 'filing';
  if (thisWeek || filing.status === 'in-progress') return 'filing';
  const due = parseIstNoon(dueYmd);
  const today = parseIstNoon(ymdInIst(now));
  if (differenceInDays(due, today) <= 2 && differenceInDays(due, today) >= 0) return 'filing';
  return null;
}

/**
 * The lead who owns a step: the step's `assigneeId` when it names a lead on the engagement
 * (set by a reassign, G-18), otherwise null, meaning every lead on the engagement shares it.
 */
export function stepOwnerLead(
  engagement: Pick<Engagement, 'internId' | 'leadIds'>,
  slice: Pick<ChecklistItemStateSlice, 'assigneeId'> | undefined,
): string | null {
  const owner = slice?.assigneeId?.trim();
  if (!owner) return null;
  const onEngagement = engagement.internId === owner || (engagement.leadIds ?? []).includes(owner);
  return onEngagement ? owner : null;
}

/**
 * A task row as a work item (G-12): a task a manager assigned, or a client question handed to
 * the lead. Checklist-step task rows (with a `checklistKey`) are the step items instead, so
 * they return null. A done task shows only in the week it was finished.
 */
export function buildTaskWorkItem(
  task: TaskInstance,
  engagement: Pick<Engagement, 'id' | 'slug' | 'companyName'>,
  now: Date,
): InternWorkItem | null {
  if (task.checklistKey?.trim()) return null;
  const done = task.status === 'completed';
  // `completedAt` (tasks.completed_at) when it was kept; older rows fall back to the last change.
  const finishedAt = task.completedAt ?? task.updatedAt;
  if (done) {
    const doneYmd = ymdFromIsoInIst(finishedAt);
    if (!doneYmd || !new Set(istWeekYmds(now, 7)).has(doneYmd)) return null;
  }
  const dueAt = ymdFromIsoInIst(task.dueAt);
  const overdue = !done && Boolean(dueAt) && dueAt! < ymdInIst(now);
  return {
    id: `task:${task.id}`,
    source: 'task',
    engagementId: engagement.id,
    companyName: engagement.companyName,
    title: task.title?.trim() || 'Task',
    kind: done ? 'done' : 'task',
    href: internWorkHref({ source: 'task', engagement }),
    dueAt,
    completedAt: done ? finishedAt : undefined,
    why: done ? 'Done' : overdue ? 'Assigned task · overdue' : whyForKind('task'),
    isOverdue: overdue,
    isCritical: false,
    taskId: task.id,
    taskStatus: task.status,
    ...(task.sortOrder != null ? { sortOrder: task.sortOrder } : {}),
  };
}

export function buildInternWorkItems(opts: {
  engagements: Engagement[];
  getChecklistState: (engagement: Engagement) => Record<string, ChecklistItemStateSlice>;
  internId: string;
  filings?: ComplianceFiling[];
  /** Manager-set compliance windows keyed by the client-side filing id. */
  filingWindows?: Record<string, { from: string; to: string }>;
  requests?: DocRequest[];
  /** Task rows assigned to this lead (`/api/tasks`, filtered by the caller to the lead). */
  tasks?: TaskInstance[];
  /**
   * Only the steps this lead owns through a reassign (`stepOwnerLead`). The team views use it
   * for a co-lead, so steps everyone shares are not listed twice.
   */
  ownedStepsOnly?: boolean;
  now?: Date;
}): InternWorkItem[] {
  const now = opts.now ?? new Date();
  const todayYmd = ymdInIst(now);
  const weekYmds = new Set(istWeekYmds(now, 7));
  const byId = new Map(opts.engagements.map((e) => [e.id, e]));
  const queue = buildInternPortfolioQueue(
    opts.engagements,
    opts.getChecklistState,
    opts.internId,
  );
  const queueByKey = new Map(queue.map((q) => [`${q.engagementId}:${q.checklistKey}`, q]));
  const out: InternWorkItem[] = [];

  for (const engagement of opts.engagements) {
    if (!internAssignedToEngagement(engagement, opts.internId)) continue;
    const state = opts.getChecklistState(engagement);
    const incYmd = ymdFromIsoInIst(engagement.incorporationDate);
    const incorporation = incYmd ? parseIstNoon(incYmd) : null;

    for (const def of checklist) {
      if (!ACTIVE_IDS.has(def.id)) continue;
      const q = queueByKey.get(`${engagement.id}:${def.id}`);
      if (!q) continue;
      const slice = state[def.id];
      // A step reassigned to another lead on this engagement is theirs alone (G-18).
      const owner = stepOwnerLead(engagement, slice);
      if (owner ? owner !== opts.internId : opts.ownedStepsOnly) continue;
      const kind = classifyStepKind(q, slice, def);
      if (!kind) continue;

      const completedAt = slice?.completedOn || slice?.deliveredToClientAt;
      if (kind === 'done') {
        const doneYmd = ymdFromIsoInIst(completedAt);
        if (!doneYmd || !weekYmds.has(doneYmd)) continue;
      }

      // A manager-set window replaces the statutory rule as the step's due
      // date. The queue already dropped locked steps, so a window on a future
      // step never badges it overdue.
      const window = windowForStep(engagement.schedule, def.id);
      const dueDate = computeDueDate(def.deadline, incorporation);
      const dueAt = window?.to ?? (dueDate ? ymdInIst(dueDate) : undefined);
      const startedAt = slice?.clientSubmittedAt || slice?.reviewedAt || engagement.createdAt;
      const overdue = q.isOverdue || (Boolean(dueAt) && dueAt < todayYmd && kind !== 'done');
      const age =
        kind === 'in-progress' || kind === 'overdue'
          ? ageLabelFrom(startedAt, now, 'day')
          : ageLabelFrom(slice?.clientSubmittedAt || slice?.reviewedAt, now, 'age');

      out.push({
        id: `step:${engagement.id}:${def.id}`,
        source: 'step',
        engagementId: engagement.id,
        companyName: engagement.companyName,
        title: internWorkStepTitle(def),
        kind,
        href: internWorkHref({ source: 'step', engagement, catalogId: def.id }),
        dueAt,
        startedAt,
        completedAt,
        ageLabel: kind === 'done' ? undefined : age,
        why: whyForKind(kind, age),
        isOverdue: overdue && kind !== 'done',
        isCritical: isCriticalOverdue({
          isOverdue: overdue && kind !== 'done',
          urgent: def.urgent,
          dueAt,
          now,
        }),
        catalogId: def.id,
        catalogLabel: catalogShortLabel(def),
        ...(window ? { windowLabel: formatWindow(window), window: { from: window.from, to: window.to } } : {}),
      });
    }
  }

  for (const filing of opts.filings ?? []) {
    const engagement = byId.get(filing.engagementId);
    if (!engagement || !internAssignedToEngagement(engagement, opts.internId)) continue;
    const kind = filingKind(filing, now);
    if (!kind) continue;
    const dueAt = ymdFromIsoInIst(filing.nextDue) ?? filing.nextDue.slice(0, 10);
    const overdue = filing.status === 'overdue' || dueAt < todayYmd;
    const days = differenceInDays(parseIstNoon(dueAt), parseIstNoon(todayYmd));
    const why =
      kind === 'done'
        ? 'Filed'
        : overdue
          ? 'Overdue'
          : days === 0
            ? 'Due today'
            : days > 0
              ? `Due ${formatIstDayMonth(dueAt)}`
              : 'Filing';

    out.push({
      id: `filing:${filing.id}`,
      source: 'filing',
      engagementId: engagement.id,
      companyName: engagement.companyName,
      title: `${filing.filing}${filing.periodLabel ? ` · ${filing.periodLabel}` : ''}`,
      kind,
      href: internWorkHref({ source: 'filing', engagement }),
      dueAt,
      completedAt: kind === 'done' ? dueAt : undefined,
      why,
      isOverdue: overdue && kind !== 'done',
      isCritical: isCriticalOverdue({
        isOverdue: overdue && kind !== 'done',
        penaltyRisk: filing.penaltyRisk,
        dueAt,
        now,
      }),
      filingId: filing.id,
      ...(opts.filingWindows?.[filing.id]
        ? { windowLabel: formatWindow(opts.filingWindows[filing.id]!), window: { ...opts.filingWindows[filing.id]! } }
        : {}),
    });
  }

  for (const request of opts.requests ?? []) {
    if (request.status !== 'pending') continue;
    const engagement = byId.get(request.engagementId);
    if (!engagement || !internAssignedToEngagement(engagement, opts.internId)) continue;
    const age = ageLabelFrom(request.uploadedAt, now, 'age');
    out.push({
      id: `request:${request.id}`,
      source: 'request',
      engagementId: engagement.id,
      companyName: engagement.companyName,
      title: request.label,
      kind: 'waiting-request',
      href: internWorkHref({ source: 'request', engagement }),
      dueAt: ymdFromIsoInIst(request.dueAt) ?? request.dueAt,
      startedAt: request.uploadedAt,
      ageLabel: age,
      why: whyForKind('waiting-request', age),
      isOverdue: false,
      isCritical: false,
      requestId: request.id,
    });
  }

  for (const task of opts.tasks ?? []) {
    const engagement = byId.get(task.engagementId);
    if (!engagement || !internAssignedToEngagement(engagement, opts.internId)) continue;
    const item = buildTaskWorkItem(task, engagement, now);
    if (item) out.push(item);
  }

  return out;
}

export function internWorkKpis(items: InternWorkItem[], now: Date): InternWorkKpis {
  const today = ymdInIst(now);
  const week = new Set(istWeekYmds(now, 7));
  const actionKinds = new Set<InternWorkKind>(['rejected', 'review', 'deliver']);
  const action = items.filter(
    (i) =>
      actionKinds.has(i.kind) ||
      i.kind === 'task' ||
      (i.source === 'filing' && i.kind === 'filing' && internWorkBoardColumn(i, now) === 'action'),
  );
  const overdueItems = items.filter((i) => i.source === 'step' && i.isOverdue && i.kind !== 'done');
  const waiting = items.filter(
    (i) =>
      i.kind === 'waiting-client' ||
      i.kind === 'waiting-manager' ||
      i.kind === 'waiting-request',
  );
  const dueWeek = items.filter((i) => {
    const due = ymdFromIsoInIst(i.dueAt);
    return i.kind !== 'done' && Boolean(due && week.has(due));
  });
  const doneToday = items.filter(
    (i) => i.kind === 'done' && ymdFromIsoInIst(i.completedAt) === today,
  ).length;
  const companies = new Set(items.filter((i) => i.kind !== 'done').map((i) => i.engagementId));

  return {
    action: {
      total: action.length,
      rejected: action.filter((i) => i.kind === 'rejected').length,
      review: action.filter((i) => i.kind === 'review').length,
      deliver: action.filter((i) => i.kind === 'deliver').length,
    },
    overdue: {
      total: overdueItems.length,
      critical: overdueItems.filter((i) => i.isCritical).length,
      overdue: overdueItems.filter((i) => !i.isCritical).length,
    },
    waiting: {
      total: waiting.length,
      client: waiting.filter((i) => i.kind === 'waiting-client' || i.kind === 'waiting-request').length,
      manager: waiting.filter((i) => i.kind === 'waiting-manager').length,
    },
    dueWeek: {
      total: dueWeek.length,
      filings: dueWeek.filter((i) => i.source === 'filing').length,
      steps: dueWeek.filter((i) => i.source === 'step').length,
    },
    doneToday,
    openCount: items.filter((i) => i.kind !== 'done').length,
    companyCount: companies.size,
  };
}

export function internWorkMatches(item: InternWorkItem, filters: InternWorkFilters, now = new Date()): boolean {
  const focus = filters.focus ?? 'all';
  const week = new Set(istWeekYmds(now, 7));
  const todayYmd = ymdInIst(now);

  if (filters.companyId && item.engagementId !== filters.companyId) return false;

  if (filters.kind === 'steps' && item.source !== 'step') return false;
  if (filters.kind === 'filings' && item.source !== 'filing') return false;

  if (filters.day) {
    const window = new Set(istWeekYmds(now, 14));
    window.add(filters.day);
    window.add(todayYmd);
    if (internWeekAnchorYmd(item, todayYmd, window) !== filters.day) return false;
  }

  if (filters.tag) {
    switch (filters.tag) {
      case 'rejected':
        if (item.kind !== 'rejected') return false;
        break;
      case 'review':
        if (item.kind !== 'review') return false;
        break;
      case 'deliver':
        if (item.kind !== 'deliver') return false;
        break;
      case 'critical':
        if (!item.isCritical) return false;
        break;
      case 'overdue':
        if (!item.isOverdue) return false;
        break;
      case 'client':
        if (item.kind !== 'waiting-client' && item.kind !== 'waiting-request') return false;
        break;
      case 'manager':
        if (item.kind !== 'waiting-manager') return false;
        break;
      case 'filings':
        if (item.source !== 'filing') return false;
        break;
      case 'steps':
        if (item.source !== 'step') return false;
        break;
    }
  }

  switch (focus) {
    case 'all':
      return true;
    case 'action':
      return internWorkBoardColumn(item, now) === 'action';
    case 'overdue':
      return item.isOverdue && item.kind !== 'done';
    case 'waiting':
      return internWorkBoardColumn(item, now) === 'waiting';
    case 'due': {
      if (item.kind === 'done') {
        const doneYmd = ymdFromIsoInIst(item.completedAt);
        return Boolean(doneYmd && week.has(doneYmd));
      }
      const due = ymdFromIsoInIst(item.dueAt);
      return Boolean(due && week.has(due));
    }
    case 'progress':
      return internWorkBoardColumn(item, now) === 'progress';
    case 'done':
      return item.kind === 'done';
  }
}

export function filterInternWork(
  items: InternWorkItem[],
  filters: InternWorkFilters,
  now = new Date(),
): InternWorkItem[] {
  return items.filter((item) => internWorkMatches(item, filters, now));
}

const KIND_RANK: Record<InternWorkKind, number> = {
  rejected: 0,
  overdue: 1,
  filing: 2,
  task: 2,
  review: 3,
  deliver: 4,
  'in-progress': 5,
  'waiting-manager': 6,
  'waiting-client': 7,
  'waiting-request': 8,
  done: 9,
};

export function sortInternWork(items: InternWorkItem[]): InternWorkItem[] {
  return [...items].sort((a, b) => {
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const due = (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999');
    if (due !== 0) return due;
    return a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' });
  });
}

export function internWorkBoard(
  items: InternWorkItem[],
  now = new Date(),
): Record<InternWorkBoardColumn, InternWorkItem[]> {
  const cols: Record<InternWorkBoardColumn, InternWorkItem[]> = {
    action: [],
    progress: [],
    waiting: [],
    done: [],
  };
  for (const item of sortInternWork(items)) {
    cols[internWorkBoardColumn(item, now)].push(item);
  }
  // Task cards keep the order the lead set by dragging (M6 G1); steps and filings stay put.
  for (const key of Object.keys(cols) as InternWorkBoardColumn[]) cols[key] = orderColumn(cols[key]);
  return cols;
}

export interface InternActionCompanyGroup {
  engagementId: string;
  companyName: string;
  pill: { label: string; tone: InternChipTone };
  items: InternWorkItem[];
}

function companyPill(items: InternWorkItem[]): { label: string; tone: InternChipTone } {
  const rejected = items.filter((i) => i.kind === 'rejected').length;
  if (rejected) return { label: `${rejected} rejected`, tone: 'danger' };
  const deliver = items.filter((i) => i.kind === 'deliver').length;
  if (deliver) return { label: 'Deliver ready', tone: 'success' };
  const filingDue = items.filter((i) => i.source === 'filing' && i.kind !== 'done').length;
  if (filingDue) return { label: 'Filing due', tone: 'warning' };
  const overdue = items.filter((i) => i.isOverdue).length;
  if (overdue) return { label: `${overdue} overdue`, tone: 'danger' };
  if (items.some((i) => i.kind === 'in-progress')) return { label: 'In progress', tone: 'primary' };
  return { label: `${items.length} open`, tone: 'info' };
}

export function internActionQueueByCompany(
  items: InternWorkItem[],
  now = new Date(),
): InternActionCompanyGroup[] {
  const open = sortInternWork(
    items.filter((i) => i.kind !== 'done' && internWorkBoardColumn(i, now) !== 'waiting'),
  );
  const groups = new Map<string, InternActionCompanyGroup>();
  for (const item of open) {
    let group = groups.get(item.engagementId);
    if (!group) {
      group = {
        engagementId: item.engagementId,
        companyName: item.companyName,
        pill: { label: '', tone: 'info' },
        items: [],
      };
      groups.set(item.engagementId, group);
    }
    group.items.push(item);
  }
  const list = [...groups.values()].map((g) => ({ ...g, pill: companyPill(g.items) }));
  list.sort((a, b) => {
    const aRank = KIND_RANK[a.items[0]?.kind ?? 'done'];
    const bRank = KIND_RANK[b.items[0]?.kind ?? 'done'];
    if (aRank !== bRank) return aRank - bRank;
    return a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' });
  });
  return list;
}

/** Intern client page for an action-queue company (`/app/intern/engagements/{slug|id}`). */
export function internQueueCompanyHref(engagementId: string, items: InternWorkItem[] = []): string {
  for (const item of items) {
    const match = /^(\/app\/intern\/engagements\/[^/]+)/.exec(item.href);
    if (match?.[1]) return match[1];
  }
  return internEngagementPath({ id: engagementId });
}

export interface InternWeekChip {
  id: string;
  label: string;
  href: string;
  kind: WeekChipKind;
  tone: InternChipTone;
}

export function internWeekChipKind(item: InternWorkItem, ymd: string, todayYmd: string): WeekChipKind | null {
  const week = istWeekYmds(parseIstNoon(todayYmd), 7);
  if (internWeekAnchorYmd(item, todayYmd, week) !== ymd) return null;
  return internWeekMarkKind(item);
}

export function internWeekDayCounts(
  items: InternWorkItem[],
  ymd: string,
  todayYmd: string,
): Record<WeekChipKind, number> {
  const counts: Record<WeekChipKind, number> = { filing: 0, step: 0, nudge: 0, done: 0 };
  for (const item of items) {
    const kind = internWeekChipKind(item, ymd, todayYmd);
    if (kind) counts[kind] += 1;
  }
  return counts;
}

function internWeekChip(item: InternWorkItem, kind: WeekChipKind): InternWeekChip {
  const tone = WEEK_CHIP_TONE[kind];
  const short =
    item.source === 'filing'
      ? item.title.split('·')[0]?.trim() ?? item.title
      : item.catalogLabel ?? item.title.split('·')[0]?.trim() ?? item.title;
  return {
    id: item.id,
    label: short.length > 18 ? `${short.slice(0, 16)}…` : short,
    href: item.href,
    kind,
    tone,
  };
}

export function internWeekChipsForDay(
  items: InternWorkItem[],
  ymd: string,
  todayYmd: string,
  limit = 3,
): InternWeekChip[] {
  const open: InternWeekChip[] = [];
  const done: InternWeekChip[] = [];
  for (const item of sortInternWork(items)) {
    const kind = internWeekChipKind(item, ymd, todayYmd);
    if (!kind) continue;
    const chip = internWeekChip(item, kind);
    if (kind === 'done') done.push(chip);
    else open.push(chip);
  }
  if (done.length === 0) return open.slice(0, limit);
  if (open.length === 0) return done.slice(0, limit);
  const openTake = Math.min(open.length, Math.max(1, limit - 1));
  return [...open.slice(0, openTake), ...done.slice(0, limit - openTake)];
}

interface InternPhaseBar {
  id: string;
  title: string;
  done: number;
  total: number;
  pct: number;
}

export interface InternCompanyPhaseProgress {
  engagementId: string;
  companyName: string;
  href: string;
  currentLabel: string;
  stuck: boolean;
  phases: InternPhaseBar[];
}

export function internCompanyPhaseProgress(
  engagement: Engagement,
  checklistState: Record<string, ChecklistItemStateSlice>,
  now = new Date(),
): InternCompanyPhaseProgress {
  const gates = gateActiveCatalog(checklistState, 'intern');
  const phases = internOverviewPhases().map((phase) => {
    const { done, total } = internPhaseStepCounts(phase.items, gates);
    return {
      id: phase.id,
      title: phase.title,
      done,
      total,
      pct: internPhaseProgressPercent(done, total),
    };
  });
  const phaseDefs = internOverviewPhases();
  const currentPhase =
    phaseDefs.find((phase) => internPhaseStepCounts(phase.items, gates).done < phase.items.length) ??
    phaseDefs[phaseDefs.length - 1];
  const currentItem = currentPhase
    ? internOverviewCurrentItemInPhase(currentPhase.items, gates)
    : null;
  const started = engagement.incorporationDate || engagement.createdAt;
  const dayN = started ? Math.max(1, differenceInDays(now, new Date(started)) + 1) : undefined;
  const short = currentItem ? catalogShortLabel(currentItem) : undefined;
  const stuckReason = deriveStuckReason(engagement, checklistState);
  const stuck = stuckReason === 'blocked' || Boolean(currentItem && getItem(currentItem.id) && checklistState[currentItem.id]?.status === 'overdue');
  const currentLabel = [currentPhase?.title, short, dayN ? `day ${dayN}` : null, stuck ? 'stuck' : null]
    .filter(Boolean)
    .join(' · ');

  return {
    engagementId: engagement.id,
    companyName: engagement.companyName,
    href: internEngagementPath(engagement),
    currentLabel,
    stuck,
    phases,
  };
}

export function internWorkPath(filters: InternWorkFilters & { view?: InternWorkView } = {}): string {
  const params = new URLSearchParams();
  if (filters.focus && filters.focus !== 'all') params.set('focus', filters.focus);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.companyId) params.set('company', filters.companyId);
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  if (filters.day) params.set('day', filters.day);
  if (filters.view && filters.view !== 'tl') params.set('view', filters.view);
  const qs = params.toString();
  return qs ? `${INTERN_TASKS_PATH}?${qs}` : INTERN_TASKS_PATH;
}

export function parseInternWorkFocus(value: string | null | undefined): InternWorkFocus {
  if (
    value === 'action' ||
    value === 'overdue' ||
    value === 'waiting' ||
    value === 'due' ||
    value === 'progress' ||
    value === 'done'
  ) {
    return value;
  }
  return 'all';
}

export function parseInternWorkTag(value: string | null | undefined): InternWorkTag | null {
  if (
    value === 'rejected' ||
    value === 'review' ||
    value === 'deliver' ||
    value === 'critical' ||
    value === 'overdue' ||
    value === 'client' ||
    value === 'manager' ||
    value === 'filings' ||
    value === 'steps'
  ) {
    return value;
  }
  return null;
}

export function parseInternWorkView(value: string | null | undefined): InternWorkView {
  if (value === 'list' || value === 'board' || value === 'tl') return value;
  return 'tl';
}

export function parseInternWorkKindFilter(value: string | null | undefined): InternWorkKindFilter {
  if (value === 'steps' || value === 'filings') return value;
  return 'all';
}

export function parseInternWorkDay(value: string | null | undefined): string | null {
  if (!value) return null;
  return IST_YMD_RE.test(value.trim()) ? value.trim().slice(0, 10) : null;
}

function internTimelineWindow(now: Date): string[] {
  return istWeekYmds(now, 14);
}

interface InternTimelineDayColumn {
  ymd: string;
  items: InternWorkItem[];
}

export interface InternTimelineGrid {
  days: InternTimelineDayColumn[];
  later: InternWorkItem[];
}

/** Two IST weeks (Mon–Sun × 2) of cards, plus open items that do not land in the window. */
export function internTimelineGrid(items: InternWorkItem[], now: Date): InternTimelineGrid {
  const today = ymdInIst(now);
  const window = internTimelineWindow(now);
  const week = new Set(window);
  const byDay = new Map<string, InternWorkItem[]>(window.map((ymd) => [ymd, []]));
  const later: InternWorkItem[] = [];

  for (const item of sortInternWork(items)) {
    const anchor = internWeekAnchorYmd(item, today, week);
    if (anchor && byDay.has(anchor)) {
      byDay.get(anchor)!.push(item);
      continue;
    }
    if (item.kind !== 'done') later.push(item);
  }

  return {
    days: window.map((ymd) => ({ ymd, items: byDay.get(ymd) ?? [] })),
    later,
  };
}

export function internTimelineRows(items: InternWorkItem[], now: Date) {
  const grid = internTimelineGrid(items, now);
  return grid.days.flatMap((col) =>
    col.items.map((item) => ({
      item,
      ymd: col.ymd,
      kind: internWeekMarkKind(item),
    })),
  );
}

export type InternTimelinePriority = 'overdue' | 'soon' | 'ok' | 'done';

/** Civil IST start/end for a Gantt bar. */
export function internTimelineSpan(
  item: InternWorkItem,
  todayYmd: string,
): { start: string; end: string } {
  if (item.kind === 'done') {
    const end =
      ymdFromIsoInIst(item.completedAt) ?? ymdFromIsoInIst(item.dueAt) ?? todayYmd;
    const start = ymdFromIsoInIst(item.startedAt) ?? end;
    return start > end ? { start: end, end } : { start, end };
  }
  const end = ymdFromIsoInIst(item.dueAt) ?? todayYmd;
  const start = ymdFromIsoInIst(item.startedAt) ?? todayYmd;
  return start > end ? { start: end, end } : { start, end };
}

/** Time-left colour bucket (IST). Soon = due today through 3 days out. */
export function internTimelinePriority(
  item: InternWorkItem,
  todayYmd: string,
): InternTimelinePriority {
  if (item.kind === 'done') return 'done';
  const { end } = internTimelineSpan(item, todayYmd);
  if (item.isOverdue || end < todayYmd) return 'overdue';
  const days = differenceInDays(parseIstNoon(end), parseIstNoon(todayYmd));
  if (days <= 3) return 'soon';
  return 'ok';
}

interface InternTimelineGanttRow {
  item: InternWorkItem;
  /** Inclusive column in the 14-day window. */
  startIdx: number;
  endIdx: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  priority: InternTimelinePriority;
}

export interface InternTimelineGantt {
  window: string[];
  rows: InternTimelineGanttRow[];
  later: InternWorkItem[];
}

function clipSpanToWindow(
  start: string,
  end: string,
  window: string[],
): { startIdx: number; endIdx: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return null;
  if (end < first) {
    return { startIdx: 0, endIdx: 0, clippedStart: true, clippedEnd: true };
  }
  if (start > last) return null;
  const clippedStart = start < first;
  const clippedEnd = end > last;
  const from = clippedStart ? first : start;
  const to = clippedEnd ? last : end;
  const startIdx = window.indexOf(from);
  const endIdx = window.indexOf(to);
  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) return null;
  return { startIdx, endIdx, clippedStart, clippedEnd };
}

/** Fortnight Gantt rows: bars clipped to the window; no overlap with week-strip anchors. */
export function internTimelineGantt(items: InternWorkItem[], now: Date): InternTimelineGantt {
  const today = ymdInIst(now);
  const window = internTimelineWindow(now);
  const rows: InternTimelineGanttRow[] = [];
  const later: InternWorkItem[] = [];

  for (const item of sortInternWork(items)) {
    const span = internTimelineSpan(item, today);
    const clip = clipSpanToWindow(span.start, span.end, window);
    if (!clip) {
      if (item.kind !== 'done') later.push(item);
      continue;
    }
    rows.push({
      item,
      ...clip,
      priority: internTimelinePriority(item, today),
    });
  }

  return { window, rows, later };
}

export function internWaitingItems(items: InternWorkItem[]): InternWorkItem[] {
  return sortInternWork(
    items.filter(
      (i) =>
        i.kind === 'waiting-client' ||
        i.kind === 'waiting-manager' ||
        i.kind === 'waiting-request',
    ),
  );
}

function internFocusStorageKey(userId: string): string {
  return `${INTERN_FOCUS_STORAGE_PREFIX}${userId}`;
}

function internQueueExpandedStorageKey(userId: string): string {
  return `${INTERN_QUEUE_EXPANDED_STORAGE_PREFIX}${userId}`;
}

/** Unique trimmed engagement ids. Drops non-strings and empties. */
export function parseInternQueueExpanded(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of raw) {
    if (typeof row !== 'string') continue;
    const id = row.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function serializeInternQueueExpanded(ids: Iterable<string>): string[] {
  return parseInternQueueExpanded([...ids]);
}

export function readInternQueueExpanded(userId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(internQueueExpandedStorageKey(userId));
    if (!raw) return [];
    return parseInternQueueExpanded(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function writeInternQueueExpanded(userId: string, ids: Iterable<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      internQueueExpandedStorageKey(userId),
      JSON.stringify(serializeInternQueueExpanded(ids)),
    );
  } catch {
    /* quota / private mode */
  }
}

export interface InternFocusEntry {
  id: string;
  done: boolean;
  /** Typed personal todo — not a pinned InternWorkItem. */
  custom?: boolean;
  title?: string;
  /** Server `tasks.id` when persisted. */
  dbId?: string;
}

export const CUSTOM_INTERN_FOCUS_PREFIX = 'custom:';
export const INTERN_FOCUS_TITLE_MAX = 200;

export function isCustomInternFocus(entry: InternFocusEntry): boolean {
  return entry.custom === true || entry.id.startsWith(CUSTOM_INTERN_FOCUS_PREFIX);
}

export function createCustomInternFocus(title: string): InternFocusEntry {
  const trimmed = title.trim().slice(0, INTERN_FOCUS_TITLE_MAX);
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `${CUSTOM_INTERN_FOCUS_PREFIX}${crypto.randomUUID()}`
      : `${CUSTOM_INTERN_FOCUS_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, done: false, custom: true, title: trimmed };
}

function parseInternFocusRow(row: unknown): InternFocusEntry | null {
  if (typeof row === 'string' && row.trim()) return { id: row, done: false };
  if (!row || typeof row !== 'object') return null;
  const obj = row as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id.trim()) return null;
  const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, INTERN_FOCUS_TITLE_MAX) : undefined;
  const dbId = typeof obj.dbId === 'string' && obj.dbId.trim() ? obj.dbId.trim() : undefined;
  const custom = obj.custom === true || obj.id.startsWith(CUSTOM_INTERN_FOCUS_PREFIX);
  if (custom) {
    return { id: obj.id, done: Boolean(obj.done), custom: true, title: title ?? '', ...(dbId ? { dbId } : {}) };
  }
  return { id: obj.id, done: Boolean(obj.done), ...(title ? { title } : {}), ...(dbId ? { dbId } : {}) };
}

/** Accepts legacy `{ id, done }` / string ids plus custom `{ id, done, custom, title }` rows. */
export function parseInternFocus(raw: unknown): InternFocusEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseInternFocusRow).filter((row): row is InternFocusEntry => Boolean(row));
}

export function serializeInternFocus(entries: InternFocusEntry[]): InternFocusEntry[] {
  return entries.map((entry) => {
    const dbId = entry.dbId?.trim() || undefined;
    if (isCustomInternFocus(entry)) {
      return {
        id: entry.id,
        done: Boolean(entry.done),
        custom: true,
        title: (entry.title ?? '').trim().slice(0, INTERN_FOCUS_TITLE_MAX),
        ...(dbId ? { dbId } : {}),
      };
    }
    const title = entry.title?.trim().slice(0, INTERN_FOCUS_TITLE_MAX);
    return {
      id: entry.id,
      done: Boolean(entry.done),
      ...(title ? { title } : {}),
      ...(dbId ? { dbId } : {}),
    };
  });
}

export function readInternFocus(userId: string): InternFocusEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(internFocusStorageKey(userId));
    if (!raw) return [];
    return parseInternFocus(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function writeInternFocus(userId: string, entries: InternFocusEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(internFocusStorageKey(userId), JSON.stringify(serializeInternFocus(entries)));
  } catch {
    /* quota / private mode */
  }
}
