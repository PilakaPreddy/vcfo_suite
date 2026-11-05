'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';

/** The escalation shape `/api/super/escalations` returns (`src/db/repositories/escalations.ts`). */
export interface EscalationRow {
  id: string;
  engagementId: string;
  companyName: string;
  reason: string;
  status: 'open' | 'resolved';
  raisedById: string | null;
  raisedByName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

const ESCALATIONS_QUERY_KEY = ['escalations'] as const;

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/** Escalations the caller may see; `engagementId` narrows to one client. */
export function useEscalations(options: { status?: 'open' | 'resolved' | 'all'; engagementId?: string } = {}) {
  const status = options.status ?? 'all';
  return useQuery({
    queryKey: [...ESCALATIONS_QUERY_KEY, status, options.engagementId ?? null],
    queryFn: async () => {
      const qs = new URLSearchParams({ status });
      if (options.engagementId) qs.set('engagementId', options.engagementId);
      return (await json<{ escalations: EscalationRow[] }>(await fetch(`/api/super/escalations?${qs}`))).escalations;
    },
    staleTime: 30_000,
  });
}

export function useRaiseEscalation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { engagementId: string; reason: string; assignedTo?: string | null }) =>
      json<{ escalation: EscalationRow }>(
        await fetch('/api/super/escalations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: async () => {
      toastSuccess('Escalated');
      await queryClient.invalidateQueries({ queryKey: ESCALATIONS_QUERY_KEY });
    },
    onError: (err) => toastError('Could not escalate', errorMessage(err)),
  });
}

export function useResolveEscalation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; note: string }) =>
      json<{ escalation: EscalationRow }>(
        await fetch(`/api/super/escalations/${encodeURIComponent(input.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'resolved', note: input.note }),
        }),
      ),
    onSuccess: async (data) => {
      toastSuccess(`Escalation resolved: ${data.escalation.companyName}`);
      await queryClient.invalidateQueries({ queryKey: ESCALATIONS_QUERY_KEY });
    },
    onError: (err) => toastError('Could not resolve', errorMessage(err)),
  });
}
