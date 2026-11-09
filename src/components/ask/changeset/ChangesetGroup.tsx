'use client';

import { useId, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import type { ChangesetGroupView, ChangesetRowView } from '@/lib/ask/changeset/view-types';
import { cn } from '@/lib/utils';

/**
 * One destination on a big review card (checklist values, one labour register, the vault and so on),
 * as a section that folds. The header always shows how many rows are ready, held and saved, and an
 * "Accept all clear" that ticks every clear row in this section, even while it is folded.
 */
export function ChangesetGroup({
  group,
  rows,
  expanded,
  onToggleExpanded,
  clearCount,
  onAcceptClear,
  renderRow,
}: {
  group: ChangesetGroupView;
  /** The group's rows in display order. */
  rows: ChangesetRowView[];
  expanded: boolean;
  onToggleExpanded: () => void;
  /** How many rows in this group "Accept all clear" would tick; the button shows only when there are some. */
  clearCount: number;
  onAcceptClear: () => void;
  renderRow: (row: ChangesetRowView) => ReactNode;
}) {
  const listId = useId();
  const files = new Set(rows.map((row) => row.sourceFile ?? ''));
  const showFiles = files.size > 1;
  const { ready, held, applied } = group.counts;
  return (
    <section aria-label={group.title} data-testid="changeset-group" className="border-b border-line last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-surface-sunken px-3 py-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] font-semibold text-ink"
        >
          <ChevronRight aria-hidden className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', expanded && 'rotate-90')} />
          <span className="min-w-0 break-words">{group.title}</span>
          <span className="shrink-0 font-normal text-ink-muted">({rows.length})</span>
        </button>
        <span className="flex flex-wrap items-center gap-1" data-testid="changeset-group-counts">
          {ready > 0 ? <Chip tone="ok">{ready} ready</Chip> : null}
          {held > 0 ? <Chip tone="warn">{held} held</Chip> : null}
          {applied > 0 ? <Chip tone="idle">{applied} saved</Chip> : null}
        </span>
        {clearCount > 0 ? (
          <Button type="button" size="sm" variant="ghost" aria-label={`Accept all clear in ${group.title}`} onClick={onAcceptClear}>
            Accept all clear
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <ul id={listId} className="divide-y divide-line">
          {rows.map((row, index) => {
            const file = row.sourceFile ?? '';
            const newFile = showFiles && (index === 0 || (rows[index - 1]!.sourceFile ?? '') !== file);
            return (
              <FragmentRow key={row.id} heading={newFile ? file || 'From your message' : null}>
                {renderRow(row)}
              </FragmentRow>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function FragmentRow({ heading, children }: { heading: string | null; children: ReactNode }) {
  return (
    <>
      {heading ? (
        <li className="break-words px-3 pb-0.5 pt-2 font-mono text-[12px] text-ink-muted" data-testid="changeset-file">
          {heading}
        </li>
      ) : null}
      {children}
    </>
  );
}
