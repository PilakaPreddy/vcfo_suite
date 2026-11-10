'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { useMyDay } from '@/hooks/use-my-day';
import { MY_DAY_LABEL, type MyDayKind } from '@/lib/my-day/rank';

/** Chip tone per kind: overdue red, today amber, decisions violet, replies blue, the rest calm. */
const TONE: Record<MyDayKind, ChipTone> = {
  overdue: 'bad',
  due_today: 'warn',
  approval: 'violet',
  client_reply: 'prog',
  expiry: 'warn',
  notice: 'teal',
  request_list: 'idle',
  task: 'idle',
};

/**
 * "My day" (IDEAS-PLAN section F): the top of the caller's ranked plan from GET /api/my-day, one
 * card for every staff role. The ranking and the links come from the server, so this card, the
 * morning email and Ask VCFO's "plan my day" agree.
 */
export function MyDayCard({ limit = 8, className }: { limit?: number; className?: string }) {
  const { data, isLoading, isError } = useMyDay(limit);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const overdue = data?.counts.overdue ?? 0;
  const meta = data ? `${total} item${total === 1 ? '' : 's'}${overdue ? ` · ${overdue} overdue` : ''}` : undefined;

  return (
    <DashSection title="My day" meta={meta} flush loading={isLoading} className={className}>
      {isError ? (
        <div className="p-4 md:px-5">
          <EmptyState title="Your plan could not load. Refresh to try again." />
        </div>
      ) : items.length === 0 ? (
        <div className="p-4 md:px-5">
          <EmptyState title="Nothing urgent today." />
        </div>
      ) : (
        <ol className="divide-y divide-line-soft">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex min-h-[52px] min-w-0 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover md:px-5"
              >
                <Chip tone={TONE[item.kind]} raw fixed>
                  {MY_DAY_LABEL[item.kind]}
                </Chip>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] text-ink">{item.title}</span>
                  <span className="truncate text-[12px] text-ink-muted">
                    {item.companyName}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-ink-muted" strokeWidth={1.6} aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </DashSection>
  );
}
