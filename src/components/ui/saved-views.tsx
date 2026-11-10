'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  activeView,
  addSavedView,
  readSavedViews,
  viewLabelTaken,
  writeSavedViews,
  type SavedView,
  type ViewFilters,
} from '@/lib/ui/table-prefs';

export type { SavedView, ViewFilters };

export interface SavedViewsProps {
  /** Per user and per table, for example "manager:work". The person's views live in localStorage under it. */
  storageKey: string;
  /** Default views ("All", "My overdue", "This week", "Waiting on clients"). */
  views: SavedView[];
  /** The filters on the table now. */
  current: ViewFilters;
  onApply: (filters: ViewFilters) => void;
  className?: string;
}

/**
 * E-06 saved views (VCFO Spectrum): a segmented tab row (R-11) above a big table. A view is a named
 * set of filters; the one that matches the current filters is picked. "+ Save view" keeps the
 * current filters under a name in this browser (localStorage, behind try/catch). A saved view can
 * be removed while it is picked. Default views cannot be removed.
 */
export function SavedViews({ storageKey, views, current, onApply, className }: SavedViewsProps) {
  const [mine, setMine] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => setMine(readSavedViews(storageKey)), [storageKey]);

  const all = [...views, ...mine];
  const on = activeView(all, current);
  const taken = viewLabelTaken(all, name);

  const save = () => {
    const next = addSavedView(mine, name, current, { others: views });
    if (!next) return;
    setMine(next);
    writeSavedViews(storageKey, next);
    setName('');
    setOpen(false);
  };
  const remove = (key: string) => {
    const next = mine.filter((v) => v.key !== key);
    setMine(next);
    writeSavedViews(storageKey, next);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div
        role="tablist"
        aria-label="Views"
        className="inline-flex max-w-full flex-none items-center gap-0.5 overflow-x-auto rounded-md border-1.5 border-line bg-surface-sunken p-[3px] [scrollbar-width:none]"
      >
        {all.map((v) => {
          const picked = v.key === on;
          const custom = mine.some((m) => m.key === v.key);
          return (
            <span key={v.key} className={cn('inline-flex flex-none items-center rounded-sm', picked && 'bg-brand text-on-brand shadow-shine')}>
              <button
                type="button"
                role="tab"
                aria-selected={picked}
                onClick={() => onApply({ ...v.filters })}
                className={cn(
                  'inline-flex h-[22px] items-center whitespace-nowrap rounded-sm px-3 text-[13px] font-medium transition-colors',
                  picked ? 'text-on-brand' : 'text-ink-2 hover:text-ink',
                  picked && custom && 'pr-1.5',
                )}
              >
                {v.label}
              </button>
              {picked && custom ? (
                <button
                  type="button"
                  onClick={() => remove(v.key)}
                  aria-label={`Remove view ${v.label}`}
                  title="Remove view"
                  className="mr-1 grid h-4 w-4 place-items-center rounded-sm text-on-brand hover:bg-white/[.18]"
                >
                  <X className="h-3 w-3" strokeWidth={1.6} aria-hidden />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setName('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!!on}
            title={on ? 'These filters are a view already' : undefined}
            className="inline-flex h-7 flex-none items-center gap-1.5 rounded-md border-1.5 border-line-strong px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-sunken disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent data-[state=open]:bg-surface-sunken"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
            Save view
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[260px] p-0" aria-label="Save view">
          <form
            className="grid gap-2.5 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- deliberate: focuses the name field when the popover opens */}
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" aria-label="View name" maxLength={32} />
            <Button type="submit" size="sm" disabled={!name.trim() || taken} className="justify-self-end">
              Save view
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
