'use client';

import { isLeadOnlyField } from '@/lib/incorporation/pre-inc-direct-flow';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { StepMark } from '@/components/ui/step-track';
import { useApp } from '@/context/AppContext';
import { fieldStatePresentation, type StepFieldAction, type StepFieldState } from '@/lib/steps/field-states';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';

/**
 * PER-FIELD REVIEW on a staff step page (prototype step Forms tab, S-496 to S-499).
 *
 * Each field shows a 20px ST5 mark (accepted done, asked teal, review amber, sent back red, not
 * asked dashed) and a 104px chip ("Asked · 3d", "Review", "Accepted", "Sent back"). The actions
 * follow the state: "Ask client" on a field not asked, "Send reminder" on an asked field (it posts
 * one message on the client thread), "Accept" and "Reject" on a field under review, "Ask again" on
 * a field sent back. The data is `step_field_states` through
 * `/api/engagements/:id/field-states`, which scopes by role; one query per step feeds every
 * field. Staff only: a client session renders nothing.
 */

const CHIP_TONE: Record<StepFieldState['state'], ChipTone> = { asked: 'teal', answered: 'warn', approved: 'ok', sent_back: 'bad' };

const STAFF = new Set(['super_admin', 'admin', 'manager', 'intern']);

function key(engagementId: string, itemId: string) {
  return ['step-field-states', engagementId, itemId] as const;
}

export function useStepFieldStates(engagementId: string | undefined, itemId: string, enabled = true) {
  return useQuery({
    queryKey: key(engagementId ?? '', itemId),
    enabled: Boolean(engagementId) && enabled,
    queryFn: async (): Promise<StepFieldState[]> => {
      const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId!)}/field-states?itemId=${encodeURIComponent(itemId)}`);
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; states?: StepFieldState[] };
      if (!res.ok || !out.ok) throw new Error('Could not load the field states');
      return out.states ?? [];
    },
    staleTime: 30_000,
  });
}

function useIsStaff(): boolean {
  const { user } = useApp();
  return Boolean(user?.role && STAFF.has(user.role));
}

function useFieldState(engagementId: string | undefined, itemId: string, fieldId: string) {
  const staff = useIsStaff();
  const q = useStepFieldStates(engagementId, itemId, staff);
  return { staff, loaded: q.isSuccess, state: q.data?.find((s) => s.fieldId === fieldId) ?? null };
}

/** The 20px ST5 mark before a field's label. */
export function FieldReviewMark({ engagementId, itemId, fieldId }: { engagementId?: string; itemId: string; fieldId: string }) {
  const { staff, loaded, state } = useFieldState(engagementId, itemId, fieldId);
  if (!staff || !engagementId || !loaded) return null;
  const p = fieldStatePresentation(state);
  return <StepMark state={p.mark} tone={p.tone} size={20} label={p.chip ?? 'Not asked'} />;
}

/** The chip and the state's actions at the right of a field's label. */
export function FieldReviewControls({
  engagementId,
  itemId,
  fieldId,
  label,
}: {
  engagementId?: string;
  itemId: string;
  fieldId: string;
  label: string;
}) {
  const queryClient = useQueryClient();
  const { staff, loaded, state } = useFieldState(engagementId, itemId, fieldId);
  const run = useMutation({
    mutationFn: async (action: StepFieldAction) => {
      const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId!)}/field-states`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, fieldId, action, label }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) throw new Error(out.error || 'Could not save');
      return action;
    },
    onSuccess: (action) => {
      void queryClient.invalidateQueries({ queryKey: key(engagementId!, itemId) });
      if (action === 'remind') toastSuccess('Reminder sent', label);
    },
    onError: (err) => toastError('Could not update the field', errorMessage(err)),
  });
  if (!staff || !engagementId || !loaded) return null;
  // The project lead's own fields (Part A NIC codes) are never asked of the client.
  if (isLeadOnlyField(itemId, fieldId)) return null;

  const p = fieldStatePresentation(state);
  const busy = run.isPending;
  const btn = 'h-7 px-2.5 text-[12px]';
  return (
    <span className="flex flex-none items-center gap-1.5">
      {state?.state === 'asked' ? (
        <Button type="button" size="sm" variant="outline" className={btn} disabled={busy} onClick={() => run.mutate('remind')}>
          Send reminder
        </Button>
      ) : null}
      {state?.state === 'answered' ? (
        <>
          <Button type="button" size="sm" variant="soft" className={btn} disabled={busy} onClick={() => run.mutate('approve')}>
            Accept
          </Button>
          <Button type="button" size="sm" variant="outline" className={`${btn} text-danger`} disabled={busy} onClick={() => run.mutate('send_back')}>
            Reject
          </Button>
        </>
      ) : null}
      {!state || state.state === 'sent_back' ? (
        <Button type="button" size="sm" variant="ghost" className={btn} disabled={busy} onClick={() => run.mutate('ask')}>
          {state ? 'Ask again' : 'Ask client'}
        </Button>
      ) : null}
      {p.chip ? (
        <Chip fixed tone={CHIP_TONE[state?.state ?? 'asked']}>
          {p.chip}
        </Chip>
      ) : null}
    </span>
  );
}
