'use client';

/**
 * The pending timeline change request on Home (prototype inc-timeline.tsx "Change request"
 * popover): who it waits for, the COI it asks for, the reason, and Withdraw (G-08). Withdraw
 * calls `DELETE /api/client/change-requests/:id`, which only works for the person who sent a
 * request that is still pending; it marks the request withdrawn, closes the lead's task and
 * writes an audit event. Someone else's request shows the details without the button.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TimelineRequestDto } from '@/lib/client/client-home';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePortal } from '@/components/client-portal/PortalProvider';
import { HOME_QUERY_KEY } from './useHome';
import { dShort } from './derive';

/** Withdraw the caller's own pending request; returns true when the server accepted it. */
function useWithdrawRequest() {
  const qc = useQueryClient();
  const { toast } = usePortal();
  const [busy, setBusy] = useState(false);
  const withdraw = async (id: string): Promise<boolean> => {
    setBusy(true);
    const res = await fetch(`/api/client/change-requests/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast('Could not withdraw the request. It may already be decided.');
      void qc.invalidateQueries({ queryKey: [HOME_QUERY_KEY] });
      return false;
    }
    toast('Change request withdrawn');
    void qc.invalidateQueries({ queryKey: [HOME_QUERY_KEY] });
    return true;
  };
  return { withdraw, busy };
}

function PendingRequestPopover({
  pending,
  manager,
  trigger,
}: {
  pending: TimelineRequestDto;
  manager: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { withdraw, busy } = useWithdrawRequest();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] max-w-[calc(100vw-32px)] rounded-md border-1.5 border-line bg-surface-raised p-0 text-ink shadow-float">
        <div className="flex h-11 items-center border-b border-line-soft px-4 text-[14px] font-medium">Change request</div>
        <dl className="grid gap-2 px-4 py-3 text-[13px]">
          <div>
            <dt className="text-[12px] text-ink-muted">Waiting for</dt>
            <dd className="font-medium">{manager}</dd>
          </div>
          {pending.coiTo ? (
            <div>
              <dt className="text-[12px] text-ink-muted">COI</dt>
              <dd>{pending.coiFrom ? `${dShort(pending.coiFrom)} → ${dShort(pending.coiTo)}` : dShort(pending.coiTo)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[12px] text-ink-muted">Reason</dt>
            <dd className="break-words">{pending.reason}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Sent</dt>
            <dd>
              {dShort(pending.createdAt.slice(0, 10))}
              {pending.requestedByName ? ` · ${pending.requestedByName}` : ''}
            </dd>
          </div>
        </dl>
        {pending.mine ? (
          <div className="flex justify-end border-t border-line-soft px-4 py-2.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void withdraw(pending.id).then((ok) => {
                  if (ok) setOpen(false);
                })
              }
            >
              {busy ? 'Withdrawing…' : 'Withdraw'}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** The amber "Request pending · COI date" pill that opens the popover (Home and Incorporation timelines). */
export function PendingRequestChip({ pending, manager }: { pending: TimelineRequestDto; manager: string }) {
  return (
    <PendingRequestPopover
      pending={pending}
      manager={manager}
      trigger={
        <button
          type="button"
          aria-label={`Change request pending, waiting for ${manager}`}
          className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-warning-soft px-2 text-[12px] font-medium text-warning"
        >
          <i className="h-1.5 w-1.5 rounded-[2px] bg-current" aria-hidden />
          <span className="hidden sm:inline">Request pending{pending.coiTo ? ' · ' : ''}</span>
          {pending.coiTo ? `COI ${dShort(pending.coiTo)}` : null}
        </button>
      }
    />
  );
}
