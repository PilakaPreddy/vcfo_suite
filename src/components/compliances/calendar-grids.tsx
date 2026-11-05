'use client';

import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { FilingStatus, FilingsMonth } from '@/lib/compliance/filings';
import { FILING_WORD, STATUS_FILL, STATUS_TILE, worstStatus } from '@/lib/compliance/spectrum-status';

/**
 * The register calendar grids (prototype MonthCalendar and YearGrid), drawn on
 * ISO dates in UTC so a timezone never moves a due date. A day takes the tint
 * of its worst item; one tag per filing name shows on the day, the rest as a
 * count. Clicking a day picks it and opens a 340 px popover beside the day
 * with that day's filings (`dayTitle` and `dayBody` fill it).
 */

export interface CalendarMark {
  id: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  label: string;
  status: FilingStatus;
  /** A non-statutory task (C-3): a hollow 8 px square on its end date, not the regulator bar. */
  hollow?: boolean;
  /** Hover text, for example "Starts 12 Oct · High". */
  hint?: string;
}

const HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function iso(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Monday-first cells of a month, including the lead and trail days of the next and last month. */
function gridDays(year: number, month: number): string[] {
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((lead + count) / 7) * 7 }, (_, i) => iso(year, month, 1 - lead + i));
}

/** One tag per filing name a day, with the worst status of its clients. */
function tagsByDay(marks: CalendarMark[]): Map<string, CalendarMark[]> {
  const days = new Map<string, CalendarMark[]>();
  for (const m of marks) {
    const list = days.get(m.date) ?? [];
    const hit = list.find((x) => x.label === m.label && Boolean(x.hollow) === Boolean(m.hollow));
    if (hit) hit.status = worstStatus([hit.status, m.status]);
    else list.push({ ...m, id: `${m.date}-${m.hollow ? 't' : 's'}-${m.label}` });
    days.set(m.date, list);
  }
  return days;
}

