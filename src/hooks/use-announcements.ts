'use client';

import { useQuery } from '@tanstack/react-query';
import type { Announcement, AnnouncementSource } from '@/lib/notifications/announcements';
import { fingerprintHead, useInvalidateOnHeadChange } from '@/lib/notifications/live-poll';

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? 'request_failed');
  }
  return data;
}

/**
 * Firm-wide announcements. Pass `limit` for a snapshot (client inbox).
 * Unbounded callers (bell / live popup / board) keep a 4s *head* poll and
 * only refetch this list when the board actually changes.
 */
export function useAnnouncements(limit?: number) {
  const live = limit == null;

  useInvalidateOnHeadChange({
    enabled: live,
    headQueryKey: ['announcements-head'],
    queryFn: async () => {
      const data = await readJson<{
        latestId: string | null;
        latestCreatedAt: string | null;
        latestUpdatedAt: string | null;
        count: number;
      }>(await fetch('/api/announcements?head=1'));
      return {
        fingerprint: fingerprintHead([data.latestId, data.latestCreatedAt, data.latestUpdatedAt, data.count]),
      };
    },
    invalidateQueryKey: ['announcements'],
  });

  return useQuery({
    queryKey: ['announcements', limit ?? 'all'],
    queryFn: async () => {
      const q = limit ? `?limit=${limit}` : '';
      return readJson<{ announcements: Announcement[]; canWrite: boolean }>(
        await fetch(`/api/announcements${q}`),
      );
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    notifyOnChangeProps: ['data', 'error'],
  });
}

export function useAnnouncementSources(enabled: boolean) {
  return useQuery({
    queryKey: ['announcement-sources'],
    enabled,
    queryFn: async () => {
      return readJson<{ sources: AnnouncementSource[] }>(await fetch('/api/announcements/sources'));
    },
    staleTime: 5 * 60_000,
  });
}
