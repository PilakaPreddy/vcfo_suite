'use client';

import { useQuery } from '@tanstack/react-query';
import { DROP_ACTIVE_STATUSES, type DropRunView, type DropStatus } from '@/lib/ask/drop/types';
import { fetchAskRun } from './ask-api';

const POLL_MS = 2_000;

export const askRunKey = (runId: string | null) => ['ask', 'run', runId] as const;

/** True while the background job is still working on the run, so the panel keeps polling. */
export function isRunActive(run: Pick<DropRunView, 'status'> | null | undefined): boolean {
  return Boolean(run && DROP_ACTIVE_STATUSES.includes(run.status as DropStatus));
}

/**
 * A drop's progress from GET /api/ask/runs/:id. It polls every two seconds while the run is queued
 * or running and stops once the run waits for the person, finishes or fails. A finished run is not
 * fetched again, so a past answer that shows its cards costs one request.
 */
export function useAskRun(runId: string | null) {
  return useQuery({
    queryKey: askRunKey(runId),
    queryFn: () => fetchAskRun(runId!),
    enabled: Boolean(runId),
    retry: false,
    staleTime: (query) => (isRunActive(query.state.data) ? 0 : Infinity),
    refetchInterval: (query) => (query.state.error ? false : !query.state.data || isRunActive(query.state.data) ? POLL_MS : false),
    refetchIntervalInBackground: true,
  });
}
