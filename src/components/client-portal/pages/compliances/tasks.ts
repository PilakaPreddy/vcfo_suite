/**
 * Client portal · non-statutory tasks (COMPLIANCE-MODEL.md 3.2, 3.3, 4.4, 4.5, 4.6). Pure: no
 * React, no fetch. The rows come from the client task routes, which already keep to the
 * client's own engagement and to tasks with visibility "client" or "both" (K-1). This module
 * turns them into the six status words (R-13), the end-week groups of the list (S-3), the
 * calendar statuses (C-3) and the Filings rows of done tasks (F-2).
 */
import { daysBetween, fmtDM, plural, type CompStatus, type PortalFiling } from '@/lib/client-portal/compliances';

export type Category = 'all' | 'statutory' | 'non-statutory';
export const showStat = (c: Category) => c !== 'non-statutory';
export const showTasks = (c: Category) => c !== 'statutory';

/** The eight workflow stages (3.3), in their snake-case form. */
export type Stage = 'not_started' | 'ready' | 'in_progress' | 'waiting' | 'review' | 'rework' | 'completed' | 'not_applicable';

/** One task as the client sees it. */
export interface ClientTask {
  id: string;
  name: string;
  /** The activity name or module, shown under the name. */
  activityName: string | null;
  /** yyyy-mm-dd. */
  startDate: string;
  /** yyyy-mm-dd: the end date the admin or manager set. */
  endDate: string;
  urgency: string;
  visibility: string;
  stage: Stage;
  /** yyyy-mm-dd when the task was completed. */
  completedOn: string | null;
  ownerName: string | null;
  notifyDays: number;
  /** The deliverable file of a done task (F-2). */
  deliverable: { id: string; fileName: string } | null;
  /** Set when the task is a board meeting; the row opens the meeting page instead. */
  boardMeetingId?: string | null;
}

export type StatusWord = 'Not started' | 'In progress' | 'Waiting' | 'Due soon' | 'Overdue' | 'Done';
export const STATUS_WORDS: StatusWord[] = ['Overdue', 'Due soon', 'Waiting', 'In progress', 'Not started', 'Done'];

const STAGE_WORD: Record<Stage, StatusWord> = {
  not_started: 'Not started',
  ready: 'Not started',
  in_progress: 'In progress',
  review: 'In progress',
  rework: 'In progress',
  waiting: 'Waiting',
  completed: 'Done',
  not_applicable: 'Not started',
};

export const STAGE_LABEL: Record<Stage, string> = {
  not_started: 'Not started',
  ready: 'Ready to start',
  in_progress: 'In progress',
  waiting: 'Waiting for client',
  review: 'Submitted for review',
  rework: 'Rework required',
  completed: 'Completed',
  not_applicable: 'Not applicable',
};

/** "In-progress", "in progress" and "in_progress" all read as `in_progress`. */
export function normStage(s: string | null | undefined): Stage {
  const k = String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (k === 'submitted_for_review') return 'review';
  if (k === 'waiting_for_client' || k === 'waiting_on_client') return 'waiting';
  if (k === 'rework_required') return 'rework';
  if (k === 'ready_to_start') return 'ready';
  if (k === 'done') return 'completed';
  return (k in STAGE_WORD ? k : 'not_started') as Stage;
}

/** R-13: Overdue and Due soon come from the end date; the rest from the stage. */
export function taskWord(t: Pick<ClientTask, 'stage' | 'endDate' | 'notifyDays'>, today: string): StatusWord {
  if (t.stage === 'completed') return 'Done';
  const n = daysBetween(today, t.endDate);
  if (n < 0) return 'Overdue';
  if (n <= (t.notifyDays || 5) && (t.stage === 'not_started' || t.stage === 'ready')) return 'Due soon';
  return STAGE_WORD[t.stage];
}

/** The calendar's four states, by the rule the statutory rows use (done, late, within 7 days, later). */
export function taskCal(t: Pick<ClientTask, 'stage' | 'endDate'>, today: string): CompStatus {
  if (t.stage === 'completed') return 'ok';
  const n = daysBetween(today, t.endDate);
  return n < 0 ? 'over' : n <= 7 ? 'due' : 'up';
}

