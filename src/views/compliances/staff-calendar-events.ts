import type { StaffCalEvent, StaffEventTone } from '@/components/work/calendar/StaffCalendar';
import { regOf } from '@/lib/ui/regulator';
import { filingStatus, type FilingRow, type FilingStatus } from '@/lib/compliance/filings';
import { addDaysYmd } from '@/lib/work/planner';
import type { CalendarEventKind } from '@/lib/work/calendar-moves';
import type { TaskRowDto } from '@/views/compliances/tasks/api';
import { taskHintOf, taskStatus } from '@/views/compliances/tasks/task-calendar';
import { areaLabel } from '@/lib/compliance/spectrum-status';

const TONE: Record<FilingStatus, StaffEventTone> = {
  filed: 'done',
  overdue: 'overdue',
  'due-soon': 'due-soon',
  upcoming: 'upcoming',
};

/** The calendar kind of a compliance calendar event (M6 G2 move rules). */
function complianceEventKind(source: 'filing' | 'task'): CalendarEventKind {
  return source === 'filing' ? 'statutory' : 'planned';
}

/** The FullCalendar events of the staff compliance calendar: filings on their due dates, tasks from start to end. */
export function complianceEvents(input: {
  rows: FilingRow[];
  tasks: TaskRowDto[];
  now: Date;
  showCompany: boolean;
}): StaffCalEvent[] {
  const { rows, tasks, now, showCompany } = input;
  const out: StaffCalEvent[] = rows.map((row) => ({
    id: `stat:${row.id}`,
    title: row.particular,
    start: row.dueDate.slice(0, 10),
    allDay: true,
    kind: complianceEventKind('filing'),
    tone: TONE[filingStatus(row, now)],
    reg: regOf(row.compliance) ?? null,
    sub: showCompany ? row.companyName : row.periodLabel ?? undefined,
    hint: `${row.particular}${row.periodLabel ? ` · ${row.periodLabel}` : ''} · ${areaLabel(row.compliance)}${showCompany ? ` · ${row.companyName}` : ''} · statutory due date`,
  }));
  for (const t of tasks) {
    const start = (t.startDate || t.dueDate).slice(0, 10);
    const due = t.dueDate.slice(0, 10);
    out.push({
      id: `task:${t.id}`,
      title: t.title,
      start: start <= due ? start : due,
      end: addDaysYmd(due, 1),
      allDay: true,
      kind: complianceEventKind('task'),
      tone: TONE[taskStatus(t, now)],
      hollow: true,
      sub: showCompany ? t.companyName : undefined,
      hint: `${t.title} · ${taskHintOf(t, now)}`,
    });
  }
  return out;
}

