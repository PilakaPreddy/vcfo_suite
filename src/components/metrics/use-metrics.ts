'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnalyticsMetrics, PersonMetrics, PracticeMetrics } from '@/lib/metrics/practice-metrics';
import type { StepTiming } from '@/lib/metrics/step-timing';

/**
 * React Query hooks for the metrics routes (G-13, G-14, G-27, G-29). Views never touch `db`;
 * each route runs the metrics repository under the caller's `AuthContext`.
 */

async function getJson<T>(url: string, key: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok || !(key in body)) throw new Error(body.error ?? 'Could not load');
  return body[key] as T;
}

async function sendJson(url: string, method: 'PUT' | 'PATCH', payload: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'Could not save');
  return body;
}

const PRACTICE_METRICS_KEY = ['metrics', 'practice'] as const;
const PEOPLE_METRICS_KEY = ['metrics', 'people'] as const;

export function usePracticeMetrics(enabled = true) {
  return useQuery({
    queryKey: PRACTICE_METRICS_KEY,
    queryFn: () => getJson<PracticeMetrics>('/api/metrics/practice', 'practice'),
    staleTime: 60_000,
    enabled,
  });
}

export function usePeopleMetrics(enabled = true) {
  return useQuery({
    queryKey: PEOPLE_METRICS_KEY,
    queryFn: () => getJson<PersonMetrics[]>('/api/metrics/people', 'people'),
    staleTime: 60_000,
    enabled,
  });
}

export function useAnalyticsMetrics(months: 6 | 12) {
  return useQuery({
    queryKey: ['metrics', 'analytics', months],
    queryFn: () => getJson<AnalyticsMetrics>(`/api/metrics/analytics?months=${months}`, 'analytics'),
    staleTime: 60_000,
  });
}

export function useStepTiming(engagementId: string | undefined, stepId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['metrics', 'step-timing', engagementId, stepId],
    queryFn: async () => {
      const steps = await getJson<Record<string, StepTiming | null>>(
        `/api/engagements/${encodeURIComponent(engagementId!)}/step-timings?stepId=${encodeURIComponent(stepId!)}`,
        'steps',
      );
      return steps[stepId!] ?? null;
    },
    enabled: enabled && Boolean(engagementId && stepId),
    staleTime: 30_000,
  });
}

/** PATCH /api/people/:id/capacity, then refresh every grid that shows load. */
export function useSetCapacity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, capacity }: { profileId: string; capacity: number | null }) =>
      sendJson(`/api/people/${encodeURIComponent(profileId)}/capacity`, 'PATCH', { capacity }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PEOPLE_METRICS_KEY });
    },
  });
}

/** PUT /api/engagements/:id/expected-coi, then refresh the engagement list and practice cards. */
export function useSetExpectedCoi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ engagementId, on }: { engagementId: string; on: string | null }) =>
      sendJson(`/api/engagements/${encodeURIComponent(engagementId)}/expected-coi`, 'PUT', { on }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['engagements'] });
      void queryClient.invalidateQueries({ queryKey: PRACTICE_METRICS_KEY });
    },
  });
}

/** Profile id or intern id → that person's metrics. */
export function indexPeople(people: PersonMetrics[] | undefined) {
  const byProfileId = new Map<string, PersonMetrics>();
  const byInternId = new Map<string, PersonMetrics>();
  for (const person of people ?? []) {
    byProfileId.set(person.profileId, person);
    if (person.internId) byInternId.set(person.internId, person);
  }
  return { byProfileId, byInternId };
}