export function MonthGrid({
  year,
  month,
  todayIso,
  marks,
  picked,
  onPick,
  dayTitle,
  dayBody,
}: {
  year: number;
  /** 0-based month. */
  month: number;
  todayIso: string;
  marks: CalendarMark[];
  /** The open day (ISO), or null. */
  picked: string | null;
  onPick: (date: string | null) => void;
  /** The popover head for a day. */
  dayTitle?: (date: string) => ReactNode;
  /** The popover body for a day; `close` shuts the popover. */
  dayBody?: (date: string, close: () => void) => ReactNode;
}) {
  const days = gridDays(year, month);
  const byDay = tagsByDay(marks);
  const monthPrefix = iso(year, month, 1).slice(0, 7);

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="grid grid-cols-7">
        {HEAD.map((w) => (
          <div key={w} className="border-b border-line bg-surface-sunken px-1.5 py-1.5 text-[11px] font-medium uppercase tracking-[.07em] text-ink-muted md:px-2">
            {w}
          </div>
        ))}
        {days.map((day, i) => {
          const inMonth = day.startsWith(monthPrefix);
          const isToday = day === todayIso;
          const list = inMonth ? (byDay.get(day) ?? []) : [];
          const worst = list.length ? worstStatus(list.map((x) => x.status)) : undefined;
          const lastRow = i >= days.length - 7;
          const dayNumber = Number(day.slice(8, 10));
          const cls = cn(
            'relative flex h-[60px] w-full min-w-0 flex-col gap-1 bg-surface-raised p-1 text-left md:h-24 md:px-2 md:py-1.5',
            i % 7 !== 6 && 'border-r border-line',
            !lastRow && 'border-b border-line',
            isToday && 'bg-brand-soft shadow-[inset_0_0_0_2px_oklch(var(--brand))]',
            !isToday && picked === day && 'shadow-[inset_0_0_0_2px_oklch(var(--brand-line))]',
          );
          const head = (
            <span className="flex items-center gap-1">
              <span
                className={cn(
                  'inline-grid h-6 min-w-6 place-items-center rounded-sm px-1 text-[13px] font-medium',
                  !inMonth ? 'text-ink-faint' : worst ? STATUS_TILE[worst] : 'text-ink',
                )}
                aria-current={isToday ? 'date' : undefined}
              >
                {dayNumber}
              </span>
              {list.length > 1 ? <span className="ml-auto hidden text-[11px] text-ink-muted md:inline">{list.length}</span> : null}
            </span>
          );
          if (!list.length) {
            return (
              <div key={day} className={cls}>
                {head}
              </div>
            );
          }
          const trigger = (
            <button
              type="button"
              aria-pressed={picked === day}
              onClick={dayBody ? undefined : () => onPick(picked === day ? null : day)}
              className={cn(cls, 'hover:bg-surface-sunken', isToday && 'hover:bg-brand-soft')}
              aria-label={`${dayNumber} ${LONG_MON[month]}, ${list.length} filing${list.length > 1 ? 's' : ''}`}
            >
              {head}
              <span className="hidden min-w-0 flex-col gap-1 md:flex">
                {list.slice(0, 2).map((x) => (
                  <span
                    key={x.id}
                    title={x.hollow ? `${x.label} · ${x.hint ?? FILING_WORD[x.status]}` : `${x.label} · ${FILING_WORD[x.status]}`}
                    className="flex h-5 min-w-0 items-center gap-1.5 overflow-hidden rounded-[3px] bg-surface-sunken pr-1.5 text-[11px] font-medium text-ink"
                  >
                    {x.hollow ? (
                      <i className="ml-1 h-2 w-2 flex-none rounded-[2px] border-[1.5px] border-ink-2" aria-hidden data-hollow />
                    ) : (
                      <i className={cn('w-[3px] flex-none self-stretch rounded-l-[3px]', STATUS_FILL[x.status])} aria-hidden />
                    )}
                    <span className="truncate">{x.label}</span>
                  </span>
                ))}
                {list.length > 2 ? <span className="pl-0.5 text-[11px] font-medium text-brand-text">+{list.length - 2} more</span> : null}
              </span>
              <span className="flex flex-wrap gap-0.5 md:hidden" aria-hidden>
                {list.map((x) => (
                  <i key={x.id} className={cn('h-1.5 w-1.5 rounded-[2px]', x.hollow ? 'border border-ink-2' : STATUS_FILL[x.status])} />
                ))}
              </span>
            </button>
          );
          if (!dayBody) return <span key={day} className="contents">{trigger}</span>;
          return (
            <Popover key={day} open={picked === day} onOpenChange={(v) => onPick(v ? day : null)}>
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={6}
                collisionPadding={12}
                aria-label={`${dayNumber} ${LONG_MON[month]}`}
                className="w-[340px] max-w-[calc(100vw-24px)] overflow-hidden border-line bg-surface-raised p-0 text-ink"
              >
                {dayTitle ? <div className="border-b border-line-soft px-4 py-2.5 text-[14px] font-medium">{dayTitle(day)}</div> : null}
                <div className="max-h-[60vh] overflow-y-auto">{dayBody(day, () => onPick(null))}</div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

const LEGEND: FilingStatus[] = ['overdue', 'due-soon', 'upcoming', 'filed'];

/** Twelve small months of the financial year; a click opens that month. */
export function YearGrid({
  months,
  marks,
  todayIso,
  onPick,
}: {
  months: FilingsMonth[];
  marks: CalendarMark[];
  todayIso: string;
  onPick: (monthKey: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 p-1 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {months.map((m) => {
        const year = Number(m.key.slice(0, 4));
        const month = Number(m.key.slice(5, 7)) - 1;
        const inMonth = marks.filter((x) => x.date.startsWith(m.key));
        const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
        const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const cells = Array.from({ length: Math.ceil((lead + count) / 7) * 7 }, (_, i) => i - lead + 1);
        const current = todayIso.startsWith(m.key);
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onPick(m.key)}
            aria-label={`${m.label} · ${inMonth.length} filings · open the month`}
            className={cn(
              'min-w-0 rounded-md border border-line bg-surface-raised p-2.5 text-left hover:bg-surface-sunken',
              current && 'shadow-[inset_0_0_0_2px_oklch(var(--navy-fill))]',
            )}
          >
            <span className="mb-1.5 flex items-center gap-2">
              <b className="flex-1 text-[12.5px] font-medium text-ink">{m.label}</b>
              <span className="text-[11px] text-ink-muted">{inMonth.length}</span>
            </span>
            <span className="grid grid-cols-7 gap-0.5">
              {cells.map((n, i) => {
                if (n < 1 || n > count) return <span key={i} className="h-5" />;
                const day = iso(year, month, n);
                const list = inMonth.filter((x) => x.date === day);
                const worst = list.length ? worstStatus(list.map((x) => x.status)) : undefined;
                return (
                  <span
                    key={i}
                    title={list.length ? list.map((x) => x.label).slice(0, 3).join(', ') + (list.length > 3 ? ` +${list.length - 3}` : '') : undefined}
                    className={cn(
                      'grid h-5 min-w-0 place-items-center rounded-sm font-mono text-[10.5px] tracking-tight tabular-nums',
                      worst ? cn(STATUS_FILL[worst], 'font-medium text-white') : 'text-ink-faint',
                      day === todayIso && !worst && 'font-medium text-ink shadow-[inset_0_0_0_1.5px_oklch(var(--navy-fill))]',
                      day === todayIso && worst && 'shadow-[0_0_0_1.5px_oklch(var(--navy-fill))]',
                    )}
                  >
                    {n}
                  </span>
                );
              })}
            </span>
            <span className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11.5px] font-medium text-ink-muted">
              {LEGEND.map((s) => {
                const c = inMonth.filter((x) => x.status === s).length;
                if (!c) return null;
                return (
                  <span key={s} className="inline-flex items-center gap-1" title={FILING_WORD[s]}>
                    <i className={cn('h-[7px] w-[7px] rounded-[2px]', STATUS_FILL[s])} aria-hidden />
                    {c}
                  </span>
                );
              })}
              {inMonth.length === 0 ? <span className="text-ink-faint">None</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
