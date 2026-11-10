'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkField } from '@/components/work/WorkField';
import { EmptyState } from '@/components/ui/empty-state';
import { toastUndo } from '@/components/ui/undo-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RequestChangeDialog } from '@/components/work/DrawerWorkSections';
import { StaffCalendar, type StaffCalEvent, type StaffMove } from '@/components/work/calendar/StaffCalendar';
import { useTimeBlockActions, useTimeBlocks, useWindowRequestActions } from '@/components/work/use-work';
import { useApp } from '@/context/AppContext';
import {
  dayLoadHours,
  dayMonth,
  istIso,
  istTimeOf,
  istYmdOf,
  isValidBlockRange,
  timeRangeLabel,
  weekdayShort,
  HEAVY_DAY_HOURS,
  type PlannerBlock,
} from '@/lib/work/planner';
import {
  blockTimesFromWall,
  moveDecision,
  requestedWindowForDrag,
  plannerItemKind,
  toWallIso,
  wallHhmm,
  wallYmd,
} from '@/lib/work/calendar-moves';
import { canRequestWindowChange } from '@/lib/work/work-access';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import { identityTone } from '@/views/compliances/identity';
import { cn } from '@/lib/utils';
import { shortCompany } from '@/components/super/parts/super-text';

/** An open work item the planner can place on the calendar. */
export interface PlannerItem {
  key: string;
  title: string;
  companyName: string;
  /** The client's engagement, which picks its colour (the same on every staff screen). */
  engagementId?: string;
  /** The part of the work: Incorporation, Registration, Compliance, Documents or Task. */
  part?: string;
  dueYmd?: string;
  overdue: boolean;
  /** For the all-day row: a filing is a statutory due date, a manager-dated item has a lock. */
  source?: 'step' | 'filing' | 'request' | 'task';
  /** The manager set this item's dates (a window agreed with the client). */
  managerDated?: boolean;
  /** That window, so a drag can ask for a shifted one. */
  window?: { from: string; to: string };
}

const SELECT_CLASS =
  'box-border h-10 w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25';

/** The prototype's hours, 9 AM to 7 PM; a block planned outside them widens the grid so it never hides. */
const GRID_START = 9;
const GRID_END = 19;

type Draft = { id?: string; itemKey: string; title: string; date: string; start: string; end: string };

/**
 * Planner calendar (prototype `PlanCalendar`, M6 G2): FullCalendar Day, Week and Month views
 * of the viewer's time blocks, 9 AM to 7 PM IST, through `StaffCalendar`.
 *   - Time blocks move and resize freely (drag, or the arrow keys); each change saves through
 *     `/api/work/time-blocks/:id` and offers Undo.
 *   - The all-day row holds the items due that day. A filing's statutory due date never moves.
 *     A manager-dated item (dates agreed with the client) opens a date-change request when a
 *     project lead drags it (`/api/work/window-requests`). Other deadlines stay in place.
 *   - Click or drag over an empty slot to plan a block there (the Time block form, prefilled).
 *   - Drag a row of the to-do list (`PlannerTodos`) onto a day or a time slot to plan it.
 * With `leadKey` it is a project lead's calendar for their manager: read only.
 */
