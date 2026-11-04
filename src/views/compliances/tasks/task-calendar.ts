import type { FilingRow, FilingStatus } from '@/lib/compliance/filings';
import { financialYearMonths } from '@/lib/compliance/filings';
import type { SixWord } from '@/views/compliances/spectrum-status';
import { plainDate } from '@/views/compliances/spectrum-status';
import type { TaskRowDto } from '@/views/compliances/tasks/api';
import { taskCal } from '@/views/compliances/tasks/task-model';

/**
 * Non-statutory tasks on the staff Calendar (C-1 to C-4) and Filings (F-1 to F-3): the same
 * four statuses a filing has, the FY date range for the task read, and the read-only row a
 * task becomes on the timeline. Pure; the tasks come from `GET /api/compliances/tasks`.
 */

/** The area word of a task row: it has no regulator. */
export const INTERNAL_AREA = 'Internal';

/** First and last day of a financial year, for `?from=&to=`. */
export function fyRange(fyStartYear: number): { from: string; to: string } {
  const months = financialYearMonths(fyStartYear);
  const last = months[months.length - 1]!.key;
  const [y, m] = last.split('-').map(Number);
  const end = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  return { from: `${months[0]!.key}-01`, to: end };
}

/** The four calendar statuses of a task, by the rule of a filing: done, late, within 7 days, later. */
export const taskStatus = (t: TaskRowDto, now: Date): FilingStatus => taskCal({ stage: t.stage, endDate: t.dueDate }, now);

/** The status word of a done task on Filings reads Done; otherwise the server's word. */
const taskWordOf = (t: TaskRowDto): SixWord => t.word;

/** C-3 hover text: "Starts 12 Oct · High". */
export const taskHintOf = (t: TaskRowDto, now: Date) => `Starts ${plainDate(t.startDate, now)} · ${t.urgency}`;

const TASK_ROW_PREFIX = 'task:';

/**
 * A task as a read-only timeline row: its bar runs from the start date to the end date. The
 * timeline gets `mayWrite={false}` for these rows, so nothing writes to the filings routes.
 */
export function taskAsFilingRow(t: TaskRowDto): FilingRow {
  return {
    id: `${TASK_ROW_PREFIX}${t.id}`,
    engagementId: t.engagementId,
    companyName: t.companyName,
    compliance: INTERNAL_AREA,
    particular: t.title,
    authority: INTERNAL_AREA,
    frequency: t.repeats,
    dueDate: t.dueDate,
    filedOn: t.stage === 'completed' ? (t.completedAt?.slice(0, 10) ?? t.dueDate) : null,
    periodLabel: t.periodLabel,
    fyLabel: null,
    rawStatus: t.stage === 'in-progress' || t.stage === 'review' || t.stage === 'rework' ? 'in-progress' : 'upcoming',
    obligationId: `task-${t.activityId ?? 'other'}`,
    windowFrom: t.startDate,
    windowTo: t.dueDate,
  };
}

export const taskIdOfRow = (row: Pick<FilingRow, 'id'>) => (row.id.startsWith(TASK_ROW_PREFIX) ? row.id.slice(TASK_ROW_PREFIX.length) : null);
