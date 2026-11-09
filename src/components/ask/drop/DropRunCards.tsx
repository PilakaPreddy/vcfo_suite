'use client';

import { useAskRun } from '@/hooks/ask/use-ask-run';
import { AskChangesetCard } from '../AskChangesetCard';

/**
 * A drop that touched several clients makes one review card per client, but its closing answer
 * carries only the first card. This shows the other clients' cards under that answer, read from the
 * run, so they also come back when the chat is reopened later.
 */
export function DropRunCards({ runId, shownChangesetId }: { runId: string; shownChangesetId?: string }) {
  const { data } = useAskRun(runId);
  const others = (data?.groups ?? []).filter((g) => g.changesetId !== shownChangesetId);
  if (others.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {others.map((group) => (
        <AskChangesetCard key={group.changesetId} changesetId={group.changesetId} />
      ))}
    </div>
  );
}
