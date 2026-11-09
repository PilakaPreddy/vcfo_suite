'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { type DropArg, type EventResizeDoneArg } from '@fullcalendar/interaction';
import type {
  DateSelectArg,
  DatesSetArg,
  DayHeaderContentArg,
  EventApi,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
  EventMountArg,
} from '@fullcalendar/core';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { Button } from '@/components/ui/button';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import {
  isDraggable,
  isResizable,
  keyboardMove,
  wallNow,
  wallYmd,
  type CalendarEventKind,
  type MoveRights,
} from '@/lib/work/calendar-moves';
import { cn } from '@/lib/utils';
import './staff-calendar.css';

/**
 * The Planner's calendar, drawn as the prototype's `HourWeek`: an inset framed grid, stacked day
 * heads, hour rows and blocks in the client's colour. It runs FullCalendar's MIT packages (daygrid, timegrid,
 * interaction) in UTC mode with India Standard Time wall-clock values (`calendar-moves.ts`),
 * hides FullCalendar's own toolbar for ours (Day, Week, Month, Previous, Next, Today), and is
 * restyled with the design tokens in `staff-calendar.css` (light and dark).
 *
 * Every event has a kind; `moveDecision` decides whether it is draggable, resizable or
 * locked. The host decides what a move does (`onMove`): save it, turn it into a date-change
 * request, or refuse it, and calls `revert` when the event must jump back.
 *
 * Keyboard: Tab reaches each event; Enter opens it; Up and Down move it 15 minutes, Left and
 * Right one day, Shift with Up or Down changes its end.
 */
export type StaffCalendarMode = 'day' | 'week' | 'month';

export type StaffEventTone =
  | 'block'
  | 'item'
  | 'agreed'
  | 'statutory'
  | 'planned'
  | 'done'
  | 'overdue'
  | 'due-soon'
  | 'upcoming';

export interface StaffCalEvent {
  id: string;
  title: string;
  /** Wall-clock ISO (`YYYY-MM-DDTHH:MM:SS`) for a timed event, `YYYY-MM-DD` for an all-day one. */
  start: string;
  /** Exclusive end, same format; an all-day event spanning days ends the day after its last day. */
  end?: string;
  allDay?: boolean;
  kind: CalendarEventKind;
  tone: StaffEventTone;
  /** R-43 regulator colour on the left edge. */
  reg?: 'mca' | 'gst' | 'it' | 'payroll' | 'fema' | 'labour' | null;
  /** A short second line (the company, the time). */
  sub?: string;
  /** Hover text. */
  hint?: string;
  /** Hollow square for a non-statutory task in a statutory grid (the old MonthGrid mark). */
  hollow?: boolean;
  /** R-35: the block's client colour (`brand`, `identity`, `waiting`, `warning`, `positive`, `upcoming`). */
  client?: string;
  /** The person's own block, not tied to a work item: a dashed edge. */
  own?: boolean;
  /** Planned after the item's due date: an amber ring. */
  late?: boolean;
}

export interface StaffMove {
  event: StaffCalEvent;
  /** `move` for a drag (or arrow key), `resize` for the bottom edge (or Shift and an arrow key). */
  change: 'move' | 'resize';
  start: Date;
  end: Date | null;
  allDay: boolean;
  /** Whole days the start moved and the end moved. */
  startDays: number;
  endDays: number;
  /** Put the event back where it was. */
  revert: () => void;
}

const TIMED_VIEW: Record<StaffCalendarMode, string> = { day: 'timeGridDay', week: 'timeGridWeek', month: 'dayGridMonth' };
const DAY_VIEW: Record<StaffCalendarMode, string> = { day: 'dayGridDay', week: 'dayGridWeek', month: 'dayGridMonth' };
const VIEW_MODE: Record<string, StaffCalendarMode> = {
  timeGridDay: 'day',
  timeGridWeek: 'week',
  dayGridDay: 'day',
  dayGridWeek: 'week',
  dayGridMonth: 'month',
};
const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;
const daysOf = (ms: number) => Math.round(ms / DAY_MS);

