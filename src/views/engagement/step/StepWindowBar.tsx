'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NoirDatePicker } from '@/components/noir/NoirDatePicker';
import { toastSaved } from '@/components/ui/toast-saved';
import { isValidWindowRange } from '@/lib/projects/schedule-windows';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { sep } from '@/lib/date-format';

type WindowValue = { from: string; to: string } | null | undefined;

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "14 Oct" from an ISO calendar date (R-29: plain dates). */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // R-29: "26 Sep", never the en-GB "26 Sept".
  return Number.isNaN(d.getTime()) ? iso : sep(DAY_MONTH.format(d));
}

/**
 * The step's window bar (prototype `StepView`, S-489): a 1.5px bordered bar with the calendar
 * icon, "Window", "From 14 Oct → To 21 Oct", the "Open in document pack" link on the SPICe+
 * steps and, at the right, whatever the step adds (Copy for Assist).
 *
 * The dates are the manager-set window (`windowForStep`). Only a manager, admin or super admin
 * sees "Edit" (`canEdit`, from `canSetScheduleWindows`); the save goes through the existing
 * schedule route, which checks the same rule in the repository. Leads read the dates. An unset
 * window is normal and reads "Not set".
 */
export function StepWindowBar({
  value,
  canEdit,
  editSub,
  scopeLabel,
  onSave,
  docPackHref,
  trailing,
  className,
}: {
  value: WindowValue;
  canEdit: boolean;
  /** Dialog sub line, such as "Step 4 · Larkspur Analytics". */
  editSub: string;
  /** What the window covers when it is not the step's own ("SPICe+ Part A and Part B"). */
  scopeLabel?: string;
  /** `null` clears. Throw to keep the dialog open. */
  onSave: (window: { from: string; to: string } | null) => Promise<void>;
  docPackHref?: string | null;
  trailing?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value?.from ?? '');
  const [to, setTo] = useState(value?.to ?? '');
  const [busy, setBusy] = useState(false);
  const valid = isValidWindowRange(from, to);

  const commit = async (next: { from: string; to: string } | null) => {
    setBusy(true);
    try {
      await onSave(next);
      toastSaved(next ? 'Window saved' : 'Window cleared', {
        sub: next ? 'The client sees the new date.' : undefined,
        id: 'step-window',
      });
      setOpen(false);
    } catch (err) {
      toastError('Could not save the window', errorMessage(err, 'Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-md border-1.5 border-line bg-surface-raised px-4 py-2.5',
        className,
      )}
      role="group"
      aria-label="Step window"
    >
      <Calendar size={15} strokeWidth={1.6} className="text-ink-muted" aria-hidden />
      <span className="text-[13px] text-ink-muted">Window</span>
      {value ? (
        <>
          <span className="text-[14px] font-medium tabular-nums text-ink">From {shortDate(value.from)}</span>
          <span className="text-ink-muted" aria-hidden>
            →
          </span>
          <span className="text-[14px] font-medium tabular-nums text-ink">To {shortDate(value.to)}</span>
        </>
      ) : (
        <span className="text-[14px] text-ink-muted">Not set</span>
      )}
      {canEdit ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setFrom(value?.from ?? '');
            setTo(value?.to ?? '');
            setOpen(true);
          }}
        >
          {value ? 'Edit' : 'Set window'}
        </Button>
      ) : null}
      {docPackHref ? (
        <Link href={docPackHref} className="text-[13px] font-medium text-brand-text hover:underline">
          Open in document pack →
        </Link>
      ) : null}
      {trailing ? <span className="ml-auto flex items-center gap-2">{trailing}</span> : null}

      {canEdit ? (
        <Dialog open={open} onOpenChange={(next) => (!busy ? setOpen(next) : undefined)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-medium">Edit the window</DialogTitle>
              <p className="text-[13px] text-ink-muted">
                {editSub}
                {scopeLabel ? ` · ${scopeLabel}` : ''}
              </p>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 text-[13px] font-medium text-ink">
                <span id="step-window-from-label">From</span>
                <NoirDatePicker id="step-window-from" value={from} onChange={setFrom} describedBy="step-window-from-label" />
              </div>
              <div className="grid gap-1.5 text-[13px] font-medium text-ink">
                <span id="step-window-to-label">To</span>
                <NoirDatePicker id="step-window-to" value={to} onChange={setTo} describedBy="step-window-to-label" />
              </div>
            </div>
            {from && to && !valid ? (
              <p className="text-[12px] text-danger">The end date must not be before the start.</p>
            ) : null}
            <DialogFooter className="gap-2">
              {value ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  className="mr-auto text-ink-muted"
                  onClick={() => void commit(null)}
                >
                  Clear
                </Button>
              ) : null}
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy || !valid} onClick={() => void commit({ from, to })}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
