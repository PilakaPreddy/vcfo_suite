'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RegReviewEdit, RegUpdateDetail, RegUpdateListItem, RegVerifyProblem, WatchSourceStatus } from '@/lib/watch/types';

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'request_failed');
  return data;
}

const send = <T>(url: string, method: string, body: unknown): Promise<T> =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((res) => readJson<T>(res));

/** Whether this person's sidebar shows Official updates. */
export function useWatchEnabled(enabled: boolean): boolean {
  const query = useQuery({
    queryKey: ['watch-status'],
    enabled,
    staleTime: 300_000,
    queryFn: async () => readJson<{ enabled: boolean }>(await fetch('/api/watch/status')),
  });
  return query.data?.enabled === true;
}

const IN_PROGRESS = new Set(['queued', 'read']);

export function useWatchUpdates(view: string) {
  return useQuery({
    queryKey: ['watch-updates', view],
    queryFn: async () => readJson<{ updates: RegUpdateListItem[] }>(await fetch(`/api/watch/updates?view=${view}`)),
    // A document being read turns into a summary within a minute, so the queue looks again until then.
    refetchInterval: (query) => (query.state.data?.updates.some((u) => IN_PROGRESS.has(u.status)) ? 8_000 : false),
  });
}

export function useWatchUpdate(id: string | null) {
  return useQuery({
    queryKey: ['watch-update', id],
    enabled: id != null,
    queryFn: async () => readJson<{ update: RegUpdateDetail }>(await fetch(`/api/watch/updates/${id}`)),
  });
}

export function useWatchSources() {
  return useQuery({
    queryKey: ['watch-sources'],
    queryFn: async () => readJson<{ sources: WatchSourceStatus[] }>(await fetch('/api/watch/sources')),
  });
}

function useWatchRefresh() {
  const client = useQueryClient();
  return () =>
    Promise.all(['watch-updates', 'watch-update', 'watch-sources', 'announcements'].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

export function useWatchActions(id: string | null) {
  const refresh = useWatchRefresh();
  const url = `/api/watch/updates/${id}`;
  const edit = useMutation({
    mutationFn: (fields: RegReviewEdit) => send<{ problems: RegVerifyProblem[] }>(url, 'PATCH', fields),
    onSuccess: refresh,
  });
  const act = useMutation({
    mutationFn: (body: { action: 'publish' | 'retry' } | { action: 'reject'; reason: string }) => send<{ ok: true }>(url, 'POST', body),
    onSuccess: refresh,
  });
  return { edit, act };
}

export function useWatchRetest() {
  const refresh = useWatchRefresh();
  return useMutation({
    mutationFn: (id: string) => send<{ ok: true }>(`/api/watch/sources/${id}`, 'POST', {}),
    onSuccess: refresh,
  });
}

export function useWatchIntake() {
  const refresh = useWatchRefresh();
  return useMutation({
    mutationFn: async (form: FormData) => readJson<{ id: string }>(await fetch('/api/watch/intake', { method: 'POST', body: form })),
    onSuccess: refresh,
  });
}
