'use client';

import { MessageSquare, MoreHorizontal, Paperclip, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { sumSeries } from '@/lib/budget/engine';
import type { BudgetRow, BudgetSection, RowKind } from '@/lib/budget/model';
import { cn } from '@/lib/utils';
import { GRID, GridScroll, STICKY, TD, TD_NAME, TH } from './cells';
import { inr, sectionLabel } from './format';
import type { Ready } from './types';

/** The parts the fill-in grids share. */

export function MonthHeads({ labels }: { labels: string[] }) {
  return (
    <>
      {labels.map((l) => (
        <th key={l} className={cn(TH, 'min-w-[84px]')}>
          {l}
        </th>
      ))}
    </>
  );
}

/** Calculated cells have no raised surface, so they never look like somewhere to type. */
export function CalcCells({ series, total = true }: { series: number[]; total?: boolean }) {
  return (
    <>
      {series.map((v, i) => (
        <td key={i} className={cn(TD, 'bg-surface-sunken text-ink-muted')}>
          {inr(v)}
        </td>
      ))}
      {total ? <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(sumSeries(series))}</td> : null}
    </>
  );
}

/** Opens the row panel: the less common fields, comments, documents and history. */
export function MoreCell({ ready, row }: { ready: Ready; row: BudgetRow }) {
  const comments = ready.view.commentCounts[row.id] ?? 0;
  const files = ready.view.attachmentCounts[row.id] ?? 0;
  return (
    <td className={cn(TD_NAME, 'w-[1%] px-1')}>
      <button type="button" className="flex h-7 items-center gap-1 rounded px-1.5 text-[12px] text-ink-muted hover:bg-hover" aria-label="More for this row" onClick={() => ready.openRow(row.id)}>
        {comments ? (
          <span className="flex items-center gap-0.5">
            <MessageSquare size={12} /> {comments}
          </span>
        ) : null}
        {files ? (
          <span className="flex items-center gap-0.5">
            <Paperclip size={12} /> {files}
          </span>
        ) : null}
        <MoreHorizontal size={14} />
      </button>
    </td>
  );
}

export function AddRow({ ready, kind, section, label }: { ready: Ready; kind: RowKind; section: BudgetSection; label: string }) {
  if (!ready.canEdit(section)) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => void ready.b.addRow(kind)}>
      <Plus className="h-4 w-4" /> {label}
    </Button>
  );
}

export function NoRows({ ready, kind, section, title, label }: { ready: Ready; kind: RowKind; section: BudgetSection; title: string; label: string }) {
  return <EmptyState title={title} action={<AddRow ready={ready} kind={kind} section={section} label={label} />} />;
}

/** Errors and warnings for one tab, in words the owner can act on. */
export function IssueList({ ready, section }: { ready: Ready; section: BudgetSection }) {
  const issues = ready.result.issues.filter((i) => i.section === section);
  if (!issues.length) return null;
  return (
    <ul className="rounded-lg border border-line bg-surface-raised px-4 py-2.5 text-[13px]" aria-label={`Items to correct on ${sectionLabel(section)}`}>
      {issues.map((issue, i) => (
        <li key={i} className={issue.severity === 'error' ? 'text-danger' : 'text-ink-muted'}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

export { GRID, GridScroll, STICKY, TD, TD_NAME, TH };