export function PlannerCalendar({
  days,
  onDate,
  items,
  now,
  onOpenItem,
  action,
  leadKey,
}: {
  days: string[];
  /** -1 and 1 step a week; 0 jumps back to this week (kept for callers; the calendar has its own arrows). */
  onWeek?: (delta: -1 | 0 | 1) => void;
  /** The shown week moved: the host's week (Plan my week) follows it. */
  onDate?: (ymd: string) => void;
  items: PlannerItem[];
  now: Date;
  onOpenItem: (key: string) => void;
  action?: React.ReactNode;
  /** A project lead's calendar, read only (manager or admin). */
  leadKey?: string;
}) {
  const readOnly = Boolean(leadKey);
  const { user, engagements } = useApp();
  const rights = useMemo(
    () => ({ canEdit: !readOnly, canRequest: !readOnly && canRequestWindowChange(user?.role) }),
    [readOnly, user?.role],
  );
  const today = istYmdOf(now);
  const startYmd = days.includes(today) ? today : days[0]!;
  const [range, setRange] = useState(() => ({
    from: istIso(days[0]!, '00:00'),
    to: istIso(days[days.length - 1]!, '23:59'),
  }));
  const query = useTimeBlocks(range, leadKey);
  const { create, update, remove } = useTimeBlockActions();
  const requests = useWindowRequestActions();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [asking, setAsking] = useState<{ item: PlannerItem; window: { from: string; to: string }; initial: { from: string; to: string } } | null>(null);
  const blocks = useMemo(() => query.data ?? [], [query.data]);
  const itemsByKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  const openNew = (date: string, start: string, end: string, itemKey = '') =>
    readOnly ? undefined : setDraft({ itemKey, title: itemsByKey.get(itemKey)?.title ?? '', date, start, end });
  const openBlock = (b: PlannerBlock) => {
    if (readOnly) {
      if (b.itemKey) onOpenItem(b.itemKey);
      return;
    }
    setDraft({
      id: b.id,
      itemKey: b.itemKey ?? '',
      title: b.title,
      date: istYmdOf(b.startsAt),
      start: istTimeOf(b.startsAt),
      end: istTimeOf(b.endsAt) === '00:00' ? '23:59' : istTimeOf(b.endsAt),
    });
  };

  const events = useMemo<StaffCalEvent[]>(() => {
    const out: StaffCalEvent[] = blocks.map((b) => {
      const item = b.itemKey ? itemsByKey.get(b.itemKey) : undefined;
      const late = Boolean(item?.dueYmd && istYmdOf(b.startsAt) > item.dueYmd);
      const engagementId = item?.engagementId ?? (item ? engagements.find((e) => e.companyName === item.companyName)?.id : undefined);
      // Every block says whose work it is and which part: "Kestrel Robotics · Incorporation".
      // A block with no work item is the person's own time.
      const whose = item ? [shortCompany(item.companyName), item.part].filter(Boolean).join(' · ') : 'Personal';
      return {
        id: `block:${b.id}`,
        title: b.title,
        start: toWallIso(b.startsAt),
        end: toWallIso(b.endsAt),
        kind: 'block',
        tone: b.itemKey ? 'item' : 'block',
        client: item ? identityTone(engagementId ?? item.companyName) : undefined,
        own: !b.itemKey,
        late,
        sub: whose,
        hint: `${b.title} · ${whose} · ${timeRangeLabel(b.startsAt, b.endsAt)}${late ? ' · after the due date' : ''}`,
      };
    });
    for (const i of items) {
      if (!i.dueYmd) continue;
      const kind = plannerItemKind(i);
      out.push({
        id: `due:${i.key}`,
        title: i.title,
        start: i.dueYmd,
        allDay: true,
        kind,
        tone: kind === 'statutory' ? 'statutory' : kind === 'client-agreed' ? 'agreed' : i.overdue ? 'overdue' : 'upcoming',
        client: identityTone(i.engagementId ?? engagements.find((e) => e.companyName === i.companyName)?.id ?? i.companyName),
        sub: [shortCompany(i.companyName), i.part].filter(Boolean).join(' · '),
        hint: `${i.title} · ${[i.companyName, i.part].filter(Boolean).join(' · ')}${kind === 'statutory' ? ' · statutory due date' : kind === 'client-agreed' ? ' · dates set by the manager' : ''}`,
      });
    }
    return out;
  }, [blocks, items, itemsByKey, engagements]);

  const blockOf = (ev: StaffCalEvent) => blocks.find((b) => `block:${b.id}` === ev.id);
  const itemOf = (ev: StaffCalEvent) => (ev.id.startsWith('due:') ? itemsByKey.get(ev.id.slice(4)) : undefined);

  /** Save a moved or resized block, with Undo back to where it was. */
  const commit = (b: PlannerBlock, times: { startsAt: string; endsAt: string }, revert: () => void) => {
    if (times.startsAt === b.startsAt && times.endsAt === b.endsAt) return;
    const before = { id: b.id, title: b.title, startsAt: b.startsAt, endsAt: b.endsAt, itemKey: b.itemKey ?? null };
    const day = istYmdOf(times.startsAt);
    update.mutate(
      { ...before, ...times },
      {
        onSuccess: () =>
          toastUndo(`${b.title} · ${weekdayShort(day)} ${dayMonth(day)} · ${timeRangeLabel(times.startsAt, times.endsAt)}`, () =>
            update.mutate(before),
          ),
        onError: (err) => {
          revert();
          toastError("Couldn't move the block", errorMessage(err));
        },
      },
    );
  };

  const onMove = (m: StaffMove) => {
    const decision = moveDecision(m.event.kind, rights);
    if (decision.action === 'locked') {
      m.revert();
      toastError("Couldn't move it", decision.reason);
      return;
    }
    if (decision.action === 'request') {
      m.revert();
      const item = itemOf(m.event);
      if (!item?.dueYmd) return;
      const asked = requestedWindowForDrag(item.window, item.dueYmd, wallYmd(m.start));
      if (!asked) return;
      setAsking({
        item,
        window: item.window ?? { from: item.dueYmd, to: item.dueYmd },
        initial: { from: asked.fromDate, to: asked.toDate },
      });
      return;
    }
    const b = blockOf(m.event);
    if (!b) return m.revert();
    if (m.allDay) {
      m.revert();
      toastError("Couldn't move the block", 'A block needs a time. Drop it on an hour.');
      return;
    }
    const times = blockTimesFromWall(m.start, m.end);
    if (!times) {
      m.revert();
      toastError("Couldn't move the block", 'A block stays inside one day and lasts 15 minutes to 12 hours.');
      return;
    }
    commit(b, times, m.revert);
  };

  /** Plan a to-do dropped from the list: one hour at the drop time, or 10 AM on a day. A typed to-do has no work item. */
  const planDropped = (key: string, dropped: string, date: Date, allDay: boolean) => {
    if (readOnly) return;
    const typed = key.startsWith('todo:');
    const item = typed ? { title: dropped } : itemsByKey.get(key);
    if (!item) return;
    const ymd = wallYmd(date);
    const start = allDay ? '10:00' : wallHhmm(date);
    const startsAt = istIso(ymd, start);
    const endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
    const safeEnd = istYmdOf(endsAt) !== ymd ? istIso(ymd, '23:59') : endsAt;
    if (!isValidBlockRange(startsAt, safeEnd)) {
      toastError("Couldn't plan the item", 'Drop it earlier in the day.');
      return;
    }
    create.mutate([{ itemKey: typed ? null : key, title: item.title, startsAt, endsAt: safeEnd }], {
      onSuccess: (made) =>
        toastUndo(`${item.title} · ${weekdayShort(ymd)} ${dayMonth(ymd)} · ${timeRangeLabel(startsAt, safeEnd)}`, () => {
          for (const b of made) remove.mutate(b.id);
        }),
      onError: (err) => toastError("Couldn't plan the item", errorMessage(err)),
    });
  };

  const save = (d: Draft) => {
    const startsAt = istIso(d.date, d.start);
    const endsAt = istIso(d.date, d.end);
    const title = d.title.trim() || itemsByKey.get(d.itemKey)?.title || '';
    const done = () => {
      setDraft(null);
      toastSuccess(d.id ? 'Block moved' : 'Block planned', `${title} · ${dayMonth(d.date)} · ${timeRangeLabel(startsAt, endsAt)}`);
    };
    const fail = (err: unknown) => toastError("Couldn't save the block", errorMessage(err));
    if (d.id) {
      update.mutate({ id: d.id, title, startsAt, endsAt, itemKey: d.itemKey || null }, { onSuccess: done, onError: fail });
    } else {
      create.mutate([{ itemKey: d.itemKey || null, title, startsAt, endsAt }], { onSuccess: done, onError: fail });
    }
  };

  const hours = (iso: string) => Number(istTimeOf(iso).slice(0, 2));
  const dayStart = Math.min(GRID_START, ...blocks.map((b) => hours(b.startsAt)));
  const dayEnd = Math.max(GRID_END, ...blocks.map((b) => hours(b.endsAt) + (istTimeOf(b.endsAt).endsWith('00') ? 0 : 1)));

  const shownBlocks = blocks.filter((b) => b.startsAt >= range.from && b.startsAt < range.to);

  return (
    <div className="grid min-w-0 gap-2">
      <StaffCalendar
        title="Calendar"
        events={events}
        rights={rights}
        now={now}
        initialDate={startYmd}
        initialMode="week"
        dayStartHour={dayStart}
        dayEndHour={dayEnd}
        onMove={readOnly ? undefined : onMove}
        onOpen={(ev) => {
          const b = blockOf(ev);
          if (b) return openBlock(b);
          const item = itemOf(ev);
          if (item) onOpenItem(item.key);
        }}
        onSlot={
          readOnly
            ? undefined
            : ({ start, end, allDay }) => {
                const ymd = wallYmd(start);
                if (allDay) return openNew(ymd, '10:00', '11:00');
                const s = wallHhmm(start);
                const short = end.getTime() - start.getTime() <= 30 * 60_000;
                const e = short ? wallHhmm(new Date(start.getTime() + 3_600_000)) : wallYmd(end) !== ymd ? '23:59' : wallHhmm(end);
                openNew(ymd, s, e < s ? '23:59' : e);
              }
        }
        onExternalDrop={readOnly ? undefined : ({ key, title, date, allDay }) => planDropped(key, title, date, allDay)}
        onRange={({ from, to, mode }) => {
          setRange({ from: istIso(from, '00:00'), to: istIso(to, '00:00') });
          if (mode === 'week' && onDate && !days.includes(from)) onDate(from);
        }}
        dayHeaderExtra={(ymd) => {
          const h = dayLoadHours(blocks, [ymd])[0] ?? 0;
          return h > 0 ? <span className={cn(h > HEAVY_DAY_HOURS && 'text-warning')}>{Math.round(h * 10) / 10} h</span> : ' ';
        }}
        actions={action}
        emptyNote={!query.isLoading && shownBlocks.length === 0 && events.length === 0 ? <EmptyState title="No blocks this week" /> : undefined}
      />

      {!readOnly ? (
        <BlockDialog
          draft={draft}
          items={items}
          busy={create.isPending || update.isPending || remove.isPending}
          onClose={() => setDraft(null)}
          onSave={save}
          onOpenItem={(key) => {
            setDraft(null);
            onOpenItem(key);
          }}
          onDelete={(id) =>
            remove.mutate(id, {
              onSuccess: () => {
                setDraft(null);
                toastSuccess('Block removed');
              },
              onError: (err) => toastError("Couldn't remove the block", errorMessage(err)),
            })
          }
        />
      ) : null}
      {asking ? (
        <RequestChangeDialog
          open
          onOpenChange={(v) => (!v ? setAsking(null) : undefined)}
          title={asking.item.title}
          companyName={asking.item.companyName}
          window={asking.window}
          initial={asking.initial}
          busy={requests.create.isPending}
          onSend={(input) =>
            requests.create.mutate(
              { itemKey: asking.item.key, ...input },
              {
                onSuccess: () => {
                  setAsking(null);
                  toastSuccess('Request sent to your manager', `${asking.item.title} · ${asking.item.companyName}`);
                },
                onError: (err) => toastError("Couldn't send the request", errorMessage(err)),
              },
            )
          }
        />
      ) : null}
    </div>
  );
}

