'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComplianceEventKind } from '@/data/event-triggers';

const KEY = 'compliance-events';

/** One company event, as GET /api/compliance-events returns it (ComplianceEventDto). */
export interface ComplianceEvent {
  id: string;
  engagementId: string;
  engagementSlug: string | null;
  companyName: string;
  kind: ComplianceEventKind;
  label: string;
  form: string;
  occurredOn: string;
  dueOn: string;
  details: Record<string, string>;
  source: 'manual' | 'ask' | 'record_change' | 'board_meeting';
  status: 'proposed' | 'tracked' | 'done' | 'dismissed';
  taskId: string | null;
  taskKind: 'compliance' | 'work' | null;
  requestListId: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface EventRuleSummary {
  kind: ComplianceEventKind;
  label: string;
  form: string;
  days: number;
  detailKeys: string[];
}

/** The input of the `filing.recordEvent` action. */
export interface RecordEventInput {
  engagementId: string;
  kind: ComplianceEventKind;
  occurredOn: string;
  details?: Record<string, string>;
  eventId?: string;
  source?: ComplianceEvent['source'];
  value?: string;
}

export interface EventReview {
  title: string;
  tier: string;
  summary: string;
  checks: Array<{ rule: string; ok: boolean; message?: string }>;
  heldReason: string | null;
}

async function json<T>(res: Response): Promise<T> {
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? String(res.status));
  return out;
}

/** Events in the caller's scope with the rule table. */
export function useComplianceEvents() {
  return useQuery({
    queryKey: [KEY],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => json<{ events: ComplianceEvent[]; rules: EventRuleSummary[] }>(await fetch('/api/compliance-events', { cache: 'no-store' })),
  });
}

/** The review card for an event: read only. */
export async function fetchEventReview(input: RecordEventInput): Promise<EventReview> {
  const res = await fetch('/api/compliance-events/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  return (await json<{ review: EventReview }>(res)).review;
}

/** The approval click: the action's checks run again, then it records the event. */
export function useConfirmEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordEventInput) =>
      json<{ ok: true; summary: string }>(
        await fetch('/api/compliance-events/review', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input, confirm: true }),
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useSetEventStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: 'done' | 'dismissed' | 'proposed' }) =>
      json<{ event: ComplianceEvent }>(
        await fetch(`/api/compliance-events/${encodeURIComponent(input.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: input.status }),
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
