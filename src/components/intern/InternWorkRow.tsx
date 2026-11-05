'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileInput,
  ListChecks,
  Mail,
  Send,
  Undo2,
  Zap,
} from 'lucide-react';
import { internKindStatus, internToneBadge, KIND_TONE } from '@/components/intern/intern-tones';
import { Chip } from '@/components/ui/spectrum-chip';
import { InternWorkCtaButton } from '@/components/intern/InternWorkCtaButton';
import { InternWorkDenseLayout } from '@/components/intern/InternWorkDenseLayout';
import { LeadCompanyChip } from '@/components/intern/LeadCompanyChip';
import { CHIP_CLASS } from '@/components/common/IconChip';
import { formatDueLabel, type InternWorkItem } from '@/lib/intern/intern-work';
import { cn } from '@/lib/utils';

const KIND_ICON = {
  rejected: Undo2,
  review: Mail,
  deliver: Send,
  overdue: AlertTriangle,
  'in-progress': Clock,
  'waiting-client': Clock,
  'waiting-manager': Clock,
  'waiting-request': FileInput,
  filing: Clock,
  task: ListChecks,
  done: CheckCircle2,
} as const;

/** R-13 status chip for a work item; the reason sits in the title. */
export function InternWorkKindChip({
  item,
  className,
}: {
  item: Pick<InternWorkItem, 'kind' | 'isOverdue' | 'why'>;
  className?: string;
}) {
  const status = internKindStatus(item);
  return (
    <Chip tone={status.tone} title={item.why} className={cn('max-w-full', className)}>
      {status.word}
    </Chip>
  );
}

function InternWorkDenseRow({
  item,
  showCompany = false,
  leading,
}: {
  item: InternWorkItem;
  showCompany?: boolean;
  leading?: ReactNode;
}) {
  return (
    <InternWorkDenseLayout
      leading={leading}
      title={
        <Link href={item.href} className="text-ink hover:underline" title={item.title}>
          {item.title}
        </Link>
      }
      subtitle={
        showCompany || item.windowLabel ? (
          <>
            {showCompany ? item.companyName : null}
            {showCompany && item.windowLabel ? ' · ' : null}
            {item.windowLabel ? (
              <span className="text-[11px] tabular-nums text-ink-muted">
                {item.windowLabel}
              </span>
            ) : null}
          </>
        ) : undefined
      }
      status={<InternWorkKindChip item={item} />}
      age={
        item.ageLabel ? (
          <span
            className={cn(
              CHIP_CLASS,
              'max-w-full overflow-hidden text-ellipsis',
              internToneBadge(item.kind === 'waiting-manager' ? 'danger' : 'neutral'),
            )}
          >
            {item.ageLabel}
          </span>
        ) : undefined
      }
      action={<InternWorkCtaButton item={item} />}
    />
  );
}

export function InternWorkQueueRow({ item }: { item: InternWorkItem }) {
  const tone = KIND_TONE[item.kind] ?? 'info';
  const Icon = KIND_ICON[item.kind] ?? Zap;
  return (
    <div className="border-t border-line py-2.5 pl-9 text-[13px]">
      <InternWorkDenseRow
        item={item}
        leading={
          <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md', internToneBadge(tone))}>
            <Icon className="h-3 w-3" strokeWidth={2.4} />
          </span>
        }
      />
    </div>
  );
}

/** Board card (prototype `WorkBoard`): company line, title, status chip and due date, then the row action. */
export function InternWorkBoardCard({
  item,
  dim,
  now,
  onOpen,
  owner,
}: {
  item: InternWorkItem;
  dim?: boolean;
  now?: Date;
  /** The project lead who holds the item, shown after the company on team boards. */
  owner?: string;
  /** Opens the task drawer. Without it the title links to the item's page. */
  onOpen?: (item: InternWorkItem) => void;
}) {
  const late = item.isOverdue && item.kind !== 'done';
  const done = item.kind === 'done';
  // G3: a done card shows a green tick, the Done chip and a muted card; never a strikethrough.
  const titleClass = cn(
    'block text-left text-[14px] font-medium leading-snug text-ink hover:underline',
    dim && 'text-ink-muted',
  );
  return (
    <article
      className={cn(
        'grid min-w-0 gap-2 rounded-md border-1.5 bg-surface-raised px-3 py-2.5',
        late ? 'border-danger-mid' : 'border-line',
        dim && 'opacity-70',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-muted">
        <LeadCompanyChip name={item.companyName} compact />
        <span className="truncate">
          {item.companyName}
          {owner ? ` · ${owner}` : ''}
        </span>
        {item.catalogLabel ? <span className="ml-auto flex-none font-mono">{item.catalogLabel}</span> : null}
      </div>
      <div className="flex min-w-0 items-start gap-1.5">
        {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-positive" strokeWidth={1.8} aria-label="Done" /> : null}
        {onOpen ? (
          <button type="button" onClick={() => onOpen(item)} title={item.title} className={cn(titleClass, 'line-clamp-2 min-w-0')}>
            {item.title}
          </button>
        ) : (
          <Link href={item.href} title={item.title} className={cn(titleClass, 'line-clamp-2 min-w-0')}>
            {item.title}
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <InternWorkKindChip item={item} className="min-w-0" />
        {now ? (
          <span className={cn('text-[12px] tabular-nums', late ? 'font-medium text-danger' : 'text-ink-muted')}>
            {formatDueLabel(item.dueAt, now)}
          </span>
        ) : null}
      </div>
      <InternWorkCtaButton item={item} className="w-full" />
    </article>
  );
}