export function StaffCalendar({
  events,
  rights,
  now,
  initialDate,
  date,
  timed = true,
  initialMode = 'week',
  modes = ['day', 'week', 'month'],
  dayStartHour = 8,
  dayEndHour = 20,
  allDaySlot = true,
  title,
  actions,
  className,
  onMove,
  onOpen,
  onSlot,
  onExternalDrop,
  onRange,
  dayHeaderExtra,
  emptyNote,
}: {
  events: StaffCalEvent[];
  rights: MoveRights;
  now: Date;
  /** `YYYY-MM-DD` to open on. */
  initialDate: string;
  /** Show the range holding this `YYYY-MM-DD` when it changes (a month picker outside). */
  date?: string;
  /** Hour grids in Day and Week (the Planner); off, all three views are day cells (due dates). */
  timed?: boolean;
  initialMode?: StaffCalendarMode;
  modes?: StaffCalendarMode[];
  dayStartHour?: number;
  dayEndHour?: number;
  allDaySlot?: boolean;
  title: string;
  actions?: ReactNode;
  className?: string;
  onMove?: (move: StaffMove) => void;
  onOpen?: (event: StaffCalEvent) => void;
  /** A click (or drag) on an empty slot: the create form opens there. */
  onSlot?: (slot: { start: Date; end: Date; allDay: boolean }) => void;
  /** A to-do dragged in from the to-do list (an element with `data-plan-key` and `data-plan-title`). */
  onExternalDrop?: (drop: { key: string; title: string; date: Date; allDay: boolean }) => void;
  /** The shown range changed: first day and the day after the last, and the mode. */
  onRange?: (range: { from: string; to: string; mode: StaffCalendarMode }) => void;
  /** Extra text under a day head in Day and Week (the planned hours). */
  dayHeaderExtra?: (ymd: string) => ReactNode;
  /** Shown under the grid when the range holds no events. */
  emptyNote?: ReactNode;
}) {
  const ref = useRef<FullCalendar>(null);
  const [mode, setMode] = useState<StaffCalendarMode>(initialMode);
  const [label, setLabel] = useState('');
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const canPlan = Boolean(onSlot);
  const MODE_VIEW = timed ? TIMED_VIEW : DAY_VIEW;

  // FullCalendar calls the mount hooks once per element, so the keyboard handler reads the
  // latest props through a ref.
  const keyRef = useRef<(e: KeyboardEvent, api: EventApi) => void>(() => undefined);
  const onKey = (e: KeyboardEvent, api: EventApi) => {
    const ev = byId.get(api.id);
    if (!ev || !onMove || !api.start) return;
    const step = keyboardMove(e.key, e.shiftKey);
    if (!step) return;
    if (step.resize ? !isResizable(ev.kind, rights) : !isDraggable(ev.kind, rights)) return;
    if (api.allDay && step.minutes !== 0) return;
    e.preventDefault();
    const shift = step.minutes * 60_000 + step.days * DAY_MS;
    const start = step.resize ? api.start : new Date(api.start.getTime() + shift);
    const end = api.end ? new Date(api.end.getTime() + shift) : null;
    onMove({
      event: ev,
      change: step.resize ? 'resize' : 'move',
      start,
      end,
      allDay: api.allDay,
      startDays: step.resize ? 0 : step.days,
      endDays: step.days,
      revert: () => undefined,
    });
  };
  useEffect(() => {
    keyRef.current = onKey;
  });

  const input: EventInput[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        startEditable: isDraggable(e.kind, rights),
        durationEditable: isResizable(e.kind, rights),
        classNames: [
          'vc-ev',
          `vc-ev--${e.tone}`,
          e.client ? `vc-client--${e.client}` : '',
          e.own ? 'vc-ev--own' : '',
          e.late ? 'vc-ev--late' : '',
          e.reg ? `vc-reg--${e.reg}` : '',
          e.kind === 'statutory' ? 'vc-ev--locked' : '',
        ].filter(Boolean),
      })),
    [events, rights],
  );

  useEffect(() => {
    ref.current?.getApi().changeView(MODE_VIEW[mode]);
  }, [mode, MODE_VIEW]);

  // A seven-day grid does not fit a phone (it stopped partway through Thursday), so a phone
  // opens on one day; the Week button still shows the whole week.
  useEffect(() => {
    if (initialMode === 'week' && modes.includes('day') && window.matchMedia('(max-width: 639px)').matches) setMode('day');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  useEffect(() => {
    const cal = ref.current?.getApi();
    if (!cal || !date) return;
    const at = Date.parse(`${date}T00:00:00Z`);
    if (at < cal.view.currentStart.getTime() || at >= cal.view.currentEnd.getTime()) cal.gotoDate(date);
  }, [date]);

  const api = () => ref.current?.getApi();

  const renderContent = (arg: EventContentArg) => {
    const ev = byId.get(arg.event.id);
    if (!ev) return null;
    const locked = !isDraggable(ev.kind, rights) && (ev.kind === 'statutory' || ev.kind === 'client-agreed');
    return (
      <span className="vc-ev__body" title={ev.hint ?? ev.title}>
        <span className="vc-ev__title">
          {ev.hollow ? <i className="vc-ev__hollow" aria-hidden /> : null}
          {locked || ev.kind === 'client-agreed' ? <Lock className="vc-ev__lock" strokeWidth={1.8} aria-hidden /> : null}
          <span className="vc-ev__text">{ev.title}</span>
        </span>
        {/* A timed block reads: title, whose work and which part, then the time. */}
        {ev.sub && !arg.event.allDay && arg.view.type !== 'dayGridMonth' ? <span className="vc-ev__sub">{ev.sub}</span> : null}
        {!arg.event.allDay && arg.view.type !== 'dayGridMonth' && arg.timeText ? <span className="vc-ev__time">{arg.timeText}</span> : null}
        {ev.sub && arg.event.allDay && arg.view.type === 'timeGridDay' ? <span className="vc-ev__sub">{ev.sub}</span> : null}
      </span>
    );
  };

  const toMove = (info: EventDropArg | EventResizeDoneArg, change: 'move' | 'resize'): StaffMove | null => {
    const ev = byId.get(info.event.id);
    if (!ev || !info.event.start) return null;
    const oldStart = info.oldEvent.start?.getTime() ?? info.event.start.getTime();
    const oldEnd = info.oldEvent.end?.getTime() ?? oldStart;
    const newEnd = info.event.end?.getTime() ?? info.event.start.getTime();
    return {
      event: ev,
      change,
      start: info.event.start,
      end: info.event.end,
      allDay: info.event.allDay,
      startDays: daysOf(info.event.start.getTime() - oldStart),
      endDays: daysOf(newEnd - oldEnd),
      revert: info.revert,
    };
  };

  const shown = events.length;

  return (
    <section className={cn('surface vc-cal min-w-0 overflow-hidden', className)}>
      <div className="flex min-h-head flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line-soft px-4 py-2 md:px-5">
        <CardHeadTile title={title} />
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted tabular-nums">{label}</span>
        <span className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-control-sm w-control-sm" aria-label={`Previous ${mode}`} onClick={() => api()?.prev()}>
            <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
          </Button>
          <Button variant="outline" size="icon" className="h-control-sm w-control-sm" aria-label={`Next ${mode}`} onClick={() => api()?.next()}>
            <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => api()?.gotoDate(wallNow(now))}>
            Today
          </Button>
        </span>
        {modes.length > 1 ? (
          <SpectrumTabs
            label="Calendar view"
            items={modes.map((m) => ({ key: m, label: m === 'day' ? 'Day' : m === 'week' ? 'Week' : 'Month' }))}
            value={mode}
            onChange={(k) => setMode(k as StaffCalendarMode)}
          />
        ) : null}
        {actions}
      </div>
      <div className="overflow-x-auto px-4 py-4 md:px-5">
        <div className={cn('overflow-hidden rounded-md border-1.5 border-line', mode === 'day' ? 'min-w-[320px]' : 'min-w-[640px]')}>
          <FullCalendar
            ref={ref}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={MODE_VIEW[initialMode]}
            initialDate={initialDate}
            headerToolbar={false}
            timeZone="UTC"
            now={() => wallNow(new Date())}
            firstDay={1}
            height="auto"
            nowIndicator
            allDaySlot={allDaySlot}
            allDayText="All day"
            slotMinTime={`${pad(dayStartHour)}:00:00`}
            slotMaxTime={`${pad(dayEndHour)}:00:00`}
            slotDuration="01:00:00"
            snapDuration="00:15:00"
            slotLabelContent={(arg) => {
              const h = arg.date.getUTCHours();
              return `${h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
            }}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
            dayHeaderFormat={{ weekday: 'short' }}
            dayMaxEvents={3}
            moreLinkText={(n) => `${n} more`}
            events={input}
            eventInteractive
            editable={Boolean(onMove)}
            selectable={canPlan}
            selectMirror
            unselectAuto
            droppable={Boolean(onExternalDrop)}
            eventContent={renderContent}
            eventDidMount={(arg: EventMountArg) => {
              const ev = byId.get(arg.event.id);
              arg.el.setAttribute('aria-label', ev ? `${ev.title}${arg.event.allDay ? '' : ` · ${arg.timeText}`}` : arg.event.title);
              const handler = (e: KeyboardEvent) => keyRef.current(e, arg.event);
              (arg.el as HTMLElement & { __vcKey?: (e: KeyboardEvent) => void }).__vcKey = handler;
              arg.el.addEventListener('keydown', handler);
            }}
            eventWillUnmount={(arg: EventMountArg) => {
              const el = arg.el as HTMLElement & { __vcKey?: (e: KeyboardEvent) => void };
              if (el.__vcKey) el.removeEventListener('keydown', el.__vcKey);
            }}
            eventClick={(arg: EventClickArg) => {
              arg.jsEvent.preventDefault();
              const ev = byId.get(arg.event.id);
              if (ev) onOpen?.(ev);
            }}
            eventDrop={(info: EventDropArg) => {
              const m = toMove(info, 'move');
              if (m && onMove) onMove(m);
              else info.revert();
            }}
            eventResize={(info: EventResizeDoneArg) => {
              const m = toMove(info, 'resize');
              if (m && onMove) onMove(m);
              else info.revert();
            }}
            select={(arg: DateSelectArg) => {
              api()?.unselect();
              onSlot?.({ start: arg.start, end: arg.end, allDay: arg.allDay });
            }}
            drop={(arg: DropArg) => {
              const key = arg.draggedEl.dataset.planKey;
              if (key) onExternalDrop?.({ key, title: arg.draggedEl.dataset.planTitle ?? '', date: arg.date, allDay: arg.allDay });
            }}
            datesSet={(arg: DatesSetArg) => {
              setLabel(arg.view.title);
              const m = VIEW_MODE[arg.view.type] ?? 'week';
              if (m !== mode) setMode(m);
              onRange?.({ from: wallYmd(arg.start), to: wallYmd(arg.end), mode: m });
            }}
            dayHeaderContent={(arg: DayHeaderContentArg) =>
              arg.view.type === 'dayGridMonth' ? (
                arg.text
              ) : (
                <span className="vc-dayhead">
                  <span>{arg.text}</span>
                  <span className={cn('vc-dayhead__date', arg.isToday && 'vc-dayhead__date--today')}>{arg.date.getUTCDate()}</span>
                  {dayHeaderExtra ? <span className="vc-dayhead__extra">{dayHeaderExtra(wallYmd(arg.date))}</span> : null}
                </span>
              )
            }
          />
        </div>
      </div>
      {shown === 0 && emptyNote ? <div className="border-t border-line-soft p-4">{emptyNote}</div> : null}
    </section>
  );
}
