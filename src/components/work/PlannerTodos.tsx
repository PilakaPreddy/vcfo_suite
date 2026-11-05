'use client';

import { useEffect, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import { Lock, UserRoundPlus, X } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Chip } from '@/components/ui/spectrum-chip';
import { ClientDot } from '@/components/staff/today/today-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { RemindClientButton } from '@/components/reminders/RemindClientButton';
import { remindableItemKey } from '@/lib/reminders/reminder-rules';
import { dayMonth } from '@/components/staff/today/today-rows';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { WorkField } from '@/components/work/WorkField';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PersonAvatar } from '@/views/admin/firm-people/parts';
import {
  INTERN_FOCUS_TITLE_MAX,
  createCustomInternFocus,
  isCustomInternFocus,
  type InternFocusEntry,
  type InternWorkItem,
} from '@/lib/intern/intern-work';
import { cn } from '@/lib/utils';

type Person = { id: string; name: string };

/**
 * Hand a to-do to a project lead (manager Work, S-234). Only a pinned work item can move: it
 * moves through `/api/work/reassign`, so the lead sees it in their own Work. A typed to-do has
 * no client, so it stays the manager's.
 */
export interface TodoHandOff {
  leads: Person[];
  /** The lead who holds a pinned item now, if any. */
  ownerOf: (item: InternWorkItem) => Person | undefined;
  /** Whether the item can move on its own (steps and tasks; filings and requests move with the client). */
  canHand: (item: InternWorkItem) => boolean;
  onHand: (item: InternWorkItem, to: Person) => void;
}

/**
 * Planner to-dos card (prototype `TodoCard`): the user's personal to-dos, the same list as
 * the Today to-do card (`useOwnFocusTodos`, `/api/todos`). A typed to-do shows its title;
 * a pinned work item opens the task drawer. The quick-add line at the top adds a typed to-do.
 * The rows are what drags onto the calendar; there is no separate card for it.
 * With `hand` (manager Work) a pinned row shows its lead and a person-plus menu to hand it on,
 * and the head counts the to-dos with project leads.
 */
export function PlannerTodos({
  focus,
  byId,
  persist,
  onOpenItem,
  hand,
  assigned = [],
  waiting = [],
  planKeyOf,
}: {
  /** "Assigned by manager": open tasks a manager gave the user (they show a lock and their due date). */
  assigned?: InternWorkItem[];
  /** "Waiting on client": items the client owes, each with Remind. */
  waiting?: InternWorkItem[];
  focus: InternFocusEntry[];
  byId: Map<string, InternWorkItem>;
  persist: (next: InternFocusEntry[]) => void;
  onOpenItem: (id: string) => void;
  /** Kept for callers; the page's New to-do button opens the form. */
  onNew?: () => void;
  hand?: TodoHandOff;
  /** The planner key of a work item. With it, the rows drag onto the calendar. */
  planKeyOf?: (item: InternWorkItem) => string | undefined;
}) {
  const [quick, setQuick] = useState('');
  const open = focus.filter((f) => !f.done).length + assigned.length + waiting.length;
  const mine = focus.filter((f) => !f.done).length;
  const withLeads = hand
    ? focus.filter((f) => {
        const item = isCustomInternFocus(f) ? undefined : byId.get(f.id);
        return !f.done && item && hand.ownerOf(item);
      }).length
    : 0;
  // The to-do rows are what drags onto the calendar (FullCalendar's external Draggable).
  const listRef = useRef<HTMLDivElement>(null);
  const canDrag = Boolean(planKeyOf);
  useEffect(() => {
    if (!listRef.current || !canDrag) return;
    const drag = new Draggable(listRef.current, {
      itemSelector: '[data-plan-key]',
      eventData: (el) => ({ title: el.dataset.planTitle ?? '', duration: '01:00', create: false }),
    });
    return () => drag.destroy();
  }, [canDrag]);
  const dragOf = (key: string | undefined, title: string) =>
    planKeyOf && key ? { 'data-plan-key': key, 'data-plan-title': title, title: `${title}. Drag onto the calendar to plan it.` } : {};

  return (
    <DashSection
      title="To-do"
      meta={
        <>
          {open}
          {withLeads > 0 ? (
            <span className="ml-2 rounded-sm bg-brand-soft px-1.5 py-0.5 text-[11.5px] font-medium text-brand-text tabular-nums">{withLeads} with project leads</span>
          ) : null}
        </>
      }
      flush
    >
      <form
        className="px-4 py-3 md:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          const title = quick.trim();
          if (!title) return;
          persist([createCustomInternFocus(title), ...focus]);
          setQuick('');
        }}
      >
        <Input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="Add a to-do"
          aria-label="Add a to-do"
          maxLength={INTERN_FOCUS_TITLE_MAX}
        />
      </form>
      <div ref={listRef}>
        <TodoGroup title="Assigned by manager" count={assigned.length}>
          {assigned.map((item) => (
            <li key={item.id} {...dragOf(planKeyOf?.(item), item.title)} className={ROW}>
              <ClientDot name={item.companyName} />
              <button type="button" onClick={() => onOpenItem(item.id)} className="min-w-0 flex-1 text-left">
                <b className="block truncate font-medium text-ink hover:underline">{item.title}</b>
                <span className="block truncate text-[12px] text-ink-muted">
                  {[shortCompany(item.companyName), item.catalogLabel].filter(Boolean).join(' · ')}
                </span>
              </button>
              <Lock className="h-[13px] w-[13px] flex-none text-ink-muted" strokeWidth={1.6} aria-label="Due date set by manager" />
              {item.dueAt ? (
                <Chip tone={item.isOverdue ? 'bad' : 'idle'} fixed>
                  {item.isOverdue ? 'Overdue' : dayMonth(item.dueAt)}
                </Chip>
              ) : null}
            </li>
          ))}
        </TodoGroup>
        <TodoGroup title="My to-dos" count={mine}>
          {focus.map((entry) => {
            const item = isCustomInternFocus(entry) ? undefined : byId.get(entry.id);
            const title = item?.title ?? entry.title ?? 'To-do';
            const owner = item && hand ? hand.ownerOf(item) : undefined;
            const planKey = entry.done ? undefined : item ? planKeyOf?.(item) : `todo:${entry.id}`;
            return (
              <li key={entry.id} {...dragOf(planKey, title)} className={cn('group', ROW)}>
                <Checkbox
                  checked={entry.done}
                  aria-label={title}
                  onCheckedChange={() => persist(focus.map((f) => (f.id === entry.id ? { ...f, done: !f.done } : f)))}
                />
                {item ? <ClientDot name={item.companyName} /> : null}
                <span className="min-w-0 flex-1">
                  {item ? (
                    <button
                      type="button"
                      onClick={() => onOpenItem(item.id)}
                      className={cn('block max-w-full truncate text-left font-medium text-ink hover:underline', entry.done && 'font-normal text-ink-muted')}
                    >
                      {title}
                    </button>
                  ) : (
                    <span className={cn('block truncate font-medium text-ink', entry.done && 'font-normal text-ink-muted')}>{title}</span>
                  )}
                  {item ? <span className="block truncate text-[12px] text-ink-muted">{shortCompany(item.companyName)}</span> : null}
                </span>
                {item && hand ? <HandMenu item={item} owner={owner} hand={hand} /> : null}
                {entry.done ? (
                  <Chip tone="ok" fixed>
                    Done
                  </Chip>
                ) : null}
                <Button
                  size="icon"
                  variant="quiet"
                  className="h-7 w-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`Remove · ${title}`}
                  onClick={() => persist(focus.filter((f) => f.id !== entry.id))}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.6} />
                </Button>
              </li>
            );
          })}
        </TodoGroup>
        <TodoGroup title="Waiting on client" count={waiting.length}>
          {waiting.map((item) => {
            const key = remindableItemKey(item);
            return (
              <li key={item.id} className={ROW}>
                <ClientDot name={item.companyName} />
                <button type="button" onClick={() => onOpenItem(item.id)} className="min-w-0 flex-1 text-left">
                  <b className="block truncate font-medium text-ink hover:underline">{item.title}</b>
                  <span className="block truncate text-[12px] text-ink-muted">
                    {shortCompany(item.companyName)}
                    {item.dueAt ? ` · due ${dayMonth(item.dueAt)}` : ''}
                  </span>
                </button>
                {key ? <RemindClientButton engagementId={item.engagementId} itemKey={key} title={item.title} /> : null}
              </li>
            );
          })}
        </TodoGroup>
      </div>
    </DashSection>
  );
}