function BlockDialog({
  draft,
  items,
  busy,
  onClose,
  onSave,
  onDelete,
  onOpenItem,
}: {
  draft: Draft | null;
  items: PlannerItem[];
  busy: boolean;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onDelete: (id: string) => void;
  onOpenItem: (key: string) => void;
}) {
  const [form, setForm] = useState<Draft | null>(draft);
  const [seen, setSeen] = useState<Draft | null>(draft);
  if (draft !== seen) {
    setSeen(draft);
    setForm(draft);
  }
  const f = form;
  const title = f ? f.title.trim() || items.find((i) => i.key === f.itemKey)?.title || '' : '';
  const valid = Boolean(f && title && f.date && isValidBlockRange(istIso(f.date, f.start), istIso(f.date, f.end)));
  const set = (patch: Partial<Draft>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  const linked = f?.itemKey ? items.find((i) => i.key === f.itemKey) : undefined;

  return (
    <Dialog open={!!draft} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-medium">{draft?.id ? 'Time block' : 'Plan a block'}</DialogTitle>
        </DialogHeader>
        {f ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-[12.5px] text-ink-muted">
              Work item
              <select
                className={SELECT_CLASS}
                value={f.itemKey}
                onChange={(e) => {
                  const next = items.find((i) => i.key === e.target.value);
                  set({ itemKey: e.target.value, title: next ? next.title : f.title });
                }}
              >
                <option value="">No item</option>
                {f.itemKey && !linked ? <option value={f.itemKey}>{f.title || 'Linked item'}</option> : null}
                {items.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.title} · {i.companyName}
                  </option>
                ))}
              </select>
            </label>
            <WorkField label="Title">
              {(id) => (
                <Input id={id} value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} placeholder={linked?.title ?? 'Focus'} />
              )}
            </WorkField>
            <div className="grid grid-cols-3 gap-3">
              <WorkField label="Date">
                {(id) => <Input id={id} type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />}
              </WorkField>
              <WorkField label="Start">
                {(id) => <Input id={id} type="time" step={900} value={f.start} onChange={(e) => set({ start: e.target.value })} />}
              </WorkField>
              <WorkField label="End">
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    step={900}
                    value={f.end}
                    onChange={(e) => set({ end: e.target.value })}
                    aria-invalid={!valid || undefined}
                  />
                )}
              </WorkField>
            </div>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <span className="flex gap-2">
            {draft?.id ? (
              <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => onDelete(draft.id!)}>
                Delete
              </Button>
            ) : null}
            {draft?.id && linked ? (
              <Button variant="secondary" onClick={() => onOpenItem(linked.key)}>
                Open task
              </Button>
            ) : null}
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!valid || busy} onClick={() => f && onSave({ ...f, title })}>
              Save
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
