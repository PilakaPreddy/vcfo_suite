'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Visual } from '@/data/ask/schema';
import { askProjectPath } from '@/lib/ask/resolve-href';
import { useAskLinkBase } from '@/components/ask/use-ask-link-base';
import { cn } from '@/lib/utils';

type ProjectRowsVisual = Extract<Visual, { type: 'projectRows' }>;



export function ProjectRows({ visual }: { visual: ProjectRowsVisual }) {
  const base = useAskLinkBase();
  if (visual.rows.length === 0) return null;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-md)] border border-line">
      {visual.rows.map((row, i) => (
        <li key={`${row.engagementId}-${i}`}>
          <Link
            href={askProjectPath(row.engagementId, base)}
            className="flex min-h-[44px] items-center gap-2 px-3 py-2 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{row.name}</span>
              <span className="block truncate text-[11.5px] text-ink-muted">{row.step}</span>
            </span>
            {row.meta && (
              <span
                className={cn(
                  'shrink-0 rounded-sm px-2 py-px text-[11px] font-medium',
                  row.tone === 'late' && 'bg-danger-soft text-danger',
                  row.tone === 'waiting' && 'bg-warning-soft text-warning',
                  row.tone === 'plain' && 'bg-surface-sunken text-ink-muted',
                )}
              >
                {row.meta}
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