const ROW = 'flex items-center gap-2.5 border-t border-line-soft px-4 py-2.5 text-[13px] md:px-5';

function TodoGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <div className="flex h-8 items-center gap-2 border-t border-line-soft bg-surface-sunken px-4 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted md:px-5">
        {title}
        <span className="tracking-normal text-ink-faint tabular-nums">{count}</span>
      </div>
      <ul>{children}</ul>
    </>
  );
}

/** The lead's face when the item has one, else a person-plus button with a plain edge; both open the lead menu. */
function HandMenu({ item, owner, hand }: { item: InternWorkItem; owner: Person | undefined; hand: TodoHandOff }) {
  const movable = hand.canHand(item);
  const people = hand.leads.filter((l) => l.id !== owner?.id);
  const label = owner ? `With ${owner.name}. Hand to another project lead` : 'Hand to a project lead';
  if (!movable || people.length === 0) {
    return owner ? (
      <span title={`With ${owner.name}`} className="flex-none">
        <PersonAvatar name={owner.name} size={24} />
      </span>
    ) : null;
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            'grid h-7 w-7 flex-none place-items-center rounded-full text-ink-muted hover:text-ink',
            !owner && 'border-1.5 border-line-strong',
          )}
        >
          {owner ? <PersonAvatar name={owner.name} size={24} /> : <UserRoundPlus className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={12} className="max-h-[320px] w-[220px] overflow-y-auto">
        <DropdownMenuLabel className="pb-1 text-[12px] font-medium text-ink-muted">Hand to</DropdownMenuLabel>
        {people.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => hand.onHand(item, p)} className="flex h-[34px] items-center gap-2">
            <PersonAvatar name={p.name} size={24} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** New to-do dialog (prototype `NewTodoDialog`). The personal to-do store keeps a title only. */
export function NewTodoDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (title: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setText('');
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-medium">New to-do</DialogTitle>
        </DialogHeader>
        <form
          id="new-todo"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            onAdd(text.trim());
            onOpenChange(false);
          }}
        >
          <WorkField label="To-do">
            {(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={INTERN_FOCUS_TITLE_MAX} />}
          </WorkField>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-todo" disabled={!text.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
