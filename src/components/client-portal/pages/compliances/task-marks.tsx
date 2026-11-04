'use client';

/**
 * Marks for non-statutory tasks on the client portal (COMPLIANCE-MODEL.md S-6, S-7 and C-1):
 * the urgency pill with signal bars, the visibility tag, the hollow task square of the
 * calendar and the Statutory / Non-statutory / All switch. Urgency stays neutral: red is for
 * late work only (R-03); only "Critical" fills its bars with warning-mid.
 */
import { Building2, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import type { PortalFiling } from '@/lib/client-portal/compliances';
import { AreaTag, PortalLink } from './spectrum';
import { URGENCY_BARS, isTaskRow, taskHint, urgencyLabel, type CalRow, type Category } from './tasks';

export function UrgencyPill({ urgency, className }: { urgency: string; className?: string }) {
  const word = urgencyLabel(urgency);
  const n = URGENCY_BARS[word] ?? 1;
  const critical = word === 'Critical';
  return (
    <span
      className={cn('inline-flex h-6 w-[88px] flex-none items-center gap-2 rounded-md border-1.5 border-line bg-surface-raised px-2 text-[12.5px] font-medium text-ink-2', className)}
      title={`Urgency: ${word}`}
    >
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn('w-[3px] rounded-bar', i <= n ? (critical ? 'bg-warning-mid' : 'bg-ink-2') : 'bg-line-strong')}
            style={{ height: `${3 + i * 2}px` }}
          />
        ))}
      </span>
      {word}
    </span>
  );
}

const VIS = {
  firm: { Icon: Building2, word: 'Firm', tip: 'Visible to the firm only' },
  client: { Icon: User, word: 'Client', tip: 'Visible to you and SBC' },
  both: { Icon: Users, word: 'Both', tip: 'Visible to the firm and the client' },
} as const;

function VisibilityTag({ visibility, className }: { visibility: string; className?: string }) {
  const v = VIS[visibility as keyof typeof VIS] ?? VIS.both;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] text-ink-2', className)} title={v.tip}>
      <v.Icon size={15} strokeWidth={1.6} aria-hidden className="text-ink-muted" />
      {v.word}
    </span>
  );
}

/** C-3: the hollow 8px square a task carries on the calendar, in ink-2. */
function TaskSquare({ className }: { className?: string }) {
  return <i aria-hidden className={cn('inline-block h-2 w-2 flex-none rounded-[2px] border-1.5 border-ink-2 bg-transparent', className)} />;
}

/** S-1, K-1, C-1, F-1: the category switch with counts. The calendar and Filings put All first. */
export function CategoryTabs({
  value,
  onChange,
  stat,
  ns,
  allFirst,
  className,
}: {
  value: Category;
  onChange: (c: Category) => void;
  stat: number;
  ns: number;
  allFirst?: boolean;
  className?: string;
}) {
  const all = { key: 'all', label: 'All', count: stat + ns };
  const items = [
    { key: 'statutory', label: 'Statutory', count: stat },
    { key: 'non-statutory', label: 'Non-statutory', count: ns },
  ];
  return (
    <SpectrumTabs
      label="Category"
      className={className}
      value={value}
      onChange={(k) => onChange(k as Category)}
      items={allFirst ? [all, ...items] : [...items, all]}
    />
  );
}

/**
 * The area of a register row, or "Task" with the hollow square for a non-statutory task
 * (C-3: it has no regulator; the hover gives the start date and the urgency).
 */
export function RowArea({ r, compact, className }: { r: CalRow; compact?: boolean; className?: string }) {
  if (!isTaskRow(r)) return <AreaTag a={r.area} compact={compact} className={className} />;
  return (
    <span
      title={taskHint(r.task)}
      className={cn(
        'inline-flex flex-none items-center gap-1.5 rounded-sm border-1.5 border-line bg-surface-raised font-medium text-ink-2',
        compact ? 'h-5 px-1.5 text-[11px]' : 'h-6 w-[104px] px-2 text-[12.5px]',
        className,
      )}
    >
      <TaskSquare className={compact ? 'h-1.5 w-1.5' : undefined} />
      Task
    </span>
  );
}

/** The portal ↗ link of a filing; a task has none. */
export function RowPortalLink({ r }: { r: PortalFiling }) {
  return isTaskRow(r) ? null : <PortalLink f={r} />;
}