export const URGENCY_BARS: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
/** "high" → "High". */
export function urgencyLabel(u: string | null | undefined): string {
  const s = String(u ?? 'Low').trim().toLowerCase();
  return s ? s[0]!.toUpperCase() + s.slice(1) : 'Low';
}

/** C-3 hover text: "Starts 12 Oct · High". */
export const taskHint = (t: Pick<ClientTask, 'startDate' | 'urgency'>) => `Starts ${fmtDM(t.startDate)} · ${urgencyLabel(t.urgency)}`;

/** S-3: rows group by end-date week (weeks start on Monday): This week, Next week, Later, Done. */
export type WeekGroup = 'This week' | 'Next week' | 'Later' | 'Done';
export const WEEK_GROUPS: WeekGroup[] = ['This week', 'Next week', 'Later', 'Done'];
export function weekOf(t: Pick<ClientTask, 'stage' | 'endDate'>, today: string): WeekGroup {
  if (t.stage === 'completed') return 'Done';
  const d = new Date(`${today}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  const n = daysBetween(monday, t.endDate);
  return n < 7 ? 'This week' : n < 14 ? 'Next week' : 'Later';
}

export function weekGroups(tasks: ClientTask[], today: string): Array<{ id: WeekGroup; rows: ClientTask[] }> {
  const sorted = [...tasks].sort((a, b) => a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name));
  return WEEK_GROUPS.map((g) => {
    const rows = sorted.filter((t) => weekOf(t, today) === g);
    return { id: g, rows: g === 'Done' ? rows.reverse() : rows };
  }).filter((g) => g.rows.length);
}

/* ------------------------------------------------------------ calendar rows */

/** A task drawn on the calendar or listed on Filings, in the shape of a register row. */
export type TaskRow = PortalFiling & { task: ClientTask };
export type CalRow = PortalFiling | TaskRow;
export const isTaskRow = (r: CalRow): r is TaskRow => 'task' in r && Boolean((r as TaskRow).task);
export const TASK_ROW_PREFIX = 'task:';

/**
 * A task as a register row: it shows on its end date (C-3), its window runs from the start
 * date to the end date, and a completed task counts as "Filed" on its completion date. It has
 * no regulator: `area` carries a placeholder that every screen replaces with "Task", and the
 * area filters drop task rows (C-4).
 */
export function taskAsRow(t: ClientTask): TaskRow {
  const done = t.stage === 'completed';
  return {
    id: `${TASK_ROW_PREFIX}${t.id}`,
    engagementId: '',
    companyName: '',
    particular: t.name,
    name: t.name,
    area: 'MCA',
    authority: '',
    authorityName: 'Non-statutory',
    frequency: 'one-time',
    freqLabel: 'Task',
    dueDate: t.endDate,
    filedOn: done ? (t.completedOn ?? t.endDate) : null,
    period: `Ends ${fmtDM(t.endDate)}`,
    periodLong: null,
    fyLabel: null,
    rawStatus: t.stage,
    windowFrom: t.startDate,
    windowTo: t.endDate,
    penaltyRisk: '',
    ownerName: t.ownerName,
    acknowledgementNo: null,
    amountPaid: null,
    filedByName: null,
    dataReceivedOn: null,
    preparingSince: null,
    draftDueOn: null,
    approvalDueOn: null,
    approvedOn: null,
    proofCount: t.deliverable ? 1 : 0,
    reminderOn: null,
    task: t,
  };
}

/** F-2: only completed tasks are Filings rows. */
export const doneTaskRows = (tasks: ClientTask[]) => tasks.filter((t) => t.stage === 'completed').map(taskAsRow);

/** FY start year (April to March) of an ISO date. */
export function fyOfIso(iso: string): number {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
}

/** "2 filings · 1 task" for a calendar day. */
export function dayWords(list: CalRow[]): string {
  const t = list.filter(isTaskRow).length;
  const f = list.length - t;
  return [f ? plural(f, 'filing') : '', t ? plural(t, 'task') : ''].filter(Boolean).join(' · ') || plural(0, 'filing');
}
