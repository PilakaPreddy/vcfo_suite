'use client';

import { useState } from 'react';
import { Plus, RotateCw } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { WatchIntakeDialog } from '@/components/watch/WatchIntakeDialog';
import { WatchReviewDialog } from '@/components/watch/WatchReviewDialog';
import { HEALTH_TONE, STATUS_LOOK } from '@/components/watch/watch-labels';
import { useWatchRetest, useWatchSources, useWatchUpdates } from '@/hooks/use-watch';
import { isAdminOrManager } from '@/lib/auth';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { formatSourceDate, HEALTH_LABEL } from '@/lib/watch/source-status';
import type { RegUpdateListItem, WatchSourceStatus } from '@/lib/watch/types';

const VIEW_OPTIONS = [
  { value: 'queue', label: 'To review' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

/** A source someone must act on comes first, so a problem never sits below fifteen working rows. */
const needsEye = (source: WatchSourceStatus): boolean => source.type !== 'manual' && source.type !== 'email' && source.health !== 'ok' && source.health !== 'unknown';

const dated = (iso: string | null): string | null => (iso ? formatSourceDate(new Date(iso)) : null);

function UpdateRow({ update, onOpen }: { update: RegUpdateListItem; onOpen: () => void }) {
  const look = STATUS_LOOK[update.status];
  const meta = [update.sourceName ?? (update.intake === 'manual' ? 'Added by hand' : null), dated(update.publishedOn ?? update.createdAt), update.newDueDate && `New due date ${dated(update.newDueDate)}`];
  return (
    <li className="border-t border-line-soft first:border-t-0">
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 flex-col gap-1.5 px-4 py-3 text-left hover:bg-surface-sunken sm:flex-row sm:items-center sm:gap-3">
        <span className="flex-none">
          <Chip raw tone={look.tone} className="min-w-[132px]">
            {look.label}
          </Chip>
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[14px] text-ink sm:line-clamp-1">{update.title}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">{meta.filter(Boolean).join(' · ')}</span>
        </span>
        {update.importance === 'important' ? <Tag tone="bad" className="self-start sm:self-auto">Important</Tag> : null}
        {update.importance === 'staff_only' ? <Tag className="self-start sm:self-auto">Staff only</Tag> : null}
      </button>
    </li>
  );
}

function SourceRow({ source, canRetest }: { source: WatchSourceStatus; canRetest: boolean }) {
  const retest = useWatchRetest();
  const manual = source.type === 'manual' || source.type === 'email';
  const lastGood = dated(source.lastSuccessAt);
  const stuck = source.health === 'blocked' || source.health === 'failing' || source.health === 'empty';
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line-soft px-4 py-2.5 first:border-t-0">
      <span className="flex-none">
        <Chip raw tone={manual ? 'idle' : HEALTH_TONE[source.health]} className="min-w-[116px]">
          {manual ? 'Added by hand' : HEALTH_LABEL[source.health]}
        </Chip>
      </span>
      <a href={source.url} target="_blank" rel="noreferrer" className="order-first min-w-0 basis-full truncate text-[14px] text-ink hover:underline sm:order-none sm:flex-1 sm:basis-0">
        {source.name}
      </a>
      <span className="text-[12.5px] tabular-nums text-ink-muted">{manual ? 'Not read automatically' : lastGood ? `Last good check ${lastGood}` : 'No good check yet'}</span>
      {canRetest && stuck && !manual ? (
        <Button
          variant="quiet"
          size="sm"
          disabled={retest.isPending}
          onClick={() =>
            retest.mutate(source.id, {
              onSuccess: () => toastSuccess('Check requested', 'It runs with the next hourly check.'),
              onError: (err) => toastError('Could not request a check', err.message),
            })
          }
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Check again
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Official updates for staff: the review queue beside the health of every source, so a quiet source
 * never reads as a quiet law. Project leads read and may add an update; reviewers do the rest.
 */
export default function WatchPage() {
  const { user } = useApp();
  const canReview = isAdminOrManager(user?.role);
  const [view, setView] = useState('queue');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const updates = useWatchUpdates(view);
  const sources = useWatchSources();
  const list = updates.data?.updates ?? [];
  const sourceList = [...(sources.data?.sources ?? [])].sort((a, b) => Number(needsEye(b)) - Number(needsEye(a)));

  return (
    <div className="grid min-w-0 gap-4">
      <DashSection
        title="Review queue"
        meta={updates.isLoading ? undefined : list.length}
        flush
        right={
          <div className="flex items-center gap-2">
            <FilterSelect aria-label="Which updates" options={VIEW_OPTIONS} value={view} onChange={(event) => setView(event.target.value)} />
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add update
            </Button>
          </div>
        }
      >
        {updates.isLoading ? (
          <SkeletonRows />
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState title={view === 'queue' ? 'Nothing waiting for review' : 'No updates here'} />
          </div>
        ) : (
          <ul>
            {list.map((update) => (
              <UpdateRow key={update.id} update={update} onOpen={() => setOpenId(update.id)} />
            ))}
          </ul>
        )}
      </DashSection>

      <DashSection title="Official sources" meta={sources.isLoading ? undefined : sourceList.length} flush>
        {sources.isLoading ? (
          <SkeletonRows />
        ) : (
          <ul>
            {sourceList.map((source) => (
              <SourceRow key={source.id} source={source} canRetest={canReview} />
            ))}
          </ul>
        )}
      </DashSection>

      <WatchReviewDialog id={openId} canReview={canReview} onClose={() => setOpenId(null)} />
      <WatchIntakeDialog open={adding} onOpenChange={setAdding} sources={sourceList} />
    </div>
  );
}
