'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAskOptional } from '@/components/ask/ask-context';

/** Window event that opens the sheet, for a sidebar button or a menu row. */
const SHORTCUT_SHEET_EVENT = 'vcfo:shortcuts';

/** Open the shortcut sheet from anywhere (the sidebar keyboard button, a menu row). */
export function openShortcuts() {
  window.dispatchEvent(new Event(SHORTCUT_SHEET_EVENT));
}

type Row = [keys: string[], what: string];

/** True when the person is typing, so "?" stays a character. */
function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** The groups the sheet lists. Ask VCFO rows show only for the roles that have Ask. */
function shortcutGroups(hasAsk: boolean): Array<[string, Row[]]> {
  return [
    [
      'Everywhere',
      [
        [['Ctrl', 'K'], 'Search clients, projects and documents'],
        ...(hasAsk
          ? ([
              [['/'], 'Ask VCFO'],
              [['Ctrl', 'J'], 'Open or close Ask VCFO'],
            ] as Row[])
          : []),
        [['?'], 'This list of shortcuts'],
        [['['], 'Pin or collapse the sidebar'],
        [['Esc'], 'Close a menu, dialog or panel'],
      ],
    ],
    [
      'Tables',
      [
        [['Tab'], 'Move to the next row or control'],
        [['Enter'], 'Open the focused row'],
        [['Space'], "Tick a row's checkbox, where rows can be selected"],
        [['R'], 'Remind (focused task row, where shown)'],
        [['A'], 'Assign (focused task row, where shown)'],
      ],
    ],
    [
      'Menus',
      [
        [['↑', '↓'], 'Move between items'],
        [['Enter'], 'Run the item'],
        [['A–Z'], 'Run the item that shows that key'],
      ],
    ],
  ];
}

/**
 * E-10 (VCFO Spectrum): "?" opens a sheet that lists every keyboard shortcut. Not while typing.
 * `openShortcuts()` opens it too. Mount it once in the shell.
 */
export function ShortcutSheet() {
  const [open, setOpen] = useState(false);
  const hasAsk = Boolean(useAskOptional()?.enabled);
  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener(SHORTCUT_SHEET_EVENT, show);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(SHORTCUT_SHEET_EVENT, show);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100dvh-48px)] max-w-[520px] gap-5 overflow-y-auto">
        <div className="grid gap-1">
          <DialogTitle className="text-[17px] font-medium leading-6">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">Every keyboard shortcut in VCFO Suite.</DialogDescription>
        </div>
        {shortcutGroups(hasAsk).map(([group, rows]) => (
          <section key={group}>
            <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted">{group}</h3>
            <ul className="grid">
              {rows.map(([keys, what]) => (
                <li key={what} className="flex items-center gap-3 border-t border-line-soft py-2 text-[14px] first:border-t-0">
                  <span className="min-w-0 flex-1 text-ink-2">{what}</span>
                  <span className="flex flex-none gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="grid h-6 min-w-6 place-items-center rounded-mark border border-line bg-surface-sunken px-1.5 font-sans text-[12px] font-medium text-ink"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
