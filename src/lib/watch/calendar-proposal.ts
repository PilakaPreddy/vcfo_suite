import { formatSourceDate } from './source-status';
import { obligationName, obligationsNamedIn, updateText, type UpdateForImpact } from './affected';

/**
 * Due-date changes as proposals, by code only. The calendar never changes here: a manager approves a
 * proposal and only then does the compliance repository move the rows. Dates are `YYYY-MM-DD`, so they
 * compare as text. An approved change also holds for rows generated later, in `withCalendarChanges`.
 */
export interface PeriodRow {
  engagementId: string;
  obligationId: string;
  periodLabel: string;
  dueDate: string;
  filed: boolean;
}

export interface ProposalDraft {
  obligationId: string;
  period: string;
  oldDueDate: string;
  newDueDate: string;
  affectedEngagementIds: string[];
}

export interface CalendarChange {
  obligationId: string;
  period: string;
  oldDueDate: string | null;
  newDueDate: string;
}

/** What moves in one filing period: open rows on the old date, or due before the new date. A filed row stays. */
export function periodRowsToMove<T extends Pick<PeriodRow, 'dueDate' | 'filed'>>(rows: readonly T[], oldDueDate: string | null, newDueDate: string): T[] {
  return rows.filter((row) => !row.filed && row.dueDate !== newDueDate && (row.dueDate === oldDueDate || row.dueDate < newDueDate));
}

const FY = /20\d\d-\d\d/;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Writes "2025-2026" the way period labels do, as "2025-26". */
const foldYears = (text: string): string => text.replace(/\b(20\d\d)\s*[-–]\s*20(\d\d)\b/g, '$1-$2');

/** A monthly label such as "Oct 2026", said as a period: "30 October 2026" is a date, so it does not count. */
function monthNamed(label: string, text: string): boolean {
  const match = /^([a-z]{3})\w*\s+(20\d\d)$/i.exec(label);
  const month = match && MONTHS.find((word) => word.startsWith(match[1]!.toLowerCase()));
  if (!month) return false;
  return new RegExp(`(?<!\\d(?:st|nd|rd|th)?\\s*)\\b(${month}|${month.slice(0, 3)}),?\\s+${match![2]}\\b`, 'i').test(text);
}

function periodNamed(label: string, text: string): boolean {
  const fy = FY.exec(label)?.[0];
  return fy ? text.includes(fy) : monthNamed(label, text);
}

/**
 * The rows the update is about, surest first: the old date it gives, then a period it names, then the
 * nearest earlier date. A year named with no row on the calendar means no match, not the nearest row.
 */
function rowsMeant(open: readonly PeriodRow[], oldDueDate: string | null, newDueDate: string, text: string): PeriodRow[] {
  const onOldDate = open.filter((row) => row.dueDate === oldDueDate);
  if (onOldDate.length > 0) return onOldDate;
  const before = open.filter((row) => row.dueDate < newDueDate);
  const named = before.filter((row) => periodNamed(row.periodLabel, text));
  if (named.length > 0) return named;
  if (FY.test(text)) return [];
  const nearest = before.reduce((latest, row) => (row.dueDate > latest ? row.dueDate : latest), '');
  return before.filter((row) => row.dueDate === nearest);
}

/** One draft per filing and period. An update with no named filing, or none on the calendar, proposes nothing. */
export function proposalsFor(update: UpdateForImpact & { oldDueDate: string | null; newDueDate: string | null }, rows: readonly PeriodRow[]): ProposalDraft[] {
  const { newDueDate } = update;
  if (update.changeType !== 'due_date' || !newDueDate) return [];
  const text = foldYears(updateText(update));
  const named = new Set(obligationsNamedIn(text));
  const open = rows.filter((row) => named.has(row.obligationId) && !row.filed && row.dueDate !== newDueDate);
  const meant = rowsMeant(open, update.oldDueDate, newDueDate, text);
  const periods = new Map(meant.map((row) => [`${row.obligationId}|${row.periodLabel}`, row]));
  return [...periods.values()].map(({ obligationId, periodLabel, dueDate }) => {
    const moving = periodRowsToMove(open.filter((row) => row.obligationId === obligationId && row.periodLabel === periodLabel), update.oldDueDate, newDueDate);
    return {
      obligationId,
      period: periodLabel,
      oldDueDate: update.oldDueDate ?? dueDate,
      newDueDate,
      affectedEngagementIds: [...new Set(moving.map((row) => row.engagementId))],
    };
  });
}

const changeKey = (obligationId: string, period: string): string => `${obligationId}|${period}`;
export const periodKey = (engagementId: string, obligationId: string, period: string): string => `${engagementId}|${changeKey(obligationId, period)}`;

/**
 * The rule generator knows the statutory date, not an approved move. A period already on the calendar
 * keeps its row, moved or filed, so a generated copy is dropped; a period not yet there starts on the
 * approved date. Without this the daily generation would bring back the old date beside the moved row.
 * Later approvals win, so `changes` comes oldest first.
 */
export function withCalendarChanges<T extends { engagementId: string; obligationId: string; periodLabel?: string; dueDate: string; status: string }>(
  instances: readonly T[],
  changes: readonly CalendarChange[],
  existing: ReadonlySet<string> = new Set(),
  today: string = new Date().toISOString().slice(0, 10),
): T[] {
  const byPeriod = new Map(changes.map((change) => [changeKey(change.obligationId, change.period), change]));
  return instances.flatMap<T>((instance) => {
    const period = instance.periodLabel ?? '';
    const change = byPeriod.get(changeKey(instance.obligationId, period));
    if (!change) return [instance];
    if (existing.has(periodKey(instance.engagementId, instance.obligationId, period))) return [];
    if (periodRowsToMove([{ dueDate: instance.dueDate, filed: false }], change.oldDueDate, change.newDueDate).length === 0) return [instance];
    return [{ ...instance, dueDate: change.newDueDate, status: change.newDueDate < today ? 'overdue' : 'upcoming' }];
  });
}

/**
 * The printed statutory calendar shows an approved move as a line on the new date, naming the old one.
 * A line that lists other filings too stays where it is, because those did not move.
 */
export function withMovedDeadlines<T extends { id: string; date: string; title: string }>(deadlines: readonly T[], changes: readonly CalendarChange[]): T[] {
  if (changes.length === 0) return [...deadlines];
  return deadlines.flatMap<T>((deadline) => {
    const named = obligationsNamedIn(deadline.title);
    const moved = changes.filter((change) => change.oldDueDate === deadline.date && named.includes(change.obligationId));
    if (moved.length === 0) return [deadline];
    const lines = moved.map((change) => ({
      ...deadline,
      id: `${deadline.id}-moved-${change.obligationId}`,
      date: change.newDueDate,
      title: `${obligationName(change.obligationId)}: moved from ${formatSourceDate(new Date(`${deadline.date}T12:00:00+05:30`))}`,
    }));
    return /[;,&]/.test(deadline.title) ? [deadline, ...lines] : lines;
  });
}
