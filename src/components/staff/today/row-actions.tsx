'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { ArrowUpRight, BellRing, Check, Copy, MoreHorizontal, Pencil, UserRoundPlus, Users, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BULK_BUTTON } from '@/components/ui/bulk-bar';
import { Kbd } from '@/components/ui/kbd';
import { Tip } from '@/components/ui/tip';
import { cn } from '@/lib/utils';

/* Small parts for the staff tables' row quick actions (E-02) and the bulk bar's Assign (E-01). */

/** A ghost 28px icon button at the row end, with its name and key in a dark tip. */
function RowIconButton({
  label,
  shortcut,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tip label={label} keys={shortcut ? [shortcut] : undefined} side="top">
      <button
        type="button"
        data-grid-ctl
        tabIndex={-1}
        aria-label={label}
        aria-keyshortcuts={shortcut}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-ink/[.06] hover:text-ink disabled:pointer-events-none disabled:opacity-40"
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
      </button>
    </Tip>
  );
}

/** Open, Remind and Reassign at a row end. Leave a handler out to hide its button. */
export function RowQuickActions({
  onOpen,
  onRemind,
  onReassign,
  children,
}: {
  onOpen?: () => void;
  onRemind?: () => void;
  onReassign?: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      {onOpen ? <RowIconButton label="Open" shortcut="Enter" icon={ArrowUpRight} onClick={onOpen} /> : null}
      {onRemind ? <RowIconButton label="Remind" shortcut="R" icon={BellRing} onClick={onRemind} /> : null}
      {onReassign ? <RowIconButton label="Reassign" shortcut="A" icon={UserRoundPlus} onClick={onReassign} /> : null}
      {children}
    </>
  );
}

/** The bulk bar's Assign: a menu of the people the picked rows can go to. */
export function BulkAssignMenu({
  people,
  count,
  onPick,
  disabled,
}: {
  people: Array<{ id: string; name: string }>;
  count: number;
  onPick: (person: { id: string; name: string }) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={BULK_BUTTON} disabled={disabled || people.length === 0} aria-label={`Assign ${count} selected`}>
          <UserRoundPlus className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
          <span className="max-sm:sr-only" aria-hidden>
            Assign
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={12} className={cn('max-h-[320px] w-[220px] overflow-y-auto normal-case tracking-normal')}>
        <DropdownMenuLabel className="pb-1 text-[12px] font-medium text-ink-muted">Assign to</DropdownMenuLabel>
        {people.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => onPick(p)} className="flex h-[34px] items-center">
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Person = { id: string; name: string };

/** Reassign in the row menu: a side list of people, or (for a row that moves with its client) the dialog. */
export type RowReassign =
  | { people: Person[]; currentId?: string | null; onPick: (person: Person) => void }
  | { onOpen: () => void };

const MENU_ROW = 'h-[34px] gap-2.5 px-[9px]';
const MENU_ICON = 'h-4 w-4 flex-none text-ink-muted';

/**
 * D1 row menu (VCFO Spectrum M-27): the "..." at a row end with Edit (E), Reassign (A) and Copy
 * link (C), each with an icon and its key. The keys work while the menu is open; the tables
 * also bind them on a focused row. Leave an action out to hide it; with none, nothing renders.
 */
export function RowMoreMenu({ onEdit, reassign, link }: { onEdit?: () => void; reassign?: RowReassign; link?: () => void }) {
  if (!onEdit && !reassign && !link) return null;
  // A opens the side list the way ArrowRight does, so focus moves into it.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.toLowerCase() !== 'a' || e.ctrlKey || e.metaKey || e.altKey || !reassign || !('people' in reassign)) return;
    const trigger = e.currentTarget.querySelector<HTMLElement>('[data-row-reassign]');
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    trigger.focus();
    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  };
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-grid-ctl
          tabIndex={-1}
          aria-label="More actions"
          title="More actions"
          onClick={(e) => e.stopPropagation()}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-ink/[.06] hover:text-ink data-[state=open]:bg-ink/[.06] data-[state=open]:text-ink"
        >
          <MoreHorizontal className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      {/* Clicks and keys inside the portal still bubble through React to the row; stop them here. */}
      <DropdownMenuContent
        align="end"
        collisionPadding={12}
        className="min-w-[200px] p-[5px] normal-case tracking-normal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {onEdit ? (
          <DropdownMenuItem shortcut="e" onSelect={onEdit} className={MENU_ROW}>
            <Pencil className={MENU_ICON} strokeWidth={1.6} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Edit</span>
          </DropdownMenuItem>
        ) : null}
        {reassign && 'people' in reassign ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-row-reassign aria-keyshortcuts="A" className={cn(MENU_ROW, 'text-[14px]')}>
              <Users className={MENU_ICON} strokeWidth={1.6} aria-hidden />
              <span className="min-w-0 flex-1 truncate">Reassign</span>
              <Kbd>A</Kbd>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              sideOffset={8}
              collisionPadding={12}
              className="max-h-[320px] w-[220px] overflow-y-auto p-[5px]"
              onClick={(e) => e.stopPropagation()}
              // Letters typed here search the names; they must not reach the main menu's keys.
              onKeyDown={(e) => {
                if (e.key.length === 1) e.stopPropagation();
              }}
            >
              <DropdownMenuLabel className="pb-1 text-[12px] font-medium text-ink-muted">Assign to</DropdownMenuLabel>
              {reassign.people.length === 0 ? (
                <p className="px-[9px] py-1.5 text-[13px] text-ink-muted">No one else to assign</p>
              ) : (
                reassign.people.map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => reassign.onPick(p)} className={MENU_ROW}>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.id === reassign.currentId ? <Check className="h-3.5 w-3.5 flex-none text-brand-text" strokeWidth={1.6} aria-label="Current" /> : null}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : reassign && 'onOpen' in reassign ? (
          <DropdownMenuItem shortcut="a" onSelect={reassign.onOpen} className={MENU_ROW}>
            <Users className={MENU_ICON} strokeWidth={1.6} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Reassign</span>
          </DropdownMenuItem>
        ) : null}
        {link ? (
          <DropdownMenuItem shortcut="c" onSelect={link} className={MENU_ROW}>
            <Copy className={MENU_ICON} strokeWidth={1.6} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Copy link</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
