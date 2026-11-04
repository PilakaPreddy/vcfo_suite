'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EngagementNote } from '@/lib/notes/types';

/**
 * React Query wrappers for the staff notes routes (G-19):
 * `GET/POST /api/engagements/<id>/notes`, `PATCH/DELETE /api/engagements/<id>/notes/<noteId>`.
 */

const notesKey = (engagementId: string) => ['engagement-notes', engagementId] as const;

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? String(res.status));
  return out;
}

const base = (engagementId: string) => `/api/engagements/${encodeURIComponent(engagementId)}/notes`;

export function useEngagementNotes(engagementId: string) {
  return useQuery({
    queryKey: notesKey(engagementId),
    enabled: Boolean(engagementId),
    staleTime: 15_000,
    queryFn: async () => (await send<{ notes: EngagementNote[] }>(base(engagementId))).notes,
  });
}

export function useNoteMutations(engagementId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: notesKey(engagementId) });
  const add = useMutation({
    mutationFn: (input: { body: string; pinned?: boolean }) =>
      send<{ note: EngagementNote }>(base(engagementId), { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; body?: string; pinned?: boolean }) =>
      send<{ note: EngagementNote }>(`${base(engagementId)}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => send<{ ok: true }>(`${base(engagementId)}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return { add, update, remove };
}
