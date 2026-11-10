'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExpiryBand, ExpiryKind } from '@/lib/expiries/model';

const KEY = 'expiries';

/** One row of the expiry register, as GET /api/expiries returns it (ExpiryItemDto). */
export interface ExpiryItem {
  id: string;
  engagementId: string;
  companyName: string;
  subjectKind: 'person' | 'company';
  subjectName: string;
  kind: ExpiryKind;
  kindLabel: string;
  referenceLabel: string | null;
  expiresOn: string;
  daysLeft: number;
  band: ExpiryBand;
  source: 'checklist' | 'registration' | 'manual' | 'ask';
  renewedAt: string | null;
  notes: string | null;
  lastAlertStage: number | null;
  requestListId: string | null;
  updatedAt: string;
}

async function json<T>(res: Response): Promise<T> {
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? String(res.status));
  return out;
}

/** The expiry register in the caller's scope (GET /api/expiries), soonest first. */
export function useExpiries(opts: { withinDays?: number; engagementId?: string | null } = {}) {
  return useQuery({
    queryKey: [KEY, opts.withinDays ?? 'all', opts.engagementId ?? 'scope'],
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<ExpiryItem[]> => {
      const q = new URLSearchParams();
      if (opts.withinDays !== undefined) q.set('withinDays', String(opts.withinDays));
      if (opts.engagementId) q.set('engagementId', opts.engagementId);
      const res = await fetch(`/api/expiries${q.size ? `?${q}` : ''}`, { cache: 'no-store' });
      return (await json<{ items: ExpiryItem[] }>(res)).items ?? [];
    },
  });
}

/** Staff mark an item renewed, with or without the new expiry date. */
export function useMarkRenewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; newExpiresOn?: string | null }): Promise<ExpiryItem> => {
      const res = await fetch(`/api/expiries/${encodeURIComponent(input.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'renew', newExpiresOn: input.newExpiresOn || null }),
      });
      return (await json<{ item: ExpiryItem }>(res)).item;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Staff add an item by hand. */
export function useAddExpiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { engagementId: string; kind: ExpiryKind; subjectName: string; expiresOn: string; referenceLabel?: string | null }): Promise<ExpiryItem> => {
      const res = await fetch('/api/expiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      return (await json<{ item: ExpiryItem }>(res)).item;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
