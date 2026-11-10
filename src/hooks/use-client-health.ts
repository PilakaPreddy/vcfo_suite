'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HealthBand, HealthSignals } from '@/lib/client-health/score';

const KEY = 'client-health';

/** One client's computed health, as GET /api/client-health returns it (ClientHealthDto). */
export interface ClientHealth {
  engagementId: string;
  companyName: string;
  score: number;
  band: HealthBand;
  effectiveBand: HealthBand;
  signals: HealthSignals;
  computedAt: string;
  previousBand: HealthBand | null;
  override: { band: HealthBand; reason: string | null; byName: string | null; at: string | null } | null;
}

export interface HealthOverrideReview {
  title: string;
  tier: string;
  displayOld: string;
  displayNew: string;
  checks: Array<{ rule: string; ok: boolean; message?: string }>;
  heldReason: string | null;
  canApply: boolean;
}

async function json<T>(res: Response): Promise<T> {
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? String(res.status));
  return out;
}

/**
 * Every client's health in the caller's scope, fetched once and shared by every chip on the page.
 * `enabled` is false for clients, who never see the band.
 */
export function useClientHealthList(enabled = true) {
  return useQuery({
    queryKey: [KEY],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<ClientHealth[]> => (await json<{ items: ClientHealth[] }>(await fetch('/api/client-health', { cache: 'no-store' }))).items ?? [],
  });
}

/** One client's health from the shared list (app engagement id or uuid). */
export function useClientHealth(engagementId: string | null | undefined, enabled = true) {
  const list = useClientHealthList(enabled && Boolean(engagementId));
  const item = useMemo(() => list.data?.find((h) => h.engagementId === engagementId) ?? null, [list.data, engagementId]);
  return { ...list, item };
}

export type HealthOverrideBody = { engagementId: string; band: HealthBand | 'clear'; reason?: string };

/** The card's review, before the person approves (POST without confirm). */
export async function fetchHealthOverrideReview(body: HealthOverrideBody): Promise<HealthOverrideReview> {
  return (
    await json<{ review: HealthOverrideReview }>(
      await fetch('/api/client-health/override', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    )
  ).review;
}

/** The approval click: runs statuses.setClientHealth as the signed-in person. */
export function useSetHealthOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: HealthOverrideBody) =>
      json<{ summary: string }>(
        await fetch('/api/client-health/override', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, confirm: true }) }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
