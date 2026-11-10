'use client';

import { useQuery } from '@tanstack/react-query';
import type { MyDayKind, RankedMyDayItem } from '@/lib/my-day/rank';

export interface MyDayResponse {
  today: string;
  total: number;
  counts: Record<MyDayKind, number>;
  items: RankedMyDayItem[];
}

/** The caller's ranked plan for today (GET /api/my-day), the top `limit` items. */
export function useMyDay(limit = 8) {
  return useQuery({
    queryKey: ['my-day', limit],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<MyDayResponse> => {
      const res = await fetch(`/api/my-day?limit=${limit}`, { credentials: 'same-origin' });
      const out = (await res.json().catch(() => ({}))) as MyDayResponse & { error?: string };
      if (!res.ok) throw new Error(out.error ?? String(res.status));
      return out;
    },
  });
}
