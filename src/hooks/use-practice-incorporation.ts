'use client';

import { useQuery } from '@tanstack/react-query';
import type { PracticeIncorporationClient } from '@/lib/practice/practice-incorporation';

/**
 * The read behind the staff Incorporation page (R-51). It goes through
 * `/api/practice/incorporation`, which runs the repository under the caller's `AuthContext`.
 */
const PRACTICE_INCORPORATION_QUERY_KEY = ['practice', 'incorporation'] as const;

async function fetchPracticeIncorporation(): Promise<PracticeIncorporationClient[]> {
  const res = await fetch('/api/practice/incorporation');
  const data = (await res.json().catch(() => ({}))) as { clients?: PracticeIncorporationClient[]; error?: string };
  if (!res.ok || !data.clients) {
    throw new Error(data.error ?? 'Could not load incorporation');
  }
  return data.clients;
}

export function usePracticeIncorporation() {
  return useQuery({
    queryKey: PRACTICE_INCORPORATION_QUERY_KEY,
    queryFn: fetchPracticeIncorporation,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
