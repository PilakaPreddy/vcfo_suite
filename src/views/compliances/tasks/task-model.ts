import { daysUntil, type SixWord } from '@/views/compliances/spectrum-status';

/**
 * VIEW MODEL of the statutory and non-statutory split on the staff screens
 * (prototype docs/COMPLIANCE-MODEL.md sections 3.2 to 3.4 and 4.1). Pure
 * functions over rows the routes return; nothing here is stored or invented.
 *
 * Dates are ISO day strings ("2026-10-16"), compared in UTC like the rest of
 * the compliance screens (`daysUntil`, `plainDate`).
 */

export type TaskUrgency = 'Low' | 'Medium' | 'High' | 'Critical';
export type TaskVisibility = 'firm' | 'client' | 'both';
export type WorkflowStage =
  | 'not-started'
  | 'ready'
  | 'in-progress'
  | 'waiting'
  | 'review'
  | 'rework'
  | 'completed'
  | 'not-applicable';
export type TaskRepeats = 'one-time' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';

/** The Obligations category switch (S-1). */
export type Category = 'stat' | 'ns' | 'all';
/** The Calendar and Filings filter (C-1, F-1). */
export type CatFilter = 'all' | 'statutory' | 'non-statutory';

export const URGENCIES: readonly TaskUrgency[] = ['Low', 'Medium', 'High', 'Critical'];
export const URGENCY_BARS: Record<TaskUrgency, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
export const VISIBILITY_LABEL: Record<TaskVisibility, string> = { firm: 'Firm', client: 'Client', both: 'Both' };
export const REPEATS: ReadonlyArray<{ value: TaskRepeats; label: string }> = [
  { value: 'one-time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-weekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export const STAGE_LABEL: Record<WorkflowStage, string> = {
  'not-started': 'Not started',
  ready: 'Ready to start',
  'in-progress': 'In progress',
  waiting: 'Waiting for client',
  review: 'Submitted for review',
  rework: 'Rework required',
  completed: 'Completed',
  'not-applicable': 'Not applicable',
};

/** R-13: the eight stages read as the six chip words. */
const STAGE_WORD: Record<WorkflowStage, SixWord> = {
  'not-started': 'Not started',
  ready: 'Not started',
  'in-progress': 'In progress',
  review: 'In progress',
  rework: 'In progress',
  waiting: 'Waiting',
  completed: 'Done',
  'not-applicable': 'Not started',
};

/** The chip word (3.3): Overdue and Due soon come from the date; the rest from the stage. */
export function stageWord(stage: WorkflowStage, dueIso: string, notifyDays: number, now: Date): SixWord {
  if (stage === 'completed') return 'Done';
  const n = daysUntil(dueIso, now);
  if (n !== null && n < 0) return 'Overdue';
  if (n !== null && n <= notifyDays && (stage === 'not-started' || stage === 'ready')) return 'Due soon';
  return STAGE_WORD[stage];
}

/** "Due in 4 days", "3 days overdue", "Due today"; "Done" once finished. */
export function dueText(dueIso: string, now: Date, done: boolean, doneWord = 'Done'): string {
  if (done) return doneWord;
  const n = daysUntil(dueIso, now);
  if (n === null) return '';
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`;
  if (n === 0) return 'Due today';
  return `Due in ${n} day${n === 1 ? '' : 's'}`;
}

/** The fields of a non-statutory task the list and the calendar need. */
export interface TaskLike {
  id: string;
  name: string;
  engagementId: string;
  companyName: string;
  startDate: string;
  endDate: string;
  urgency: TaskUrgency;
  visibility: TaskVisibility;
  stage: WorkflowStage;
  notifyDays: number;
  ownerName?: string | null;
}

const taskWord = (t: Pick<TaskLike, 'stage' | 'endDate' | 'notifyDays'>, now: Date): SixWord =>
  stageWord(t.stage, t.endDate, t.notifyDays, now);

/** S-3: rows group by end-date week. Weeks start on Monday (UTC). */
export type WeekGroup = 'This week' | 'Next week' | 'Later' | 'Done';
export const WEEK_GROUPS: readonly WeekGroup[] = ['This week', 'Next week', 'Later', 'Done'];

export function weekOf(t: Pick<TaskLike, 'stage' | 'endDate'>, now: Date): WeekGroup {
  if (t.stage === 'completed') return 'Done';
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const n = daysUntil(t.endDate, monday) ?? 0;
  return n < 7 ? 'This week' : n < 14 ? 'Next week' : 'Later';
}

/** The number strip keys of the staff Obligations list (the existing statutory keys, S-8). */
export type StripKey = '' | 'overdue' | 'soon' | 'waiting' | 'done' | 'none';

export function taskMatches(t: TaskLike, f: StripKey, now: Date): boolean {
  const w = taskWord(t, now);
  if (f === 'overdue') return w === 'Overdue';
  if (f === 'soon') return w !== 'Overdue' && w !== 'Done' && weekOf(t, now) === 'This week';
  if (f === 'waiting') return w === 'Waiting';
  if (f === 'done') return w === 'Done';
  if (f === 'none') return (t.stage === 'not-started' || t.stage === 'ready') && w !== 'Overdue';
  return true;
}

/** The four calendar statuses of a task, by the rule of a staff filing: done, late, within 7 days, later. */
export type TaskCal = 'filed' | 'due-soon' | 'overdue' | 'upcoming';
export function taskCal(t: Pick<TaskLike, 'stage' | 'endDate'>, now: Date): TaskCal {
  if (t.stage === 'completed') return 'filed';
  const n = daysUntil(t.endDate, now);
  if (n === null) return 'upcoming';
  if (n < 0) return 'overdue';
  if (n <= 7) return 'due-soon';
  return 'upcoming';
}

export const showStat = (c: CatFilter) => c !== 'non-statutory';
export const showTasks = (c: CatFilter) => c !== 'statutory';

/** Default reminder days by frequency (DR-21). */
export const NOTIFY_BY_REPEATS: Record<TaskRepeats, number> = {
  weekly: 2,
  'bi-weekly': 3,
  monthly: 5,
  quarterly: 10,
  yearly: 30,
  'one-time': 5,
};

/** The six reminders of section 3.4, dated from the due date (negative = before). */
export interface ReminderRule {
  key: 'initial' | 'due-soon' | 'due-date' | 'overdue' | 'escalate-reviewer' | 'escalate-admin';
  label: string;
  to: string;
  internal: boolean;
  offset: (notifyDays: number) => number;
}

export const REMINDER_RULES: readonly ReminderRule[] = [
  { key: 'initial', label: 'First reminder', to: 'Owner', internal: false, offset: (n) => -n },
  { key: 'due-soon', label: 'Due soon', to: 'Owner and reviewer', internal: false, offset: (n) => -Math.max(1, Math.round(n / 3)) },
  { key: 'due-date', label: 'Due today', to: 'Owner and reviewer', internal: false, offset: () => 0 },
  { key: 'overdue', label: 'Overdue, daily', to: 'Owner', internal: false, offset: () => 1 },
  { key: 'escalate-reviewer', label: 'Escalation', to: 'Reviewer or manager', internal: true, offset: () => 2 },
  { key: 'escalate-admin', label: 'Escalation', to: 'Compliance admin', internal: true, offset: () => 5 },
];

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

